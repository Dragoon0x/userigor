# Changelog

All notable changes to userigor are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> **Status: experimental · work-in-progress.** Schemas, APIs, CLI flags, and metric definitions may change between any two versions, including patch versions. See [DISCLAIMER.md](./DISCLAIMER.md) before depending on anything here.

## [1.0.1] — 2026-05-22

### Fixed
- Publish-time `workspace:*` resolution. The initial 1.0.0 publish used `npm publish` from each package directory, which does not rewrite `workspace:*` dependency specifiers. The result: installs failed with `EUNSUPPORTEDPROTOCOL Unsupported URL Type "workspace:": workspace:*`. Republished via `pnpm publish` from the repo root, which correctly resolves workspace deps to actual versions.

### Notes
- No code changes. Package contents identical to 1.0.0 except for the rewritten `dependencies` block in each published `package.json`.
- 1.0.0 remains on npm but should not be installed. `latest` points to 1.0.1.

## [1.0.0] — 2026-05-22

### Added
- Initial release. Six packages:
  - `@userigor/core` — engine: capture, embed, cluster, inject, metrics
  - `@userigor/cli` — `rigor` binary, full command surface
  - `@userigor/mcp` — stdio MCP server with seven tools
  - `@userigor/claude-code` — SKILL.md, slash commands, hook configs
  - `@userigor/cursor` — `.cursorrules` and `.cursor/rules/*.mdc` generator
  - `@userigor/dashboard` — localhost web console
- SQLite store at `~/.rigor/data.db` with vector BLOBs and cosine similarity.
- Default `HybridTfIdfProvider` embedder (zero external deps) plus optional `OpenAIEmbeddingProvider`.
- Six engine metrics: `first_try_acceptance`, `edit_after_accept`, `revert_rate`, `correction_velocity`, `drift_distance`, `pattern_coverage`.
- Pattern impact scoring with automatic retirement of low-impact patterns.
- GitHub Pages landing site at [dragoon0x.github.io/userigor](https://dragoon0x.github.io/userigor/).
