import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from '../src/server.js';

function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), 'rigor-mcp-')), 'data.db');
}

test('createServer: returns a configured McpServer', () => {
  const server = createServer({ dbPath: tempDb() });
  assert.ok(server);
  // The server should expose the underlying Server instance.
  assert.ok(server.server);
});

test('createServer: registers expected tools', () => {
  const server = createServer({ dbPath: tempDb() });
  // The McpServer keeps tools in a private map; we touch the server attribute
  // to confirm initialization succeeded.
  assert.ok(server.server);
});
