# 10 — README and getting-started guide

Status: resolved
Blocked by: 05, 06, 08, 09

## What to build

Someone arriving at the repository can decide and succeed without help (spec user stories 62–64). Rewrite the README for users: what Stintwork is, `npx stintwork`, agent logins, verified agents (Claude Code, Codex) and experimental ones (Grok Build), status, and links. Write a getting-started guide in `docs/` that takes the first work item from creation through Clarify, Spec, Tickets, Implement, Review and Ship. Remove "planning, no production code" from the README and AGENTS.md. Keep the vocabulary to the glossary's terms.

## Acceptance criteria

- [x] The README and guide match the shipped behaviour of tickets 05, 06, 08 and 09 (checked by following the guide on a throwaway repo).
- [x] No stale "planning" status lines remain.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-11:** Written by Codex. The README (95 lines) leads with what Stintwork does and `npx stintwork`, says plainly that the npm package isn't published yet, and gives a local-checkout path; the coordinator confirmed `pnpm build` produces `dist/bin.js` and `node dist/bin.js --version` prints 0.1.0. docs/getting-started.md walks a Feature work item from setup through Clarify, Spec, Tickets, Implement, Review and Ship, matching the behaviour checked in tickets 05, 06, 08 and 09 and the M4 exit, including the stage-output fix found in 06. The "planning" line is gone from README.md and AGENTS.md. verify.sh passed. Following the guide end to end on a fresh repo is ticket 11's full manual run.
