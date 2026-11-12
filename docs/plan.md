# Stintwork: production plan

Status: draft for discussion · 2026-10-17. Vocabulary follows [`GLOSSARY.md`](../GLOSSARY.md). Decisions are recorded in [`docs/adr/`](adr/). The product is described in [`docs/brief.md`](brief.md).

## Goal

v0.1 lets one developer run `npx stintwork` in a real repo and take a feature from clarify to merge. Different agents do the stints, and the developer never writes context by hand. The board (Pipeline view) shows the state of the whole project at a glance.

## How we'll build it

- **Dogfood from the first milestone.** Stintwork's own plan and tickets live in this repo's `.scratch/`. From M1 on, Stintwork opens itself, and from M2 on it helps build itself.
- **Every milestone ends usable.** Each one is a vertical slice with an exit test on a real repo, not a layer.
- **Agents do most of the implementation**, verified by the developer and by checks. Tickets are written so an agent can take them without a conversation.

## Architecture

A TypeScript pnpm monorepo. The core is a deep module with no direct I/O; everything that touches the outside world sits behind it.

| Package | Responsibility |
|---|---|
| `core` | The project model: index of work items, tickets, specs and milestones from repo files; workflow and gate logic; stint lifecycle; attention items; brief compiler. Pure and fully unit-testable against fixture repos. |
| `agents` | The ACP client. Per-agent capability profiles (Claude Code, Codex, Grok Build), the permission-level mapping, and auth detection. Later, the terminal fallback. |
| `git` | Worktrees with dependencies installed and git writable, checkpoint commits, and `gh` for PRs and checks. |
| `server` | A local Hono server: HTTP plus WebSocket, a file watcher, and the wiring between core, agents and git. |
| `web` | React UI. The Pipeline view first, rebuilt from prototype variant B (not copied). Views only read state and send actions (ADR 0006). |
| `cli` | The `stintwork` bin for `npx`: finds the repo, starts the server and opens the browser. |

**Testing:**
- `core` gets fast unit tests on fixture repos.
- Stint lifecycle tests run against the fake ACP agent from `spikes/acp-probe/`.
- The probe becomes a contract test against the real agents, run manually and before releases.
- Web behaviour stays in jsdom; Playwright checks layout in a real browser (ADR 0010).

## Milestones

Sizes are relative (S, M, L), for one developer working with agents. They are not dates.

### M1 · The board (read-only) · M

`npx stintwork` opens a repo and shows its work on the board.

- The CLI and local server start, and the browser opens.
- Work items, specs and tickets are read from `.scratch/`, and milestones from `.stintwork/roadmap.md`.
- Each work item's stage comes from `workflow.yaml`, or is inferred from its files when there is none.
- The Pipeline board shows stage columns and cards; a drawer shows the spec and tickets in blocking order.
- Changes to the files appear on the board without a reload.
- Project setup detection shows what's missing (tracker config, AGENTS.md) but doesn't write anything yet.

**Exit test:** Stintwork opened on its own repo shows its own plan correctly. Editing a ticket's `Status:` line in an editor moves it on the board.

### M2 · The first stint (Codex only) · L

The developer starts a stint from a ticket, watches it, stops it, and resumes it from the handoff.

- The brief compiler produces pointers, the last handoff, what changed since, and the prompt, shown before starting.
- Worktree setup: one per work item, dependencies installed, git metadata writable by the agent.
- A Codex stint over ACP streams messages, tool calls, plans and file edits into the drawer.
- Stop, then the checkpoint commit (ADR 0004), then a handoff request. The handoff is stored in the stint log.
- Stint logs are written to `.stintwork/local/stints/`. Ticket status is read back from the files the agent updated.

**Exit test:** one real Stintwork ticket is implemented through Stintwork with Codex. It is stopped once and resumed from the brief, and all checks pass.

### M3 · Needs you and every agent · L

Stints can ask for things, stages move forward, and any of the three agents can take any stage. Spec: `.scratch/needs-you/spec.md`.

- The Needs-you queue of attention items: permission requests, stints that ended with unresolved handoff items (answered with a developer note in the next brief), stages ready for approval, and agents needing a login. Shown on cards, in the tab title, and as optional browser notifications.
- Gates are the developer's approval in M3, recorded in `workflow.yaml`. Checks-based gates move to M4.
- Stage-level stints on any stage with a skill (Clarify, Spec, Tickets, Implement, Review).
- Claude Code and Grok Build are added. Each stage has an agent picker, and missing logins show the command to run.
- Permission levels (Ask, Edit freely, Autonomous) are mapped onto each agent's modes, plus answers Stintwork gives itself, with explicit warnings for agents that can't honour a level.
- After a restart, stints stay `interrupted` and resume from the brief. Reattaching to agent processes is dropped: they end with the server.

**Exit test:** a Stintwork ticket is started with Claude Code, stopped, has a requirement changed, and is finished by Codex. No hand-written context, and every permission prompt is answered from the queue. The Implement gate is then approved from the queue.

### M4 · Review and ship · L

Work is reviewed with evidence tied to a commit, and shipped without leaving Stintwork. Spec: `.scratch/review-and-ship/spec.md`. Early M4 polish from the M3 exit lives in `.scratch/agent-polish/`.

- Review stints run `/code-review`. Findings are requested in a fixed format after the turn (as with handoffs), tied to the reviewed commit, and pinned to diff lines in the review overlay. Decisions (resolved, accepted, sent back) live in a review file in the work item folder.
- Checks are configurable local commands (`.stintwork/config`, defaulting to the project's scripts) run in the worktree and tied to a commit, plus the PR's CI checks from `gh` when a pull request exists. Stale evidence (findings or checks for an older commit) is flagged and blocks the Review gate.
- Memory proposals are derived from stints' changes to project memory files (glossary, decision records, AGENTS.md). You accept them, or reject them with a revert commit. Open proposals block shipping.
- Ship: open a pull request (push only after explicit confirmation) and merge it via `gh`, or merge locally when there's no remote. Merging removes the worktree and branch and marks the work item shipped.

**Exit test:** the full acceptance scenario in [brief §13](brief.md#13-first-milestone-acceptance-scenario) passes on a second real repo (a PagePilot copy).

Grok Build's end-to-end check (`.scratch/agent-polish/issues/04`) is deferred to Later: its API rate-limited every real stint, so M4 ships with Claude Code and Codex verified.

### M5 · v0.1 release · M

Someone else can use it. Spec: `.scratch/first-release/spec.md`.

- The first stages write files: create a work item, then Clarify, Spec and Tickets stints produce `spec.md` and tickets in `.scratch/`.
- Built-in workflows (Feature, Bug, Quick task) as YAML in `.stintwork/workflows/`, customisable by copying.
- Project setup for a repo without mattpocock's layout. It writes the tracker config and an AGENTS.md pointer, with confirmation.
- Roadmap editing for milestones.
- Packaging: the npm package `stintwork` (no native dependencies), CI with a packed-tarball smoke test, Apache-2.0 headers, README, and a short getting-started guide. Publishing and making the repository public each need the maintainer's confirmation.

**Exit test:** 3–5 developers outside the project install it and start a real task in their own repo within a minute, without help. Afterwards they say whether they'd keep using it.

### M6 · Chinese UI · M

A Chinese-speaking developer can use the whole web UI in Simplified Chinese. Spec: `.scratch/ui-language/spec.md`.

- A language switcher with browser-language detection and a saved choice.
- Chinese catalogs for the whole web UI, guarded by a catalog completeness test.
- Chinese product terms in `GLOSSARY.md`, used consistently in the UI.
- Follow-ups: Chinese-only titles (ticket 07) and translating text written by core and server (ticket 08).

**Exit test:** a Chinese-speaking developer runs a real stint end to end in Chinese, and a native speaker has reviewed the catalog.

## v0.2

### Goal

Make Stintwork ready for developers outside the project: finish the UI foundations, start fast, survive restarts, fit GitHub-tracked repos and work with more agents. Then release v0.2 and go public. Feedback from outside developers is gathered after the public release and sets later scope.

As of 2026-10-17, v0.1.0 was published on npm on 2026-10-11, and v0.1.1 on 2026-10-12. M1–M4 shipped. M5's implementation shipped; its deferred outside-developer test now follows the public release, outside v0.2. M6 shipped after the maintainer approved the Chinese UI on 2026-10-13; go-public 05 is resolved. M8 has only ui-foundations 07's human walk-through left. go-public 01 and 02 are built and merged, waiting on the maintainer. As of 2026-11-09, Grok Build's end-to-end ticket (agent-polish 04) is back in scope for M12 and needs the maintainer to sign in again. `tzrea1-Q/stintwork` stays private until M13.

**Rule:** if M11 runs long, M12 moves to v0.3 rather than delaying v0.2.

**Order:** finish M8's human walk-through, then M9, M10 and M11. M12 may run alongside. M7 stays active while its maintainer confirmations are pending. Development does not wait on an outside-developer test.

### M7 · Ready to go public · S

Prepare the repo for the public release. Spec: `.scratch/go-public/spec.md`.

- go-public 01: issue templates, CONTRIBUTING, SECURITY and the tracked-file and history scan are built and merged. The maintainer confirms the SECURITY route and support policy.
- go-public 02: repo links in both READMEs and npm metadata are built and merged. Any patch published before M13 carries them; the links become live when the repo is public.
- Making the repo public (go-public 03) moves to M13. The outside-developer test is outside v0.2.

**Exit test:** go-public 01 and 02 are resolved after the maintainer's confirmation. Public-link checks wait for M13 and do not block this exit.

### M8 · UI foundations · L

Every screen fits the supported widths in English and Chinese, with shared controls and browser checks. Spec: `.scratch/ui-foundations/spec.md`. The frontend decision is ADR 0010; every web change follows `docs/agents/frontend.md`.

- Wrap Radix primitives once in `packages/web/src/ui/`, styled with Tailwind utilities and shared CSS-variable tokens mapped into the theme.
- Use the system font stack. Migrate existing overlays, controls and feature CSS to the shared components and tokens.
- Check layout with Playwright at 1440, 1024, 768 and 390px in `en` and `zh-CN`; support a minimum width of 360px. Keep jsdom for behaviour.
- Cover every screen, with both colour schemes at 1440 and 390px. Save screenshots for review, not pixel comparisons.

**Exit test:** the browser suite passes in CI at all four widths in both languages, and the maintainer walks every screen at 1440, 768 and 390px in both languages without finding layout bugs. Only then is M8 set shipped.

### M9 · Fast first run · M

Open the board without downloading bundled native agent binaries the developer may already have. Spec: `.scratch/first-run/spec.md`.

- The maintainer saw a first `npx` run take a very long time on a real repo. Measured in this repo's `node_modules` on darwin-arm64 on 2026-10-17: `@anthropic-ai/claude-agent-sdk-darwin-arm64` is 225 MB and `@openai/codex-*-darwin-arm64` is 317 MB unpacked. Root dependencies `@agentclientprotocol/claude-agent-acp` 0.88.0 and `@agentclientprotocol/codex-acp` 2.1.1 pull them in even when the developer has the agent installed.
- Start with a research spike: how each adapter finds its agent, whether it can use the developer's installed CLI, and options such as installing an adapter on first use into a cache with pinned versions or using optional dependencies. Measure package and download sizes.
- If the spike changes how adapters are installed, write a decision record before implementation. Keep ADR 0002's pinned adapter-version guarantee, then file and implement the tickets.

**Exit test:** with an empty npm cache, `npx stintwork@latest` (or the packed tarball) shows the board within 60 seconds on a typical home connection. The download is a small fraction of today's, and a real stint still starts with each installed agent. The spike may tighten the size and time limits.

### M10 · Stints survive restarts · M

An active stint resumes after a server restart or crash. Spec: `.scratch/stint-resume/spec.md`.

- Automatically resume Claude Code and Codex through ACP `loadSession` in a new agent process, using the recorded source/executable and verified warm cache without startup downloads. The 2026-10-17 first-run probes passed for both Installed and Bundled sources; the 2026-10-09 spike also passed for Grok Build.
- A permission request that was waiting reappears in Needs you.
- If resume fails, today's behaviour applies: stop at a checkpoint, then let the developer start a new stint from the recorded state. Experimental Grok Build uses this fallback until current end-to-end verification in M12.

**Exit test:** kill the server partway through a real Codex stint and a real Claude Code stint. After restart both reach a handoff without a new brief.

### M11 · GitHub Issues as a tracker · L

A repo whose tracker config says GitHub shows top-level issues with a direct same-repository sub-issue or the `stintwork:work-item` label as work items, and their direct same-repository sub-issues as tickets, read through `gh`. Spec: `.scratch/github-tracker/spec.md`.

- Agents write issues through their own skills and `gh`; Stintwork only reads. Workflow and revision-bound gate records remain committed in the work item worktree.
- Accepted ADR 0013 supersedes ADR 0005 and narrows ADR 0001.

**Exit test:** a real repo that tracks work in GitHub Issues takes one ticket from the board to a merged PR.

### M12 · More agents · M

Verify Grok Build and add Antigravity CLI over ACP ([ADR 0018](adr/0018-antigravity-cli-for-m12.md)).

- Verify Grok Build end to end (agent-polish 04) after the maintainer signs in again.
- Probe Antigravity CLI, then add its capability profile, permission mapping and restart behavior. It remains experimental until the M12 exit.

**Exit test:** one real stint each with Grok Build and Antigravity CLI, each ending in a parsed handoff.

Shipped 2026-11-10. Antigravity CLI passed. Grok Build's real stints were all rate limited on the maintainer's account; the maintainer accepted this as a known limitation, so Grok Build stays experimental and agent-polish 04 is deferred.

### M13 · v0.2 release and going public · S

Publish the release after its milestones pass.

- Write release notes, including the Project setup fix (never replacing an existing tracker by default) and Fast first run; the maintainer held the 0.1.2 patch for v0.2.
- Run the ACP probe as a contract test against every agent.
- Publish with the maintainer's confirmation.
- The maintainer makes `tzrea1-Q/stintwork` public. Carry out go-public 03's public-repo checks.

**Exit test:** the ACP contract tests pass for every agent, v0.2 is on npm with release notes, and the repo is public. CI, both README renders and links, and issue templates are checked on the public repo, along with SECURITY's private reporting route.

Shipped 2026-11-10: `stintwork@0.2.0` published from `33125f8` (tag `v0.2.0`) and the repo made public. Grok Build's contract counted as an accepted limitation, recorded as an open issue below.

## v0.3

**Goal:** Make the shipped web UI clearer and more comfortable to use.

### M14 · Visual refresh · L

Spec: `.scratch/visual-refresh/spec.md`. Decision: ADR 0019.

- Adopt shadcn/ui with Radix, shared tokens, bundled fonts and a separately designed dark scheme.
- Rebuild the top bar, Overview, Pipeline and work item detail from Variant D; preserve existing actions and snapshot state.
- Restyle existing dialogs and overlays, and check every screen in a real browser.

**Exit test:** the browser suite passes at 1440, 1024, 768 and 390px in `en` and `zh-CN` and both colour schemes, and the maintainer walks Overview, Pipeline with the detail panel, Needs you and every dialog at 1440, 768 and 390px in both languages and accepts the result.

Shipped 2026-11-11: all eight visual-refresh tickets resolved; 460 Playwright cases passed and the maintainer accepted the walk-through.

### M15 · Visual fidelity · M

Spec: `.scratch/visual-fidelity/spec.md`. Reference: Variant D, ADR 0019.

- Bring type hierarchy, top bar, board cards, detail identity, Overview dashboard and overlays to Variant D's fidelity, using only existing snapshot data.
- Compare every ticket side by side with Variant D on a rich fixture and on this repository's data.

**Exit test:** the browser suite passes at 1440, 1024, 768 and 390px in `en` and `zh-CN` and both colour schemes, and the maintainer compares Overview, Pipeline with the detail panel, Needs you and every dialog against Variant D at 1440, 768 and 390px in both languages and accepts the result.

### Open questions for v0.2

1. **GitHub tracker files — decided.** The parent issue body is the spec; the issue-keyed committed workflow file holds revision-bound approvals. See ADR 0013 and `.scratch/github-tracker/spec.md`.
2. **M9 targets.** The spike sets the size and time limits.

### After the public release

- Run the outside-developer test with 3–5 developers (go-public 04 and first-release 12). It is outside v0.2 and does not gate development or release.
- Fix what they ran into (the old M9). Set the scope from real outside feedback after the public release.
- **Open issue: Grok Build is unverified end to end.** Every real Grok stint and most contract scenarios returned HTTP 429 (included usage exhausted) on the maintainer's account, so v0.2 shipped with Grok experimental and its contract as an accepted limitation. Reopen [agent-polish 04](../.scratch/agent-polish/issues/04-grok-end-to-end.md) on an account with available usage: one real stint with a parsed handoff and a full contract run, including Ask with a non-always-approve config.
- Antigravity CLI native restart ([more-agents 07](../.scratch/more-agents/issues/07-antigravity-native-restart.md)): the v0.2 contract showed new-process `session/load` works.

### Later (not in v0.2)

- The terminal fallback for agents without ACP (moved from M5: it needs a native module, `node-pty`, that would make `npx` installs fragile, and every v0.1 agent works over ACP). Revisit if Claude's ACP billing risk materialises.
- The Lists and Cockpit views.
- A desktop wrapper.
- Parallel stints on one work item.
- A visual workflow editor.
- Teams.

## Risks

| Risk | Mitigation |
|---|---|
| ACP adapters change or regress | Pin adapter versions; run the probe as a contract test before each release (ADR 0002) |
| Provider rules on subscription use change again | Use only the developer's own CLIs and logins (ADR 0003); support API-key login; the terminal fallback (now Later) would keep every agent usable |
| State drifts after crashes or restarts | M10 resumes active stints through ACP; derive state from files and git, keep checkpoint and stint-log recovery when resume fails |
| Scope creep toward a "platform" | The "Later" list and brief §12 bound scope; if M11 runs long, M12 moves to v0.3 rather than delaying v0.2 |
| Installing adapters on first use could fail offline | M9's spike sets cache, offline and failure handling before choosing an installation approach |
| One maintainer's bandwidth | Agents implement tickets via Stintwork itself from M2; Codex delegation for parallel work |

## Settled (2026-10-09)

1. **Stage without `workflow.yaml`:** infer it from the files, show it as inferred, and write `workflow.yaml` the first time the developer acts on the work item.
2. **`.scratch/` is committed.** It is the project record (ADR 0001).
3. **Permission levels:** *Ask* (every edit and command), *Edit freely* (edits in the worktree without asking, ask before commands outside a safe list), and *Autonomous* (anything inside the worktree). **Edit freely is the default.** Each agent gets a mapping table in M3.
4. **Gate approvals are recorded in `workflow.yaml`** (who, when, at which commit), so specs and tickets stay in mattpocock's format.
5. **Node 22+ and pnpm**, matching PagePilot and the prototype.

Stintwork's own work is tracked in `.scratch/`, and milestones in `.stintwork/roadmap.md`.
