# 01 — Record the restart recovery decision

Status: ready-for-human
Blocked by: none

## What to build

Write the next decision record (currently `docs/adr/0012-*.md`) for this spec's automatic warm-cache recovery. Read all decision records, especially 0002, 0004, 0009 and 0011, and the final coordinator evidence in first-run ticket 03. Keep it at the repo's short decision-record length; link this spec for implementation detail.

State why startup automatically resumes an already authorized active stint rather than waiting for a Resume action. Define server shutdown/crash as suspension, with the existing checkpoint guarantee at a genuine ending or failed-resume fallback. Narrowly qualify ADR 0011 to allow verified warm-cache launch for recovery without preparation/downloads; retain exact source/executable selection, pinned ACP, worktree authority and own-login/no-credentials. State legacy/Grok fallback and that old processes are not reattached.

Get coordinator/maintainer approval of the record before implementation tickets start. This ticket writes the proposed record, not product code or an invented approval. Do not edit existing decision records silently.

## Acceptance criteria

- [ ] The new record links this spec, ADR 0002/0003/0004/0009/0011 and the dated Installed/Bundled resume evidence without calling it an M10 crash pass.
- [ ] Automatic recovery, suspension versus ending, same-session continuation and failed-resume checkpoint fallback are explicit with a short rationale.
- [ ] Its narrow relationship to ADR 0011 preserves no startup preparation/download, no reselection, exact pins and developer-owned login.
- [ ] Experimental Grok and legacy logs use fallback; reattachment and process supervision remain out of scope.
- [ ] Comments record actual docs checks and the coordinator/maintainer's decision; the ticket is resolved only after approval, and no product code or existing record is changed.

## Comments

**Codex, 2026-10-26:** Filed as the first prerequisite. No new decision record has been written or approved in this filing. Approval is coordinator/maintainer work; docs checks need no real agents, network, sockets or browser.

**Codex, 2026-10-26:** Proposed [ADR 0012](../../../docs/adr/0012-resume-unfinished-stints-after-server-restart.md) after reading all existing records, the spec and first-run ticket 03's final coordinator evidence. It records automatic same-session recovery, suspension versus ending, warm-cache-only exact selection, existing boundaries and checkpoint fallback. No new product term is needed, so the glossary is unchanged. Coordinator/maintainer decision: pending; no approval is claimed, this ticket remains unresolved and implementation tickets must wait for approval.

Docs checks passed: `pnpm --config.verify-deps-before-run=false format:check` (381 files), `pnpm --config.verify-deps-before-run=false lint` (333 licence headers, 382 Biome files; existing informational `biome.json:24` deprecation), and the spec's `pnpm --config.verify-deps-before-run=false vitest run packages/core --configLoader native` (32 files, 967 tests). Separate guards verified the ADR length, ending and local links, append-only ticket changes, unchanged Status lines and existing ADRs, the two-file scope and whitespace. No product code, real-agent/crash evidence or commit.
