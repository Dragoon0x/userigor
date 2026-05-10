# @userigor/claude-code

Claude Code adapter for [userigor](https://github.com/Dragoon0x/userigor). Bundles a SKILL.md, slash commands, and example MCP / PostToolUse hook configs for drop-in installation into `~/.claude/`.

```bash
npm install -g @userigor/claude-code
rigor-claude-code-install
```

## What gets installed

```
~/.claude/skills/userigor/SKILL.md           Skill that teaches Claude when to recall/capture
~/.claude/commands/rigor-recall.md           /rigor-recall <task>
~/.claude/commands/rigor-metrics.md          /rigor-metrics [days]
~/.claude/commands/rigor-patterns.md         /rigor-patterns [status]
~/.claude/rigor/mcp.example.json             paste into settings.json to register the MCP server
~/.claude/rigor/hooks.settings.example.json  optional PostToolUse hook for auto-capture
```

The installer copies templates only. It never modifies `~/.claude/settings.json` directly — copy from the example files when you're ready.

## After installing

1. Add the MCP server registration from `~/.claude/rigor/mcp.example.json` to your `~/.claude/settings.json`.
2. (Optional) Add the hook from `~/.claude/rigor/hooks.settings.example.json` if you want auto-capture on every Edit/Write.
3. Run `rigor init` and `rigor backfill` from `@userigor/cli` to seed the pattern library.

## Programmatic use

```ts
import { TEMPLATE_PATHS, readTemplate } from '@userigor/claude-code';

const skill = readTemplate('skill');     // SKILL.md text
const cmd   = readTemplate('recallCommand');
```

## License

MIT · [Dragoon0x](https://github.com/Dragoon0x)
