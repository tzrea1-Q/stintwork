# 12 — Handoff after a stop during an edit

Status: resolved
Blocked by: none

## What to build

Found in the M2 exit test (ticket 09). A real Codex stint was stopped while Codex was applying a patch. The stint ended `stopped` 0.5 s later with a checkpoint but no handoff, and nothing in the log said why. After the cancelled work turn returns, the agents package sends the handoff request immediately. When that request fails (here within about 0.35 s, presumably because Codex was still settling the cancelled patch), the failure is caught and discarded.

- When the handoff request fails quickly after a cancel, retry it with a short backoff (for example 3 attempts, 0.5 s, 1 s, 2 s), all within the existing handoff timeout.
- When no handoff can be obtained, record the reason in the stint's ended entry (for example `handoffError`). Show it on the handoff card instead of a bare "no handoff given".
- Leave behaviour unchanged when the handoff succeeds on the first attempt, or when the timeout is exhausted.

## Acceptance criteria

- [ ] Agents test: a fake agent whose first handoff prompt fails immediately and whose second succeeds yields the parsed handoff.
- [ ] Agents test: a fake agent whose handoff prompts always fail yields no handoff and a recorded reason, within the timeout.
- [ ] Server test: the ended entry and the stint summary carry the reason when there's no handoff.
- [ ] Component test: the handoff card shows the reason.
- [ ] All checks pass.

## Comments

**2026-10-10 · implemented by Codex, verified by coordinator.** All checks pass (336 tests). A handoff after a cancel now gets up to three attempts within the handoff timeout, and the reason is recorded as `handoffError` when none arrives. Real-Codex confirmation is part of the M2 exit test (ticket 09).
