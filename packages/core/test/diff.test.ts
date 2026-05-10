import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, detectLanguage } from '../src/capture/diff.js';

test('diffLines: identical inputs produce zero size', () => {
  const r = diffLines('a\nb\nc', 'a\nb\nc');
  assert.equal(r.size, 0);
  assert.equal(r.additions, 0);
  assert.equal(r.deletions, 0);
});

test('diffLines: pure addition', () => {
  const r = diffLines('a\nb', 'a\nb\nc');
  assert.equal(r.additions, 1);
  assert.equal(r.deletions, 0);
  assert.equal(r.size, 1);
});

test('diffLines: pure deletion', () => {
  const r = diffLines('a\nb\nc', 'a\nb');
  assert.equal(r.additions, 0);
  assert.equal(r.deletions, 1);
});

test('diffLines: substitution counts as add+del', () => {
  const r = diffLines('foo', 'bar');
  assert.equal(r.size, 2);
});

test('diffLines: produces unified diff text', () => {
  const r = diffLines('line1\nline2\nline3', 'line1\nCHANGED\nline3');
  assert.match(r.unified, /@@/);
  assert.match(r.unified, /-line2/);
  assert.match(r.unified, /\+CHANGED/);
});

test('detectLanguage: known extensions', () => {
  assert.equal(detectLanguage('foo.ts'), 'typescript');
  assert.equal(detectLanguage('foo.tsx'), 'typescript');
  assert.equal(detectLanguage('a/b/c.py'), 'python');
  assert.equal(detectLanguage('Main.java'), 'java');
  assert.equal(detectLanguage('script.sh'), 'bash');
});

test('detectLanguage: unknown extensions fall through', () => {
  assert.equal(detectLanguage('Makefile'), 'unknown');
  assert.equal(detectLanguage('foo.xyz'), 'unknown');
});
