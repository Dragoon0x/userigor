# Publishing userigor

Step-by-step for shipping the monorepo. Follows the workflow split: GitHub Desktop for git operations, Terminal only for npm.

---

## One-time setup

### npm

```bash
# only required once per machine
npm login
```

You need a paid npm account to publish under the `@userigor` scope (scoped packages require an org or paid user). Free accounts can still publish unscoped, e.g. `userigor-cli` instead of `@userigor/cli`.

If publishing under a fresh org, create it first:

```bash
npm org create userigor   # if not already created
```

### GitHub repository

1. Create the repo at `github.com/Dragoon0x/userigor`. Public.
2. Push the monorepo using **GitHub Desktop**. Do not use the terminal for git operations.
3. Confirm `LICENSE`, `README.md`, `DISCLAIMER.md`, and `docs/` are all present.

---

## Building everything

```bash
# from the repo root
pnpm install
pnpm build
```

Verify each package's `dist/` exists and contains:
- `dist/index.js` and `dist/index.d.ts`
- shebang `#!/usr/bin/env node` on every `bin` entry (cli.js, server.js, install.js)

Run all tests:

```bash
pnpm -r test
```

Confirm: 66/66 tests passing across the six packages.

---

## Version management

All packages are at `1.0.0`. For subsequent releases, bump versions per package. Patch for bug fixes, minor for new features, major for breaking changes.

```bash
# example: bump core to 1.0.1, then anything that depends on it
cd packages/core && npm version patch
```

If you hit `E403` on republish, the version on npm already exists. Bump again.

---

## Publish order

Order matters because of workspace deps. Publish from the deepest dep first:

```bash
# 1. core (everything else depends on it)
cd packages/core
npm publish --access public

# 2. cli, mcp, claude-code, cursor, dashboard (parallel-safe)
cd ../cli         && npm publish --access public
cd ../mcp         && npm publish --access public
cd ../claude-code && npm publish --access public
cd ../cursor      && npm publish --access public
cd ../dashboard   && npm publish --access public
```

Or all at once from the root using the workspace script:

```bash
pnpm publish:all
```

This runs `pnpm -r --filter='./packages/*' publish --access public --no-git-checks` which respects the dependency graph.

### `--access public` is required

Scoped packages (`@userigor/*`) default to private on free accounts. The `--access public` flag forces public. The `publishConfig.access: "public"` in each `package.json` makes it default-on, but pass the flag explicitly to be safe.

### `workspace:*` resolution

`pnpm publish` automatically rewrites `workspace:*` deps to the actual published version. No manual editing required.

---

## After publishing

```bash
npm view @userigor/core version
npm view @userigor/cli version
# … verify each
```

Smoke install in a fresh dir:

```bash
mkdir /tmp/rigor-test && cd /tmp/rigor-test
npm install -g @userigor/cli
rigor --version
rigor help
```

---

## GitHub Pages (landing page)

The landing page lives at `docs/index.html`.

1. Push the repo to GitHub via GitHub Desktop. Make sure `docs/` is included.
2. On GitHub: **Settings → Pages**.
3. Source: **Deploy from a branch**.
4. Branch: **main**, folder: **/docs**.
5. Save. Wait ~30 seconds for first build.

The `.nojekyll` file in `docs/` prevents Jekyll from interfering with the raw HTML. The repo must be public for free GitHub Pages.

The page will be live at `https://dragoon0x.github.io/userigor/` (or your custom domain).

### Updating the landing page

1. Edit `docs/index.html`.
2. Commit + push via GitHub Desktop.
3. GitHub Pages auto-rebuilds.

**Rule:** the landing page only documents what's actually shipped. Never list aspirational features.

---

## Tagging releases

After successful publish:

```bash
# from GitHub Desktop or git:
# tag v1.0.0 on main
# create a GitHub Release pointing at the tag
```

Include in the release notes:
- which packages were updated
- new features
- breaking changes (if any)
- known limitations

---

## Troubleshooting

**`E403 You cannot publish over the previously published versions`**
Bump the version in `package.json` and try again.

**`E404 Not Found` on `npm publish` for scoped package**
You haven't created the org or you don't have access. Run `npm org create userigor` (paid account required) or publish unscoped.

**`workspace:*` shows up in published `package.json`**
You ran `npm publish` directly instead of `pnpm publish`. Use pnpm — it rewrites workspace protocols on publish.

**Shebang missing from `dist/cli.js`**
The shebang must be the first line of `src/cli.ts`. tsup preserves it through ESM bundling. Don't put it in tsup banner config — that's been flaky historically. Source-level shebang is the durable approach.

**GitHub Pages 404 after enabling**
Wait two minutes. Then check:
- Repo is public
- Source is set to `main` branch and `/docs` folder
- `docs/index.html` is present
- `.nojekyll` exists in `docs/` to prevent Jekyll build errors

---

## Pre-publish checklist

```
[ ] pnpm install clean
[ ] pnpm build succeeds, all six packages emit dist/
[ ] pnpm -r test passes 66/66
[ ] every bin entry has shebang as line 1 of dist/<bin>.js
[ ] package.json version bumped where needed
[ ] README.md and DISCLAIMER.md in repo root
[ ] LICENSE present (MIT, Copyright Dragoon0x)
[ ] docs/index.html only documents what ships
[ ] docs/.nojekyll present
[ ] npm login successful
[ ] commits pushed to main via GitHub Desktop
```
