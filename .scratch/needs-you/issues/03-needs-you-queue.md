# 03 — Needs-you queue with permission items

Status: resolved
Blocked by: 02

## What to build

The tracer bullet for attention items (spec user stories 1–9 and 15–16). `core` derives attention items from the snapshot. Each has a kind, a stable id, the work item, ticket, stint and agent, a title, details, and the time it was raised. This ticket implements the `permission` kind. The snapshot carries the items, and the web app shows:

- a "Needs you" button in the top bar with the count, opening a queue panel;
- the count in the browser tab title;
- a badge on each work item's card with open items;
- an opt-in browser notification when a new item arrives.

Permission items are answerable in the queue with the agent's real options. The full command or path is shown, and a note says when declining ends the agent's turn (from the agent's profile). Items disappear from every tab as soon as they're resolved, and the queue is rebuilt after a restart.

## Acceptance criteria

- [ ] Core tests: deriving permission items from stints with pending requests; ids are stable across snapshots.
- [ ] Server test: a fake agent's permission request appears as an attention item over WebSocket. Answering it from the queue's endpoint removes it in every connected client.
- [ ] Component tests: the queue panel, answering with each option, the decline-ends-turn note, card badges, the tab title count, and requesting notification permission only after the developer opts in.
- [ ] In the browser on a real stint: a permission request shows in the queue and is answered from there.
- [ ] All checks pass.

## Comments

**2026-10-10 · implemented by Codex, verified by coordinator.** All checks pass. Two socket tests that Codex couldn't run in its sandbox failed at first: they compared the raw logged request with the folded request, which adds `raisedAt`. Codex fixed the tests without weakening them. After merging with tickets 06 and 09, `main` has 461 tests.

Real Codex on a throwaway repo:
1. A ticket needing network access raised "Run command" (`curl -sI https://example.com | head -1 | tee status.txt`).
2. It appeared in the Needs-you queue with the work item, ticket, stint, waiting time, the full command, "Declining ends Codex's turn", and Codex's three options. The tab title showed "(1)", and the card showed a Needs-you badge.
3. Allow once, answered from the queue, was logged and reached Codex. `status.txt` = `HTTP/2 200`, the stint `finished`, and the ticket was resolved.

Follow-up: the queue shows the tool call as raw JSON. Format the command and working directory (folded into ticket 10, which changes the same component).
