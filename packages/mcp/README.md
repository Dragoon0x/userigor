# @userigor/mcp

[Model Context Protocol](https://modelcontextprotocol.io) server for [userigor](https://github.com/Dragoon0x/userigor). Exposes the rigor engine as MCP tools so any MCP-aware agent (Claude Code, Cursor, custom clients) can recall patterns pre-flight, capture corrections, and read metrics.

```bash
npm install -g @userigor/mcp
```

## Tools exposed

| Tool | Purpose |
|---|---|
| `rigor_recall` | Top patterns relevant to a prompt. Read-only. Use BEFORE generating. |
| `rigor_capture` | Capture a correction (before, after, file, agent, task). |
| `rigor_cluster` | Re-cluster all corrections. Idempotent. |
| `rigor_metrics` | Current snapshot for the last N days. |
| `rigor_patterns` | List patterns, optionally filtered by status. |
| `rigor_pattern_detail` | One pattern + causal evidence (FTA delta). |
| `rigor_status` | Counts, db path, agent, repo. |

## Register with Claude Code

In `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "userigor": {
      "command": "npx",
      "args": ["-y", "@userigor/mcp"]
    }
  }
}
```

## Programmatic use

```ts
import { createServer } from '@userigor/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = createServer({ dbPath: '~/.rigor/data.db' });
await server.connect(new StdioServerTransport());
```

## License

MIT · [Dragoon0x](https://github.com/Dragoon0x)
