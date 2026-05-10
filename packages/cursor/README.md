# @userigor/cursor

Cursor adapter for [userigor](https://github.com/Dragoon0x/userigor). Renders active patterns as a `.cursorrules` file (or modern `.cursor/rules/userigor.mdc`), sorted by causal impact.

```bash
npm install -g @userigor/cursor
```

## Usage

```bash
# write .cursorrules in cwd
rigor-cursor

# modern path
rigor-cursor --modern

# print to stdout instead
rigor-cursor --stdout

# filter by language and limit
rigor-cursor --language typescript --max 10
```

## Programmatic

```ts
import { Rigor } from '@userigor/core';
import { renderCursorRules } from '@userigor/cursor';

const rigor = new Rigor({ dbPath: '~/.rigor/data.db' });
rigor.init();

const text = renderCursorRules(rigor.listPatterns(), {
  maxPatterns: 15,
  language: 'typescript',
  repoName: 'my-app'
});
```

## What gets generated

A header noting the file is auto-generated, followed by patterns sorted by `impact_score` then `size`. Each pattern's name, stats, and description are listed in markdown. Patterns with negative impact are excluded by default.

## License

MIT · [Dragoon0x](https://github.com/Dragoon0x)
