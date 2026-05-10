import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCursorRules } from '../src/render.js';
import type { Pattern } from '@userigor/core';

function p(over: Partial<Pattern> = {}): Pattern {
  return {
    id: 'p',
    created_at: 0,
    updated_at: 0,
    name: 'lang:topic',
    description: 'pattern description',
    member_correction_ids: [],
    size: 3,
    density: 0.6,
    centroid: [],
    status: 'active',
    injection_count: 0,
    impact_score: 0,
    repos: ['r'],
    languages: ['typescript'],
    notes: null,
    ...over
  };
}

test('renderCursorRules: empty input produces a usable empty file', () => {
  const out = renderCursorRules([]);
  assert.match(out, /auto-generated/);
  assert.match(out, /No active patterns/);
});

test('renderCursorRules: includes only active by default', () => {
  const out = renderCursorRules([
    p({ name: 'on', status: 'active' }),
    p({ name: 'off', status: 'retired' })
  ]);
  assert.match(out, /on/);
  assert.doesNotMatch(out, /## .* off/);
});

test('renderCursorRules: filters by language', () => {
  const out = renderCursorRules(
    [
      p({ name: 'ts-pattern', languages: ['typescript'] }),
      p({ name: 'py-pattern', languages: ['python'] })
    ],
    { language: 'python' }
  );
  assert.match(out, /py-pattern/);
  assert.doesNotMatch(out, /ts-pattern/);
});

test('renderCursorRules: sorts by impact then size', () => {
  const out = renderCursorRules([
    p({ name: 'zlowzz', impact_score: 0.01, size: 5 }),
    p({ name: 'zhighzz', impact_score: 0.5, size: 3 }),
    p({ name: 'zmidzz', impact_score: 0.1, size: 4 })
  ]);
  const highIdx = out.indexOf('zhighzz');
  const midIdx = out.indexOf('zmidzz');
  const lowIdx = out.indexOf('zlowzz');
  assert.ok(highIdx < midIdx, 'high should appear before mid');
  assert.ok(midIdx < lowIdx, 'mid should appear before low');
});

test('renderCursorRules: caps at maxPatterns', () => {
  const arr: Pattern[] = [];
  for (let i = 0; i < 25; i++) arr.push(p({ name: `pattern-${i}`, impact_score: 25 - i }));
  const out = renderCursorRules(arr, { maxPatterns: 5 });
  const matches = out.match(/^## /gm);
  assert.equal(matches?.length, 5);
});

test('renderCursorRules: excludes negative impact by default', () => {
  const out = renderCursorRules([
    p({ name: 'positive', impact_score: 0.1 }),
    p({ name: 'negative', impact_score: -0.05 })
  ]);
  assert.match(out, /positive/);
  assert.doesNotMatch(out, /negative/);
});
