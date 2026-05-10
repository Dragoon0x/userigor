import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from '../src/server.js';

function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), 'rigor-dash-')), 'data.db');
}

test('dashboard: serves /api/status with empty store', async () => {
  const running = await startServer({ dbPath: tempDb(), port: 0 });
  const port = (running.server.address() as { port: number }).port;
  const res = await fetch(`http://127.0.0.1:${port}/api/status`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { corrections: number; patterns_total: number };
  assert.equal(body.corrections, 0);
  assert.equal(body.patterns_total, 0);
  await running.close();
});

test('dashboard: /api/metrics returns a snapshot shape', async () => {
  const running = await startServer({ dbPath: tempDb(), port: 0 });
  const port = (running.server.address() as { port: number }).port;
  const res = await fetch(`http://127.0.0.1:${port}/api/metrics`);
  assert.equal(res.status, 200);
  const snap = (await res.json()) as Record<string, unknown>;
  for (const k of [
    'first_try_acceptance',
    'edit_after_accept',
    'revert_rate',
    'correction_velocity',
    'drift_distance',
    'pattern_coverage',
    'sample_size'
  ]) {
    assert.ok(k in snap, `missing key: ${k}`);
  }
  await running.close();
});

test('dashboard: /api/patterns returns an array', async () => {
  const running = await startServer({ dbPath: tempDb(), port: 0 });
  const port = (running.server.address() as { port: number }).port;
  const res = await fetch(`http://127.0.0.1:${port}/api/patterns?status=all`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  await running.close();
});

test('dashboard: /api/series rejects bad metric', async () => {
  const running = await startServer({ dbPath: tempDb(), port: 0 });
  const port = (running.server.address() as { port: number }).port;
  const res = await fetch(`http://127.0.0.1:${port}/api/series?name=not_a_metric&days=7`);
  assert.equal(res.status, 400);
  await running.close();
});

test('dashboard: /api/series returns array for valid metric', async () => {
  const running = await startServer({ dbPath: tempDb(), port: 0 });
  const port = (running.server.address() as { port: number }).port;
  const res = await fetch(`http://127.0.0.1:${port}/api/series?name=first_try_acceptance&days=7`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  await running.close();
});

test('dashboard: /api/patterns/<unknown> returns 404', async () => {
  const running = await startServer({ dbPath: tempDb(), port: 0 });
  const port = (running.server.address() as { port: number }).port;
  const res = await fetch(`http://127.0.0.1:${port}/api/patterns/no-such-pattern`);
  assert.equal(res.status, 404);
  await running.close();
});

test('dashboard: serves index.html at /', async () => {
  const running = await startServer({ dbPath: tempDb(), port: 0 });
  const port = (running.server.address() as { port: number }).port;
  const res = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /userigor/);
  assert.match(text, /<html/);
  await running.close();
});

test('dashboard: rejects path traversal', async () => {
  const running = await startServer({ dbPath: tempDb(), port: 0 });
  const port = (running.server.address() as { port: number }).port;
  const res = await fetch(`http://127.0.0.1:${port}/../package.json`);
  // node's http normalizes the URL, but our handler also checks for '..'
  // Should never serve outside staticDir.
  assert.notEqual(res.status, 200);
  await running.close();
});
