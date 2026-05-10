/**
 * @userigor/mcp library exports.
 *
 * Programmatic embedding: `createServer()` returns a configured McpServer
 * that you can connect to any transport. The `rigor-mcp` binary uses
 * StdioServerTransport, which is the standard for Claude Code & Cursor.
 */
export { createServer } from './server.js';
