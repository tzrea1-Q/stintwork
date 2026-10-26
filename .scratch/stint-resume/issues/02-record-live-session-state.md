# 02 — Record a live stint's recovery state

Status: ready-for-agent
Blocked by: 01

## What to build

Make a newly started Claude Code or Codex stint leave enough validated state to recover, end to end from the registered launcher to its JSONL log and history API. Reuse the existing `started` fields and M9's selected `PreparedAgent`; add only the spec's versioned recovery data. Expose the ACP ID immediately after `newSession` and synchronously persist it before a work prompt can run. Source details currently emitted as text are not recovery metadata.

Record canonical executable identity/version, source/reason, adapter/cache/lock/host identity, permission level, process-attempt ownership and lifecycle progress. Persist phase boundaries and completed handoff/findings before moving forward; preserve original reviewed/base commit identity. A Stop intent must be durable before cancellation. Extend validation/folding/summaries with backward compatibility, without resuming anything yet. Pending requests already have durable details; this ticket leaves their live rebinding to 06.

Use existing fake ACP/Git/cache seams for a runnable check proving disk order, API folding and a normal ending. Do not persist credentials, environment variables, callbacks or duplicate transcripts.

## Acceptance criteria

- [ ] One normal start records the actual session and selected Installed/Bundled identities before its first prompt; a failed metadata write prevents work from starting.
- [ ] Validated recovery entries reach log folding/history while legacy started/ended logs still parse without invented session metadata.
- [ ] Work, handoff, findings and finalization boundaries retain completed results and the original brief/base/reviewed commit.
- [ ] Durable Stop intent precedes cancellation, and process-attempt ownership can distinguish unrelated or reused PIDs.
- [ ] Existing normal finish/Stop/failure still collects output and checkpoints with the same risky-file/evidence rules and one terminal ending.
- [ ] Isolated regression checks cover ordering, validation, missing metadata and read-back; Comments record checks and resource limits.

## Comments

**Codex, 2026-10-26:** Fake subprocess and local Git checks belong to this ticket. Real authenticated agents/provider network and socket history checks are coordinator-run; no real compatibility or crash success is implied by unit tests.
