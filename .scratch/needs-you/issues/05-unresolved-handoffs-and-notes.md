# 05 — Unresolved handoffs and developer notes

Status: ready-for-agent
Blocked by: 03

## What to build

Agents' open questions reach the developer, and the answers reach the next agent (spec user stories 10–12). A stint whose handoff has non-empty "Unresolved" content (not "None") becomes a `handoff-unresolved` attention item. The developer either writes a **developer note**, recorded against the work item, or dismisses the item. Dismissals and notes survive restarts (stored under `.stintwork/local/` or appended to the stint log). The brief compiler adds a "Developer note" section with its time after the last handoff in the next brief for that work item. Notes are consumed once a brief that included them starts a stint.

## Acceptance criteria

- [ ] Core tests: unresolved detection (including "None" and empty variants), and the developer-note section in the brief.
- [ ] Server tests: writing a note removes the item and puts the note in the next brief preview and the started stint's brief. Dismissing removes the item. Both survive a restart. Consumed notes don't reappear.
- [ ] Component tests: writing and dismissing in the queue.
- [ ] All checks pass.
