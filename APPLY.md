# userigor repo updates — drop-in

Pre-launch updates for the Twitter push. Five file changes total. Includes experimental / WIP / DYOR positioning to protect the project and author.

## What's in this folder

```
README.md                   ← replace existing README.md at repo root
CHANGELOG.md                ← new file at repo root
DISCLAIMER.md               ← replace existing DISCLAIMER.md at repo root
docs/og.png                 ← new file at docs/og.png
docs/META_TAGS_TO_ADD.md    ← snippet to paste into docs/index.html
APPLY.md                    ← this file (don't ship it, it's a note)
```

## Apply in this order

1. **Replace `README.md`** at repo root. Adds badges, an **experimental / WIP / DYOR** callout block right at the top, tl;dr quick-start, version bump to v1.0.1, link to CHANGELOG, and a strengthened Status section at the bottom.

2. **Replace `DISCLAIMER.md`** at repo root. Twelve-section legal-style notice covering: experimental status, no warranty, no liability, privacy and data handling (what's read, stored, transmitted), security posture, not-for-high-stakes-use, no support / no SLA, no affiliation with vendors mentioned, user responsibilities, contributions, severability, governing terms. Protects the author end-to-end and tells users to do their own research.

3. **Add `CHANGELOG.md`** at repo root. New file. Includes the experimental / WIP banner at the top and documents 1.0.0 → 1.0.1.

4. **Add `docs/og.png`** to the docs folder. 1200×630 dark editorial card matching the landing page aesthetic. This is what shows up when someone shares the GitHub Pages link on Twitter.

5. **Edit `docs/index.html`** — paste the meta tag block from `docs/META_TAGS_TO_ADD.md` into the existing `<head>`. Don't replace the whole file, just add the tags. Then delete `META_TAGS_TO_ADD.md` (it's a note, not for shipping).

## After applying

Commit + push via GitHub Desktop. Wait ~30s for GitHub Pages to rebuild.

Verify before tweeting:

```bash
# og image accessible
curl -I https://dragoon0x.github.io/userigor/og.png
# expect 200

# smoke install (final confidence check)
npm install -g @userigor/cli
rigor --version
```

Validate the Twitter unfurl: paste `https://dragoon0x.github.io/userigor/` into a Twitter draft. The card should show the dark editorial og image.

## Tweet hygiene (recommended)

The README and DISCLAIMER do the heavy lifting, but include a short caveat in the tweet itself so nobody feels misled. Examples:

- "shipping v1.0.1. experimental, MIT, DYOR. feedback welcome."
- "early-stage research tool. read the disclaimer before pointing it at a real repo."
- "WIP. not production-ready. happy to hear what breaks."

This keeps tone confident without overpromising. It also matches the framing in the README banner so the tweet and the landing don't contradict each other.

## Repo metadata (do this on github.com, not via files)

- Settings → About (gear icon next to "About") → add topics:
  `ai-coding`, `mcp`, `claude-code`, `cursor`, `developer-tools`, `telemetry`, `typescript`, `npm-package`, `experimental`, `research`
- Confirm the "Website" field points to `https://dragoon0x.github.io/userigor/`
- Tag a release: `v1.0.1` on `main`, with the CHANGELOG entry pasted as the body. Mark it as a "pre-release" on GitHub if you want the experimental positioning to show in the release UI too.
