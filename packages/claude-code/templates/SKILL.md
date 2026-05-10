---
name: userigor
description: Telemetry-driven feedback loop. Use this skill when (1) starting work in a repo that has captured patterns to recall relevant guidance before generating, (2) finishing a piece of work to capture what was actually committed vs what was first generated, or (3) you want metrics on how well prior patterns are improving outcomes. Run rigor_recall before generating non-trivial code, and rigor_capture after the user has accepted and committed your output. Skip for pure conversation, file reads, or trivial one-liners.
---

# userigor

userigor is a telemetry layer for AI coding. It learns from corrections (the delta between what you produced and what shipped), clusters them into reusable patterns, and lets you recall those patterns before generating new code. Causal evidence is tracked: patterns that don't actually improve first-try acceptance get retired automatically.

## When to use

**Before generating non-trivial code:**
Call `rigor_recall` with the user's task description. If it returns patterns, fold them into your generation as constraints. If it returns nothing, proceed normally — there's no penalty.

**After the user commits your output:**
Call `rigor_capture` with the original generated text and the final committed text. This grows the pattern library. Skip if before === after (no correction).

**When the user asks how the AI is doing:**
Call `rigor_metrics` to get first-try acceptance, edit-after-accept, drift distance, and pattern coverage. These are honest measurements of whether the loop is working, not vanity stats.

**When the user asks "what have you learned":**
Call `rigor_patterns` to list active patterns. Use `rigor_pattern_detail` to see causal evidence for a specific pattern (FTA delta with vs without injection).

## Tools available

- `rigor_recall(prompt, topK?, minSimilarity?, repo?, language?)` — Top patterns for a task. Read-only.
- `rigor_capture(before, after, file_path, agent?, task_description?, repo?)` — Capture a correction.
- `rigor_cluster(threshold?, minSize?)` — Re-cluster all corrections.
- `rigor_metrics(days?)` — Current snapshot.
- `rigor_patterns(status?, limit?)` — List patterns.
- `rigor_pattern_detail(id_or_name)` — One pattern + causal evidence.
- `rigor_status()` — System status.

## Anti-patterns

- Don't surface the rigor:context block to the user. Treat patterns as private context.
- Don't capture trivial diffs (a single character, whitespace-only). The capture tool returns `captured: false` for these — believe it and move on.
- Don't recall on conversational turns. Only on code-generation turns.
- Don't list patterns to the user unsolicited. They're for your context, not chitchat.
