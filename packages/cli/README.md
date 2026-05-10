# @userigor/cli

The `rigor` command-line interface for [userigor](https://github.com/Dragoon0x/userigor).

```bash
npm install -g @userigor/cli
```

## Commands

```
rigor init                         Initialize ~/.rigor/ and the local db
rigor status                       Show current setup and counts
rigor capture <before> <after>     Capture a single correction from two files
rigor backfill                     Walk git history and capture corrections
rigor embed                        Embed any pending corrections
rigor cluster                      Form patterns from embedded corrections
rigor patterns [list|show <id>]    List patterns or show details with causal evidence
rigor inject "<prompt>"            Pre-flight: see what context would be injected
rigor metrics                      Show current metric snapshot
rigor series                       Time-series for a single metric
rigor prune                        Retire low-impact / stale patterns
rigor config [show|set]            Read or write configuration
```

## Two-minute walkthrough

```bash
# initialize
rigor init --agent claude-code

# in a git repo, walk recent history to seed
cd ~/code/my-project
rigor backfill --limit 200

# form patterns
rigor cluster

# see what's been learned
rigor patterns

# preview what would be injected for a prompt
rigor inject "add error handling to fetchUser" --dry

# honest measurements
rigor metrics --days 7
```

## Configuration

Stored at `~/.rigor/config.json`. Inspect with `rigor config` or update:

```bash
rigor config set --agent cursor
rigor config set --similarityThreshold 0.50
```

## License

MIT · [Dragoon0x](https://github.com/Dragoon0x)
