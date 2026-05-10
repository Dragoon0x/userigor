import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Rigor } from '../src/index.js';

function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), 'rigor-int-')), 'data.db');
}

test('integration: capture → embed → cluster → metrics → inject', async () => {
  const rigor = new Rigor({ dbPath: tempDb() });
  rigor.init();

  // Capture a few similar corrections (rename data → domain term)
  await rigor.capture({
    before: 'const data = response.json();',
    after: 'const userProfile = response.json();',
    repo: 'app',
    file_path: 'src/api/users.ts',
    agent: 'claude-code',
    task_description: 'rename data to domain term'
  });
  await rigor.capture({
    before: 'const data = parse(input);',
    after: 'const orderRecord = parse(input);',
    repo: 'app',
    file_path: 'src/api/orders.ts',
    agent: 'claude-code',
    task_description: 'rename data to domain term'
  });
  await rigor.capture({
    before: 'let data = read();',
    after: 'let invoiceLine = read();',
    repo: 'app',
    file_path: 'src/api/invoices.ts',
    agent: 'claude-code',
    task_description: 'rename data to domain term'
  });

  // And an unrelated one
  await rigor.capture({
    before: 'if (x) { return; }',
    after: 'if (x === null) { throw new Error("null"); }',
    repo: 'app',
    file_path: 'src/util.ts',
    agent: 'claude-code',
    task_description: 'add error handling'
  });

  // Embed pending (already embedded inline by capture, but call to be sure)
  await rigor.embedPending();

  // Cluster: should produce one pattern of size >= 2 (the rename ones)
  const clusterResult = rigor.cluster({ similarityThreshold: 0.30, minClusterSize: 2 });
  assert.ok(clusterResult.patternsCreated.length >= 1, `expected >= 1 pattern, got ${clusterResult.patternsCreated.length}`);
  const renamePattern = clusterResult.patternsCreated.find((p) => p.size >= 2);
  assert.ok(renamePattern, 'expected to find a rename cluster');

  // Metrics: should reflect 4 corrections, with sample_size 4
  const metrics = rigor.metrics();
  assert.equal(metrics.sample_size, 4);
  assert.ok(metrics.pattern_coverage > 0, 'expected nonzero pattern coverage after clustering');

  // Inject: a similar prompt should pull the rename pattern
  const result = await rigor.inject('rename data variable in this file', { topK: 3, minSimilarity: 0.10 });
  assert.ok(result.patterns.length >= 1, 'expected at least one pattern injected');
  assert.match(result.augmented_prompt, /<rigor:context>/);
  assert.ok(result.tokens_added > 0);

  rigor.close();
});

test('integration: prune retires low-impact patterns', async () => {
  const rigor = new Rigor({ dbPath: tempDb() });
  rigor.init();

  // Insert a pattern manually with high injection count and low impact
  rigor.store.insertPattern({
    id: 'badp',
    created_at: Date.now() - 30 * 24 * 60 * 60 * 1000,
    updated_at: Date.now(),
    name: 'bad-pattern',
    description: 'a pattern that does not help',
    member_correction_ids: [],
    size: 2,
    density: 0.5,
    centroid: [0.1, 0.2, 0.3],
    status: 'active',
    injection_count: 30,
    impact_score: 0.001,
    repos: ['x'],
    languages: ['typescript'],
    notes: null
  });

  const pruneResult = rigor.prune();
  assert.equal(pruneResult.retired, 1);
  const p = rigor.store.getPattern('badp');
  assert.equal(p?.status, 'retired');

  rigor.close();
});
