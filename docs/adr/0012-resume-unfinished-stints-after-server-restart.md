# Resume unfinished stints automatically after a server restart

At startup, automatically attempt recovery once for each eligible unfinished Claude Code or Codex stint. The developer already authorized the work; requiring a Resume action would leave it waiting on an open browser. Recovery stays visible and stoppable. Keep the same stint, worktree, original brief and ACP session; use `loadSession` in a new process and a continuation instruction, without repeating the brief or stage skill.

This qualifies [ADR 0004](0004-checkpoint-commit-when-a-stint-ends.md): server shutdown or crash suspends an unfinished stint. Genuine endings, including explicit Stop, still checkpoint; failed recovery uses the interrupted/checkpoint fallback.

Recovery narrowly qualifies [ADR 0011](0011-prepare-pinned-agent-adapters-on-first-use.md): verify and launch only the recorded Installed/Bundled source and exact executable through its verified warm cache. No startup preparation, downloads or reselection; board detection and availability refresh remain read-only. [ADR 0002](0002-agents-integrate-through-acp.md)'s pinned ACP contract, [ADR 0003](0003-use-the-developers-own-agents-and-logins.md)'s own-login/no-credentials boundary and [ADR 0009](0009-work-item-files-come-from-its-worktree.md)'s worktree authority hold. Preserve permission levels; restored requests require a fresh live callback before answers are enabled.

The [2026-10-17 coordinator evidence](../../.scratch/first-run/issues/03-installed-cli-compatibility.md#comments) proves new-process session loading for Installed/Bundled Claude 2.1.295/2.1.293 (adapter 0.88.0) and Codex 0.163.0/0.159.3 (adapter 2.1.1) on darwin-arm64. It does not prove killed-server continuation, permission recovery, other platforms or the M10 exit.

Legacy logs and experimental Grok use checkpoint fallback; a new stint requires developer action. Old processes are not reattached or supervised. Confirm previous writers have stopped before replacement or checkpointing; uncertain ownership blocks mutations with a warning. The [spec](../../.scratch/stint-resume/spec.md) defines validation, lifecycle and failure details.

Approved by the maintainer on 2026-10-26.
