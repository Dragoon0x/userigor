import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';
import { table, pct, bar, c } from '../src/output.js';

test('parseArgs: basic command', () => {
  const r = parseArgs(['node', 'rigor', 'init']);
  assert.equal(r.command, 'init');
  assert.equal(r.subcommand, null);
  assert.deepEqual(r.positionals, []);
});

test('parseArgs: --key value form', () => {
  const r = parseArgs(['node', 'rigor', 'cluster', '--threshold', '0.4']);
  assert.equal(r.command, 'cluster');
  assert.equal(r.flags.threshold, '0.4');
});

test('parseArgs: --key=value form', () => {
  const r = parseArgs(['node', 'rigor', 'cluster', '--threshold=0.4']);
  assert.equal(r.flags.threshold, '0.4');
});

test('parseArgs: boolean flag', () => {
  const r = parseArgs(['node', 'rigor', 'inject', 'do thing', '--dry']);
  assert.equal(r.flags.dry, true);
  assert.equal(r.positionals[0], 'do thing');
});

test('parseArgs: subcommand for patterns', () => {
  const r = parseArgs(['node', 'rigor', 'patterns', 'show', 'p1']);
  assert.equal(r.command, 'patterns');
  assert.equal(r.subcommand, 'show');
  assert.deepEqual(r.positionals, ['p1']);
});

test('parseArgs: subcommand for config', () => {
  const r = parseArgs(['node', 'rigor', 'config', 'set', '--agent', 'cursor']);
  assert.equal(r.command, 'config');
  assert.equal(r.subcommand, 'set');
  assert.equal(r.flags.agent, 'cursor');
});

test('parseArgs: positional after command without subcommand', () => {
  const r = parseArgs(['node', 'rigor', 'inject', 'fix the auth bug']);
  assert.equal(r.command, 'inject');
  assert.equal(r.subcommand, null);
  assert.equal(r.positionals[0], 'fix the auth bug');
});

test('output: pct formats correctly', () => {
  assert.equal(pct(0.5), '50.0%');
  assert.equal(pct(0), '0.0%');
  assert.equal(pct(1), '100.0%');
});

test('output: bar produces visual bar', () => {
  const b = bar(0.5, 1, 10);
  // strip ANSI then check length is 10 visible chars
  const visible = b.replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(visible.length, 10);
});

test('output: table formats rows', () => {
  const t = table([['name', 'count'], ['foo', '3']], { header: true });
  // strip ANSI
  const visible = t.replace(/\x1b\[[0-9;]*m/g, '');
  assert.match(visible, /name/);
  assert.match(visible, /foo/);
  assert.match(visible, /3/);
});

test('output: c.bold returns wrapped string when TTY or unwrapped otherwise', () => {
  // In test runner stdout is usually not a TTY, so c.bold returns plain text.
  // Either way the original text must be present.
  const out = c.bold('hello');
  assert.match(out, /hello/);
});
