# Agent polish after M3

Milestone: M4 · Review and ship. Findings from the M3 exit test (`.scratch/needs-you/issues/11-m3-exit.md`) that don't block M3 but should land early in M4.

## Acceptance criteria

1. At Edit freely, safe read-only commands inside the worktree are answered automatically, as the settled plan decision says ("ask before commands outside a safe list").
2. The test suite passes inside an agent's environment, including Claude Code and Codex stints run by Stintwork.
3. Every commit Stintwork makes has a message describing what it records.
4. Grok Build is verified end to end with a real stint (handoff included) once its API allows.
