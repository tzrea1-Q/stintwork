# Workbench UI prototype — spec

**This is throwaway prototype code.** Its only job is to answer one question:
*what should a local, simple workbench for developing software with several coding agents look and feel like?*
No tests, no backend, no persistence: everything is in-memory fake data plus a fake run simulator.

Plan: three radically different variants of the whole app, switchable via `?variant=A|B|C` and a floating bottom bar (← / → keys).

## Product in one line

Open any repo, see what you're building and what's next, and take each piece of work through a guided workflow with whichever coding agent you choose, without re-explaining the project.

The whole vocabulary is three concepts: **Project** (a git repo), **Work item** (a feature/bug/quick task going through a workflow; its files live in `.scratch/<slug>/`), **Run** (one agent session on one stage of a work item). Tickets appear inside a work item as its task list. Agents are not configured; they are detected and picked from a dropdown.

Durable state is Markdown in the repo (mattpocock/skills conventions): `AGENTS.md`, `GLOSSARY.md`, `docs/adr/*.md`, `.scratch/<feature>/spec.md`, `.scratch/<feature>/issues/NN-<slug>.md` (with `Status:` and `Blocked by:` lines). Show these real paths in the UI — they are part of the product's honesty ("files are the source of truth").

## File layout

```
src/main.tsx                    # mounts <App/>
src/App.tsx                     # reads ?variant=, renders VariantA|B|C + <PrototypeSwitcher/>
src/index.css                   # Tailwind + design tokens (CSS variables), dark + light
src/proto/types.ts              # SHARED CONTRACT (coordinator-owned; do not edit)
src/proto/data.ts               # fake "ledgerly" project scenario (below)
src/proto/workflows.ts          # workflow definitions
src/proto/store.tsx             # <WorkbenchProvider>, useWorkbench(): { state, actions, selectors }
src/proto/simulator.ts          # scripted run streaming (timers)
src/proto/ui/*                  # tiny SHARED primitives only: AgentBadge, StatusIcon, Kbd, MarkdownView, DiffView, CommandPalette host
src/proto/PrototypeSwitcher.tsx # floating bottom bar + "state" inspector toggle
src/variants/A/**               # Variant A only
src/variants/B/**               # Variant B only
src/variants/C/**               # Variant C only
```

Variants may import anything from `src/proto/**` but must not import from each other, and must not share a layout component. Each variant owns its whole screen (no shared app shell).

## Store API (src/proto/store.tsx)

`useWorkbench()` returns `{ state: WorkbenchState, actions, select }`.

Actions (all synchronous state updates; the simulator emits further updates over time):

| Action | Effect |
|---|---|
| `answerQuestion(entryId, answer)` | Resolves the inbox entry; if its run is `waiting`, the run continues streaming |
| `decidePermission(entryId, allow)` | Resolves; appends a `tool` event (ok or "denied by you") to the run; run continues |
| `approveStage(itemId, stageId)` | Stage → `done` (approvedBy 'you', approvedAt now, approvedCommit), next stage → `active`; resolves the matching `approval` inbox entry; updates `nextAction` |
| `setStageAgent(itemId, stageId, agent)` | Sets the agent for that stage |
| `startRun({ itemId, stageId, agent, ticketId? })` → runId | Creates a run (`running`), first event is `system` "Started in worktree …"; simulator streams a script for that stage (plan → messages → tool calls → file edits). Some scripts pause with a `question` (run → `waiting`, adds inbox entry). Ends `done` with a `handoff` and sometimes a `MemoryProposal` (+ `memory` inbox entry) |
| `stopRun(runId)` | Run → `stopped`, appends `system` "Stopped by you", writes a handoff |
| `decideProposal(proposalId, accept)` | proposal → accepted/rejected; resolves its inbox entry; accepted ADRs appear in `state.adrs` / glossary terms in `state.glossary` |
| `setFindingStatus(findingId, status)` | Updates a review finding |
| `sendBack(itemId)` | Open findings → `sent-back`; review stage → `waiting`, implement stage → `active`; nextAction updated |
| `merge(itemId)` | PR → merged, remaining stages done, item shows as shipped |
| `createItem({ title, type })` | New item in the first stage of its workflow, `nextAction` = "Start Clarify" (or first stage) |
| `reset()` | Back to the initial scenario |

Selectors (`select.*`): `needsYou()` (unresolved inbox entries, newest first), `item(id)`, `workflow(item)`, `runsFor(itemId)`, `activeRun(itemId)`, `review(itemId)`, `brief({ itemId, stageId, ticketId?, agent })` → `Brief` (pure: built from the item's artifacts, `AGENTS.md`, relevant ADRs/glossary, the last run's handoff, and `changedSinceLastRun` flags), `counts()` (per inbox kind).

## Workflows (src/proto/workflows.ts)

- **Feature:** Clarify `/grill-with-docs` (gate: done, default claude) → Spec `/to-spec` → `spec.md` (approve, claude) → Tickets `/to-tickets` → `issues/NN-*.md` (approve, claude) → Implement `/implement` (checks, grok) → Review `/code-review` (approve, codex) → Ship `/pr` (merge).
- **Bug:** Diagnose `/diagnosing-bugs` (done, claude) → Fix `/tdd` (checks, codex) → Review `/code-review` (approve, codex) → Ship `/pr` (merge).
- **Quick task:** Do (checks, claude) → Review `/code-review` (approve, codex) → Ship `/pr` (merge).

## Fake scenario: project `ledgerly` (src/proto/data.ts)

A personal-finance web app (TypeScript, React, SQLite) at `~/code/ledgerly`, remote `github.com/you/ledgerly`, tracker local-markdown. Fake "now" = 2026-10-09T10:30.

Agents: Claude Code (acp, available), Codex (acp, available), Grok Build (acp, available), Gemini CLI (unavailable, note "not found on PATH").

Milestones: **M1 · Private beta** (shipped), **M2 · Import & auth** (active, target 2026-10-24), **M3 · Automation** (planned).

Work items (write rich, realistic content — specs with acceptance criteria, ticket bodies, comments):

1. **F-12 Bank CSV import** (feature, M2). Stages: clarify, spec, tickets done (approved, with commits); **implement active**; review/ship todo. Tickets: 01 Parse CSV with column mapping (resolved, claude); 02 Dedupe transactions on import (in-progress — **Grok's run r-104 was stopped mid-way yesterday** with a handoff: "dedupe key implemented for amount+date+payee; fuzzy payee matching not done; 3 tests failing in import.dedupe.test.ts"; suggested next "/implement ticket 02 — finish fuzzy payee match, make tests pass"); 03 Category mapping UI (open, blocked by 02); 04 Import summary screen (open, blocked by 02, 03). `spec.md` acceptance criterion 3 was **edited after r-104** ("duplicates within 3 days, not same day") → `changedSinceLastRun: true`. nextAction: "Resume ticket 02 — Grok stopped mid-way; spec changed since". Branch `wb/bank-csv-import`, worktree `../ledgerly-worktrees/bank-csv-import`.
2. **F-14 Sign in with GitHub** (feature, M2). Clarify done; **Spec waiting for approval** — `spec.md` drafted by Claude in run r-106 (done). Inbox: approval "Approve spec for F-14".
3. **B-31 Split transactions total off by one cent** (bug, M2). Diagnose done (claude), Fix done (codex, commit `a41c9e2`), **Review active**: Codex review run r-109 is **running**, currently `waiting` on a **permission** request: `pnpm vitest run src/money --reporter=dot`. Review data: commit `a41c9e2`, 2 files changed (`src/money/split.ts`, `src/money/split.test.ts`) with realistic hunks (switching float math to integer cents with remainder distribution), findings: (spec, major) "Remainder goes to first split; spec says largest split" at split.ts line ~24; (standards, minor) "Magic number 100 — use CENTS_PER_UNIT" at line ~11; (standards, nit) test name. Checks: typecheck pass, test pass, lint **fail** (1 error) — checksCommit `a41c9e2`. Memory proposal from r-108: ADR `docs/adr/0007-money-as-integer-cents.md` "Store money as integer cents".
4. **F-15 Recurring transactions** (feature, M3). **Clarify active**: Claude run r-110 `waiting` on a **question**: "When a recurring transaction's amount changes (e.g. a subscription price rise), should past occurrences keep their original amount?" options: "Keep history unchanged (Recommended)", "Rewrite all occurrences", "Ask per series". Also a glossary proposal: term "Series" = "a recurring transaction template and all its occurrences".
5. **F-16 Multi-currency** (feature, M3). Not started; nextAction "Start Clarify".
6. **T-40 Upgrade to Vite 7** (quick, M1). Shipped, PR #38 merged.
7. **F-9 Budget envelopes** (feature, M1). Shipped, PR #31 merged.

Runs history: r-101 (F-12 clarify, claude, done), r-102 (F-12 spec, claude, done), r-103 (F-12 ticket 01, claude, done), r-104 (F-12 ticket 02, grok, **stopped**, with ~12 events: plan, file reads, edits, a failing test tool call, "Stopped by you"), r-106 (F-14 spec, claude, done), r-107 (B-31 diagnose, claude, done), r-108 (B-31 fix, codex, done), r-109 (B-31 review, codex, waiting/permission), r-110 (F-15 clarify, claude, waiting/question).

ADRs already accepted: 0001 SQLite as the only store, 0004 Feature folders under src/features, 0006 Use vitest. Glossary: Transaction, Split, Envelope, Payee.

Inbox (Needs you) initial: question (F-15), permission (B-31 r-109), approval (F-14 spec), review (B-31: "3 findings, lint failing"), memory ×2 (ADR 0007, glossary "Series").

## Simulator (src/proto/simulator.ts)

Scripted, deterministic event streams per stage type (clarify / spec / tickets / implement / review / diagnose / fix / do), emitted every 500–900 ms via timers held by the store. Implement scripts include a `plan` event whose steps tick off, `tool` calls (`rg`, `pnpm vitest run …`, `git diff --stat`), `file` events, and end with a handoff. Resuming F-12 ticket 02 with any agent must produce a convincing run that (a) acknowledges the brief ("Read handoff from r-104 (Grok)… spec criterion 3 changed to 3-day window"), (b) fixes the tests, (c) ends `done`, marks ticket 02 resolved and unblocks 03. Answering the F-15 question or allowing the B-31 permission resumes those runs to completion (B-31 ends by refreshing checks to all-pass on a new commit `c07b5d1`, making the old findings' commit stale → show the stale-evidence state).

## What every variant must let the user do (same scenario coverage)

1. See **what needs me** right now, and act on each kind inline: answer the F-15 question, allow/deny the B-31 command, read & approve the F-14 spec, accept/reject memory proposals, open the B-31 review.
2. See the **project**: milestones → items with their current stage, what's running, what's blocked, what shipped.
3. Open **F-12** and understand it at a glance: the stage rail, tickets in blocking order, run history (incl. Grok's stopped run and its handoff), and one obvious **next action**.
4. **Resume ticket 02 with a different agent**: preview the compiled brief (pointers + last handoff + "changed since" + the exact prompt), choose the agent, start, watch the run stream live (plan ticking, tool calls, file edits), optionally stop it, and toggle a **terminal fallback** view (fake xterm-style transcript of the same run).
5. Change the **agent per stage** from a dropdown (Gemini disabled with its note).
6. **Review B-31**: diff with findings pinned to lines, checks tied to a commit (and a visible stale-evidence warning when checks/findings are for an older commit), resolve/accept findings, send back, or merge.
7. **⌘K command palette** (cmdk) for jumping to items/screens and running actions; `c` opens "new work item".
8. Show real file paths (`.scratch/…`, `docs/adr/…`) wherever an artifact appears.

## The three variants (must be structurally different)

- **A · Lists** — Linear-like. Persistent left sidebar (Needs you with count, Project, work items grouped by milestone, Agents). Dense keyboard-first lists (j/k, enter, esc). Work item = full page: header, horizontal stage rail, two columns (left: tabs Spec / Tickets / Runs / Files; right: properties panel with per-stage agents, branch, worktree, PR). Runs open as a full-width run view. Review = full page with file list left, diff center, findings in a right rail.
- **B · Pipeline** — no sidebar. Top bar with project name, a Needs-you counter that opens a slide-over queue, and ⌘K. Main view is a **board whose columns are workflow stages** (Clarify, Spec, Tickets, Implement, Review, Ship; items of all types placed by their active stage; a "Shipped" lane collapsed) with milestone as a swimlane/filter. Cards show agent avatars, live run pulse, blocked badge, needs-you badge. Clicking a card opens a **large right drawer** for the work item (stage rail, tickets, run stream); review opens in a near-fullscreen split overlay.
- **C · Cockpit** — conversation-centric three panes. Left: narrow tree (Needs you, items → tickets/runs). Center: the **run/session stream** is the primary surface (brief card at top, live events, inline question/permission cards, handoff card at end, composer to steer the agent at the bottom). Right: context panel with tabs (Spec, Tickets, Memory, Checks) that follows whatever is selected. Needs you = a stack of cards at the top of the center pane when nothing is selected. Review = center pane switches to diff mode with findings as inline threads.

## Visual language (all variants)

Linear-inspired: Inter (Google Fonts) / system UI, 13px base, dense rows (32–36px), hairline borders, subtle surfaces, restrained accent (indigo), status icons rather than colored pills, keyboard hints (`Kbd`). Dark-first with a light theme via `prefers-color-scheme` (tokens as CSS variables in `src/index.css`). Agent identity colors: Claude `#D97757`, Codex `#10A37F`, Grok `#A1A1AA`, Gemini `#4285F4`. Monospace for paths, commands and diffs. Motion: 120–180 ms, no bouncy animations. Must remain usable at 1280×800.
