import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HybridTfIdfProvider, cosineSimilarity } from '../src/embed/index.js';

test('embed: produces normalized vector of correct dimensions', async () => {
  const p = new HybridTfIdfProvider(128);
  const v = await p.embed('hello world');
  assert.equal(v.length, 128);
  // L2 normalized => magnitude ~1
  const mag = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  assert.ok(Math.abs(mag - 1) < 0.001 || mag === 0);
});

test('embed: identical text produces identical vector', async () => {
  const p = new HybridTfIdfProvider(128);
  const a = await p.embed('rename variable to a domain term');
  const b = await p.embed('rename variable to a domain term');
  for (let i = 0; i < a.length; i++) assert.equal(a[i], b[i]);
});

test('embed: similar text has high cosine similarity', async () => {
  const p = new HybridTfIdfProvider(256);
  const a = await p.embed('rename variable to a domain term');
  const b = await p.embed('renamed variable using domain terminology');
  const c = await p.embed('add error handling for null cases');
  const simAB = cosineSimilarity(a, b);
  const simAC = cosineSimilarity(a, c);
  assert.ok(simAB > simAC, `expected similar pair (${simAB}) > unrelated pair (${simAC})`);
});

test('embed: empty string returns zero vector', async () => {
  const p = new HybridTfIdfProvider(64);
  const v = await p.embed('');
  assert.ok(v.every((x) => x === 0));
});

test('fit + embed: IDF weighting changes vectors meaningfully', async () => {
  const p = new HybridTfIdfProvider(256);
  p.fit([
    'rename variable to better name',
    'rename variable to clearer name',
    'rename function to verb form',
    'add tests for edge cases',
    'fix typo in comment'
  ]);
  const v = await p.embed('rename variable to specific name');
  assert.equal(v.length, 256);
  assert.ok(v.some((x) => x !== 0));
});

test('toJSON / fromJSON: roundtrip preserves embedding behavior', async () => {
  const p = new HybridTfIdfProvider(128);
  p.fit(['hello world', 'goodbye world', 'world peace']);
  const json = p.toJSON();
  const p2 = HybridTfIdfProvider.fromJSON(json);
  const v1 = await p.embed('world test');
  const v2 = await p2.embed('world test');
  for (let i = 0; i < v1.length; i++) {
    assert.ok(Math.abs(v1[i] - v2[i]) < 1e-6);
  }
});

test('cosineSimilarity: identical vectors → 1', () => {
  const a = [0.5, 0.5, 0.5, 0.5];
  assert.ok(Math.abs(cosineSimilarity(a, a) - 1) < 1e-6);
});

test('cosineSimilarity: orthogonal vectors → 0', () => {
  const a = [1, 0];
  const b = [0, 1];
  assert.ok(Math.abs(cosineSimilarity(a, b)) < 1e-6);
});
