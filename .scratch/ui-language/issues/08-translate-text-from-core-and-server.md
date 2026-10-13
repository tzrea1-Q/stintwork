# 08 — Translate text that core and server write

Status: resolved
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

## Comments

**Coordinator, 2026-10-13:** Built by Codex on the integration branch `ui-language-followups`.

Core owns one catalog of English text with stable codes and typed parameters (`core-text.ts`). Producers name a code, the English is rendered from the catalog, and the web translates known codes. The wire format is additive: every existing English field is byte-identical, and codes travel alongside it.

Translated:
- gate reasons, labels and remedies;
- brief availability and pointer reasons (display only; the prompt sent to agents stays English);
- permission-level warnings;
- agent availability and login guidance;
- Stintwork's own stream notes and diagnostics;
- fixed HTTP refusals for checks, ship, review, memory, setup, roadmap, workflow, work-item creation and file safety.

Left in English on purpose:
- CLI output, and the prompt sent to agents: localisation must not change agent instructions.
- Agent-authored text: messages, tool titles, permission option names and handoffs.
- Repo content and parser warnings.
- Raw git, `gh` and command output, and the diagnostic detail inside translated wrappers.
- Unstructured operational exceptions (adapter, transport and startup failures; compound checkpoint, merge and cleanup errors). Their full text is kept rather than parsed.
- Old stint-log entries without codes, unknown codes and malformed parameters, which fall back to their stored English.

The code-review round made these changes:
- Code first instead of English-to-code lookup, so the lookup middleware and its hand-wrapped variant are gone.
- One `CoreText` type replaces the reason/reasonMessage pairs.
- Wrapper functions were removed, and parameter shapes are declared once.
- Malformed error bodies are handled safely.
- `@stintwork/core` became a declared workspace dependency of `@stintwork/git`, replacing a relative import into `core/dist`.

Kept as one catalog on purpose: splitting `core-text.ts` per package would scatter the codes the web needs.

Coordinator checks in a fresh clone:
- `pnpm install --frozen-lockfile` passed.
- The first full `pnpm test` had 7 cold-start timeouts in agent-launcher and permission tests. They passed in isolation (48 tests), and a second full run passed 2100 tests.
- `typecheck`, `lint`, `format:check`, `build` and `smoke:package` passed.
