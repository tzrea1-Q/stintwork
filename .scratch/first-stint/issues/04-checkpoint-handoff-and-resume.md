# 04 — Checkpoint, handoff and resume

Status: ready-for-agent
Blocked by: 03

## What to build

How a stint ends, and how the next one starts (spec user stories 19–24, 35; ADR 0004).

- When a stint ends, Stintwork commits the worktree's changes as a **checkpoint** on the work item branch, with a message naming the stint, work item, ticket and how it ended. No commit when the worktree is clean.
- Stintwork then asks the agent, in the same session and with a timeout, for a **handoff** in three sections: where it stopped, unresolved, suggested next. The handoff is stored in the stint log and shown as a card at the end of the stint. If the agent gives none, the stint still ends, and the card says no handoff was given.
- The next brief for the same ticket includes the last handoff (with its stint and agent), the checkpoint commit, and the spec or ticket paths changed since that checkpoint.

## Acceptance criteria

- [ ] Server test: a fake-agent stint that edits a file ends with exactly one checkpoint commit, whose message names the stint and ticket. A stint with no edits makes no commit.
- [ ] Server test: the handoff is requested, stored and returned. A fake agent that never answers times out, and the stint ends with "no handoff".
- [ ] Server test: after editing the spec on the main branch, the next brief preview includes the handoff and lists the spec under "changed since".
- [ ] Component test: the handoff card renders all three sections and the checkpoint commit.
