import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteStore } from '../src/store/index.js';
import type { Correction, Pattern } from '../src/types.js';

function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), 'rigor-test-')), 'data.db');
}

function makeCorrection(overrides: Partial<Correction> = {}): Correction {
  return {
    id: 'c-' + Math.random().toString(36).slice(2),
    created_at: Date.now(),
    repo: 'test-repo',
    file_path: 'src/foo.ts',
    language: 'typescript',
    before: 'before',
    after: 'after',
    diff: '@@\n-before\n+after',
    diff_size: 2,
    task_description: 'task',
    agent: 'claude-code',
    embedding: null,
    cluster_id: null,
    status: 'captured',
    accepted_first_try: false,
    edit_after_accept_lines: 0,
    correction_velocity_seconds: 30,
    ...overrides
  };
}

test('store: insert and retrieve correction', () => {
  const store = new SqliteStore(tempDb());
  store.init();
  const c = makeCorrection();
  store.insertCorrection(c);
  const retrieved = store.getCorrection(c.id);
  assert.ok(retrieved);
  assert.equal(retrieved.id, c.id);
  assert.equal(retrieved.before, 'before');
  assert.equal(retrieved.after, 'after');
  store.close();
});

test('store: embedding roundtrip preserves values', () => {
  const store = new SqliteStore(tempDb());
  store.init();
  const c = makeCorrection();
  store.insertCorrection(c);
  const vec = [0.1, 0.2, 0.3, 0.4];
  store.updateCorrectionEmbedding(c.id, vec);
  const r = store.getCorrection(c.id);
  assert.ok(r);
  assert.ok(r.embedding);
  assert.equal(r.embedding!.length, 4);
  for (let i = 0; i < vec.length; i++) {
    assert.ok(Math.abs(r.embedding![i] - vec[i]) < 1e-5);
  }
  assert.equal(r.status, 'embedded');
  store.close();
});

test('store: list with filters', () => {
  const store = new SqliteStore(tempDb());
  store.init();
  store.insertCorrection(makeCorrection({ id: '1', repo: 'a', agent: 'claude-code' }));
  store.insertCorrection(makeCorrection({ id: '2', repo: 'b', agent: 'cursor' }));
  store.insertCorrection(makeCorrection({ id: '3', repo: 'a', agent: 'cursor' }));
  assert.equal(store.listCorrections({ repo: 'a' }).length, 2);
  assert.equal(store.listCorrections({ agent: 'cursor' }).length, 2);
  assert.equal(store.listCorrections({ repo: 'a', agent: 'claude-code' }).length, 1);
  store.close();
});

test('store: pattern roundtrip', () => {
  const store = new SqliteStore(tempDb());
  store.init();
  const pattern: Pattern = {
    id: 'p1',
    created_at: Date.now(),
    updated_at: Date.now(),
    name: 'typescript:rename-variable',
    description: 'Rename variables to domain terms',
    member_correction_ids: ['c1', 'c2', 'c3'],
    size: 3,
    density: 0.7,
    centroid: [0.1, 0.2, 0.3],
    status: 'active',
    injection_count: 5,
    impact_score: 0.12,
    repos: ['repoA', 'repoB'],
    languages: ['typescript'],
    notes: null
  };
  store.insertPattern(pattern);
  const r = store.getPattern('p1');
  assert.ok(r);
  assert.equal(r.name, pattern.name);
  assert.deepEqual(r.member_correction_ids, pattern.member_correction_ids);
  assert.deepEqual(r.repos, pattern.repos);
  assert.equal(r.injection_count, 5);
  assert.equal(r.centroid.length, 3);
  store.close();
});

test('store: session and injection roundtrip', () => {
  const store = new SqliteStore(tempDb());
  store.init();
  store.insertSession({
    id: 's1',
    started_at: Date.now(),
    ended_at: null,
    agent: 'claude-code',
    repo: 'test',
    task_description: 'do a thing',
    injected_pattern_ids: ['p1', 'p2'],
    correction_ids: []
  });
  store.insertInjection({
    id: 'inj1',
    session_id: 's1',
    pattern_ids: ['p1', 'p2'],
    prompt_before: 'do a thing',
    prompt_after: '<rigor:context>...</rigor:context>\ndo a thing',
    tokens_added: 10,
    timestamp: Date.now()
  });
  const sess = store.getSession('s1');
  assert.ok(sess);
  assert.deepEqual(sess.injected_pattern_ids, ['p1', 'p2']);
  const injs = store.listInjections('s1');
  assert.equal(injs.length, 1);
  assert.deepEqual(injs[0].pattern_ids, ['p1', 'p2']);
  store.close();
});
