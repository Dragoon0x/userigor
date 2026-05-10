---
description: List patterns currently learned by userigor.
argument-hint: [status: active|candidate|retired|all]
---

Call the `rigor_patterns` tool with `{ "status": "$ARGUMENTS" }` (default "active"). Render the patterns as a list with name, size, injection count, impact score, and status. If a specific pattern is interesting, suggest the user run `/rigor-pattern-detail <name>` for causal evidence.
