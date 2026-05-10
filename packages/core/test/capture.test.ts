import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCorrection, correctionEmbedText } from '../src/capture/index.js';

test('buildCorrection: returns null for identical inputs', () => {
  const r = buildCorrection({
    before: 'same',
    after: 'same',
    repo: 'r',
    file_path: 'f.ts',
    agent: 'claude-code'
  });
  assert.equal(r, null);
});

test('buildCorrection: produces a valid correction', () => {
  const r = buildCorrection({
    before: 'const data = fetch();',
    after: 'const userResponse = fetch();',
    repo: 'myrepo',
    file_path: 'src/api.ts',
    agent: 'claude-code',
    task_description: 'Improve naming'
  });
  assert.ok(r);
  assert.equal(r.repo, 'myrepo');
  assert.equal(r.language, 'typescript');
  assert.equal(r.agent, 'claude-code');
  assert.equal(r.status, 'captured');
  assert.equal(r.embedding, null);
  assert.ok(r.diff_size > 0);
  assert.ok(r.id.length > 0);
});

test('buildCorrection: computes velocity from emission timestamps', () => {
  const emitted = Date.now() - 60_000;
  const committed = Date.now();
  const r = buildCorrection({
    before: 'a',
    after: 'b',
    repo: 'r',
    file_path: 'f.ts',
    agent: 'claude-code',
    ai_emitted_at: emitted,
    committed_at: committed
  });
  assert.ok(r);
  assert.ok(r.correction_velocity_seconds! >= 59);
  assert.ok(r.correction_velocity_seconds! <= 61);
});

test('correctionEmbedText: includes language, file, diff', () => {
  const c = buildCorrection({
    before: 'a',
    after: 'b',
    repo: 'r',
    file_path: 'src/foo.ts',
    agent: 'claude-code',
    task_description: 'Test task'
  })!;
  const text = correctionEmbedText(c);
  assert.match(text, /lang: typescript/);
  assert.match(text, /file: foo\.ts/);
  assert.match(text, /Test task/);
  assert.match(text, /diff:/);
});
