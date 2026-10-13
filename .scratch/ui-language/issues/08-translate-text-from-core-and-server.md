# 08 — Translate text that core and server write

Status: ready-for-agent
Blocked by: 06

## What to build

Ticket 06's walk-through on 2026-10-12 found that the most visible English left in Chinese mode is written by core and server, not the web. The spec put this text out of scope. The developer has since decided to bring it in scope, as a structured-message change across core, server and web. Seen in Chinese mode:

- **Gate readiness and blocking reasons:**
  - "Every ticket must be resolved before approving."
  - "A stint is running on this work item. Finish or stop it before approving." (and its "…before shipping." variant in ship)
  - gate output labels such as "Developer approval; no file output required"
- **Reasons a stint can't start,** such as "This ticket is resolved." from the brief.
- **Permission-level warnings for agents,** such as Codex's sandbox note "Codex's sandbox can execute commands without asking…".
- **Agent status labels** in agent pickers, such as "Internal error".
- **Notes Stintwork itself writes into the stint stream,** such as "Wrote workflow.yaml with the workflow, stage and Claude Code for this stage."

Make these readable in Chinese without moving language into core:

- Where core or server produce one of these sentences for the UI, also return a stable code plus typed parameters, for example `{ code: "gate.ticketsUnresolved" }` or `{ code: "stream.wroteWorkflow", agent: "claude" }`. Keep the existing English string, so other consumers (CLI, logs, the English UI) and existing tests are unchanged.
- The web renders known codes from its catalogs (English identical to today's string, plus Chinese) and falls back to the English string for unknown codes. This is the same pattern ticket 03 used for attention items.
- Inventory every such sentence that reaches the UI. Translate the ones above plus any others found, and list in Comments any left in English on purpose and why (for example raw error text from git, `gh` or an agent).
- Stint stream notes are recorded in stint logs. Old logs without codes keep showing their stored English.

Still out of scope: CLI output, agent-supplied text (permission option names, tool titles, handoffs), git and `gh` output, and warning text produced by parsing a repo's files.

## Acceptance criteria

- [x] Core and server tests: each new code is returned with its parameters alongside the unchanged English string.
- [x] Component tests in Chinese: each listed sentence renders in Chinese, an unknown code falls back to the English string, and an old stint log without codes still renders.
- [x] Existing English tests pass unchanged, and the catalog completeness test passes.
- [x] All checks pass.
