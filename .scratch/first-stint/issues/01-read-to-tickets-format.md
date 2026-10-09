# 01 — Read mattpocock's /to-tickets format

Status: resolved
Blocked by: none

## What to build

Tickets written by mattpocock's own `/to-tickets` skill index correctly. Today they show as open and unblocked, with warnings, which breaks ADR 0001's promise to use mattpocock's format unchanged. That skill writes:

- a title like `# 01: Ticket title` (colon after the number);
- `**Blocked by:** None (can start immediately)` or `**Blocked by:** 01, 02` (sometimes with titles after the numbers);
- `**Status:** ready-for-agent` (bold label, possibly after the `**What to build:**` paragraph);
- acceptance criteria as `- [ ]` / `- [x]` checklist lines.

Both the plain format (`Status:` lines) and this bold format must work, including in the same work item.

## Acceptance criteria

- [ ] A ticket with `**Status:** resolved` is resolved, and `**Status:** ready-for-agent` is open.
- [ ] `**Blocked by:** None (can start immediately)` means no blockers. `**Blocked by:** 01, 02` and blockers written with titles (e.g. `01 (Index work items), 02`) are parsed as numbers.
- [ ] Titles drop a leading `NN:`, `NN —` or `NN -` prefix.
- [ ] The metadata is found anywhere before the first `## ` heading, in either order.
- [ ] Existing plain-format tests still pass unchanged. New tests use a fixture copied from real `/to-tickets` output.
- [ ] The board on this repo shows no warnings for `.scratch/board` and `.scratch/first-stint` tickets.

## Comments

**2026-10-09 · implemented by Codex, verified by coordinator.** All checks pass in the worktree (141 tests, including 26 new to-tickets-format tests built on a byte-for-byte copy of real /to-tickets output). Plain-format tests unchanged.
