# Changelog

All notable changes to Stintwork are recorded here, in Keep a Changelog style.

## 0.2.0 — 2026-11-10

- Project setup preserves existing tracker guides by default and previews an explicit switch to local Markdown.
- English and Simplified Chinese UI, responsive layouts and shared controls across the application.
- Faster first run: prepare only the selected Claude Code or Codex adapter at first stint, using a compatible Installed source or a pinned Bundled fallback.
- Automatically attempt to recover eligible Claude Code and Codex stints after a server restart; failed recovery falls back to a checkpoint and a new stint.
- Read GitHub Issues as project memory through `gh`, with work items, tickets and revision-bound gate evidence; apart from its pull request flow, Stintwork only reads GitHub, while agents write issues through their own skills and `gh`.
- Generate a parent-closing keyword for new GitHub-tracked Ship pull requests. GitHub closes the parent when merged into the default branch.
- Add experimental Antigravity CLI via installed `agy` (1.5.3 or newer, excluding 2.x), with Stintwork permission decisions and checkpoint fallback after restart. Grok Build remains experimental and real-stint verification is deferred due to rate limiting on the maintainer's account.
- Prepare private vulnerability reporting, a latest-published-version security support policy, and repository, homepage and bugs package metadata.
- Add a pre-release ACP contract harness; its fake-agent self-test is `pnpm test:acp-contract`. Real-agent results for the release revision are pending.

See the [release notes](docs/release-notes/0.2.0.md) for verification and limitations.

## 0.1.1 — 2026-10-12

### Local data and checkpoints

- `.stintwork/local/` ignores itself, including stint logs, check logs and pull request check records. Stintwork no longer edits the project's `.gitignore` outside confirmed guided setup.
- Checkpoints exclude likely secrets, files over 1 MiB and generated directories such as `node_modules/`, `dist/`, `build/` and `coverage/`. Excluded paths appear in the handoff, Review and Needs you without showing file contents.
- Every commit added during a stint is scanned for risky files. The Review gate condition "No risky files on the branch" blocks shipping until each file is removed or accepted with a reason. Per-file Accept decisions are tied to the file's blob, so changing it requires another decision. Detection uses paths and sizes, not file contents.

### Stints and gates

- Quick's Do stage starts from the intent without tickets, using `/implement`. Bug's Diagnose stage also starts without tickets. Ticket-scoped Do stints still work.
- Do without tickets needs a finished stint before its gate can be approved.
- Gate approvals commit `workflow.yaml` even before a worktree exists. Failed commits restore the file rather than leaving an uncommitted gate change.
- Agents have one 60-second startup budget. A timeout explains that the machine may be busy and asks the developer to try again.
- Codex availability is checked before a stint. A missing CLI or login disables it in the agent picker and raises an attention item with the next step. Refresh agent availability reruns the check without authenticating or prompting for work.

### Documentation

- Both READMEs explain Stintwork for newcomers, where to run `npx stintwork` in the developer's own project, and how to install and sign in to the agents they want to use.
- The package includes the Simplified Chinese `README.zh-CN.md` alongside `README.md`.

### Review and shipping carried over from 0.1.0

These behaviours were already in the published 0.1.0 package. They remain in 0.1.1.

- Real `gh pr checks` output saying "no checks reported" is handled as no CI checks. Merge remains blocked rather than showing a raw command failure.
- Review diffs work when the project's main branch is `master` rather than `main`.
- Pull request merge-method selection honours readable linear-history protection by choosing an allowed squash or rebase method. It refuses when neither is allowed and shows the chosen method before confirmation.

See the [release notes](docs/release-notes/0.1.1.md) for upgrade instructions and known limitations.

## 0.1.0 — 2026-10-11

### Added

#### Board

- Local Pipeline view with stage columns, work item progress, milestone filters and a work item drawer.
- Specs and tickets read from `.scratch/`, with tickets shown in dependency order and malformed files reported as warnings.
- Live updates from project files, including each work item's worktree once it exists. The drawer shows that path and warns about divergence from the main checkout.
- Stage inference for existing work items without `workflow.yaml`, and a command palette for board actions.

#### Work items and workflows

- Create a work item with a title, intent, workflow and optional milestone. Preview its folder before confirming one commit. Existing folders and uncommitted target paths are refused.
- Built-in Feature, Bug and Quick workflows as bundled YAML. Project files in `.stintwork/workflows/` can override them or add workflows. Invalid files fall back with a warning.
- Customise previews and copies a built-in workflow into the project in one commit.
- Clarify, Spec and Tickets stints work in the work item's folder. Briefs name the expected spec and ticket paths, so output in another folder does not satisfy the gate.

#### Stints and agents

- Claude Code and Codex over ACP, using the developer's installed CLIs and logins. Grok Build is registered as experimental and is not verified end to end.
- Brief previews with the stage skill, project-file pointers, intent, last handoff and changes since it.
- One worktree per work item, dependency setup, and git access for the agent. Stint streams show messages, tool calls, plans, file edits and permission requests.
- Stop, checkpoint and handoff, then resume in another stint with the same or a different agent. History and stream replay survive server restarts; unfinished stints are marked interrupted.

#### Needs you and gates

- Needs you gathers attention items for questions, permission requests, login requirements, gate approvals and memory proposals. Developer notes carry unresolved handoff answers into the next brief.
- Ask, Edit freely and Autonomous permission levels, with agent-specific warnings. Edit freely is the default; levels depend on requests the agent actually sends.
- Stage gates show their readiness conditions. Spec requires a parsing spec; Tickets requires valid tickets in dependency order. Approvals record who, when and which commit in `workflow.yaml`, with actions to reopen earlier stages.
- Changes to `GLOSSARY.md`, `docs/adr/` and `AGENTS.md` become memory proposals to accept or reject. Open proposals block the relevant gates and shipping.

#### Review and checks

- Review stints assess Standards and Spec without implementing fixes. The review view shows the diff, findings, decisions and checks for the reviewed commit.
- Resolve findings, accept them with a reason or send work back for implementation. Code changes make old evidence stale and require a new review and checks.
- Local checks configured in `.stintwork/config`, or selected from existing project scripts. Results record the command, output and checked commit; pull request CI is read through `gh`.
- The Review gate requires current review evidence, decided findings, passing checks and no open memory proposals.

#### Shipping

- Merge locally after Review approval, with conflict checks and refusals for uncommitted worktree changes or overlapping main-checkout changes.
- Open a GitHub pull request through `gh`, with explicit confirmation before pushing. Merge confirmation shows the selected method and accounts for readable linear-history protection.
- Successful merges record the merge commit, remove the worktree and branch, and mark the work item Shipped. Stint history and evidence remain available.

#### Setup and roadmap

- Guided setup previews tracker conventions, agent instruction pointers, the local-log ignore entry and a starter roadmap. Apply only selected changes in one commit; uncommitted target files are refused.
- Read-only stage-skill availability reports for each agent: found, missing or can't tell. Stintwork does not install skills or change agent configuration.
- Add, rename and reorder milestones, edit their status or target date, and move work items between them. Each roadmap edit is one commit and preserves hand-written text.
- User README and a getting-started guide from the first work item to Shipped.

#### Packaging

- A single npm package containing the CLI, server, web app and workflow YAML, with the Claude Code and Codex ACP adapters as dependencies. It requires Node.js 22.12 or newer and has no native dependencies.
- CLI options `--no-open`, `--help` and `--version`.
- Packed-tarball smoke tests passed locally and in CI on `ubuntu-latest` and `macos-latest` on 2026-10-11. Installation used 128 packages with no native modules.
- A full installed-tarball run on a fresh project covered guided setup, work item creation, real Codex stints, review, checks and a local merge to Shipped.
- Apache-2.0 licensing with source-header checks.

See the [release notes](docs/release-notes/0.1.0.md) for starting instructions, verification limits and deferred work. The package is published on npm.
