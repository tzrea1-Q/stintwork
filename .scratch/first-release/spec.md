# v0.1 release

Status: ready-for-agent

Milestone: M5 · v0.1 release. See `docs/plan.md`, `docs/brief.md` (§4 principles, §6 on-disk format, §7 built-in workflows, §11 architecture), `GLOSSARY.md` (Project, Work item, Workflow, Stage, Gate, Skill, Stint, Brief, Milestone, Project memory) and ADRs 0001, 0003, 0005, 0007, 0008 and 0009.

## Problem Statement

Stintwork works, but only for its author. After M4, an existing work item can go from Implement through Review to Shipped without leaving Stintwork. Everything before that still happens outside it:

- A work item is born when someone hand-writes a `.scratch/<slug>/` folder.
- Specs and tickets come from running `/to-spec` and `/to-tickets` in an agent's own terminal. Those skills pick their own folder, so the result may not land where Stintwork looks.
- The Feature, Bug and Quick task workflows are hard-coded, so a developer whose team uses different skills can't adapt them.
- A repo that doesn't already follow mattpocock's layout shows a "Setup 1/5" chip and nothing that fixes it.
- Milestones are edited by hand in `.stintwork/roadmap.md`.
- Above all, there is no package. `npx stintwork` fails because every package is private and the CLI depends on unpublished workspace packages. The README still says "planning, no production code".

A developer outside the project could not install it, let alone start a real task in their own repo within a minute.

## Solution

Make Stintwork usable by someone else, from an empty idea to a shipped change, in their own repo:

- **Create a work item.** Press `c` (or use ⌘K) and give a title, a workflow and optionally a milestone and a few sentences of intent. Stintwork creates the feature folder and puts the card in the first stage of the workflow.
- **The first stages write files.** Clarify, Spec and Tickets stints run their skills against that exact folder. Clarify leaves glossary and decision-record changes as memory proposals, Spec leaves `spec.md` and Tickets leaves `issues/NN-*.md` in dependency order. Each stage's gate becomes ready when its output exists and parses, and the developer approves it as in M3.
- **Workflows are YAML files.** The built-in Feature, Bug and Quick task workflows ship as YAML. "Customise" copies one into `.stintwork/workflows/`, where the developer can change skills, default agents and stages. Invalid files fall back to the built-in with a warning.
- **Guided setup.** In a repo without mattpocock's layout, the Setup chip opens a short guide. It shows exactly which files it will add or change, with a diff for each: the tracker config, the AGENTS.md pointer, a CLAUDE.md pointer, the `.gitignore` entry and a starter roadmap. It writes them only after confirmation, in one commit. It also tells the developer, per agent, whether the stage skills look installed and how to install them.
- **Roadmap editing.** Add, rename, reorder and set the status or target of milestones, and move work items between them, from the board. Each change is one commit to `.stintwork/roadmap.md`.
- **A real package.** `npx stintwork` installs one published npm package that bundles the server, the web app and the agent adapters. It starts in any git repo. A CI job packs the tarball, installs it outside the monorepo and starts it. The README and a short getting-started guide explain installing, logging in to an agent, the three concepts and the first task. Every source file carries an Apache-2.0 SPDX header.

The terminal fallback for agents without ACP moves to Later: it needs a native module that would make installs fragile, and every agent v0.1 targets works over ACP.

## User Stories

### Install and first run

1. As a developer trying Stintwork, I want to run `npx stintwork` in my repo and see the board in my browser, so that I can try it without cloning or building anything.
2. As a developer, I want the first run to finish installing and open the board in under a minute on a normal connection, so that I keep my momentum.
3. As a developer, I want `stintwork --version` and `stintwork --help` to work from the installed package, so that I can check what I'm running.
4. As a developer, I want a clear message when I run it outside a git repository or on an unsupported Node version, so that I know what to fix.
5. As a developer, I want my existing specs and tickets to show up on the board straight away, so that I see value before any setup.
6. As a developer with no agent logged in, I want the board to tell me which login command to run for each agent, so that I'm not stuck at the first stint.
7. As a developer, I want the package to install without native build tools, so that it works on a fresh laptop.
8. As a developer, I want the installed package to bring the Claude Code and Codex ACP adapters with it, so that I don't install adapters by hand.
9. As a developer, I want Stintwork to keep using my own agent CLIs and logins (ADR 0003), so that nothing new holds my credentials.

### Creating a work item

10. As a developer, I want to press `c` anywhere on the board to create a work item, so that capturing an idea is instant.
11. As a developer, I want to create a work item from ⌘K too, so that it works from the keyboard everywhere.
12. As a developer, I want to choose the workflow (Feature, Bug, Quick task or one of my own) when creating, so that the work item gets the right stages.
13. As a developer, I want to give the work item a title and a few sentences of intent, so that the first stint knows what I asked for.
14. As a developer, I want to pick a milestone when creating, so that the roadmap stays accurate without a separate edit.
15. As a developer, I want the folder name (slug) derived from the title and shown before I confirm, so that I know where the files will live.
16. As a developer, I want a clear refusal when the slug already exists or is invalid, so that I never overwrite another work item.
17. As a developer, I want creating a work item to make one commit with its own message, so that history shows when it was created.
18. As a developer, I want the new card to appear in the workflow's first stage immediately, so that I can start its first stint.
19. As a developer, I want my intent text included in the first stint's brief, so that I don't retype it into the agent.
20. As a developer, I want a work item with only its workflow file and no spec yet to be a valid work item on the board, so that newly created items aren't hidden or warned about.

### Clarify, Spec and Tickets stints

21. As a developer, I want a Clarify stint to run the Clarify skill against my work item's intent and the project memory, so that open questions get resolved before a spec.
22. As a developer, I want glossary and decision-record changes made during Clarify to come to me as memory proposals, so that project memory changes only with my consent.
23. As a developer, I want to mark Clarify done myself when I'm satisfied, so that the gate reflects my judgement and not a file check.
24. As a developer, I want a Spec stint to write `spec.md` in exactly this work item's folder, so that the skill doesn't invent a new folder Stintwork can't see.
25. As a developer, I want the Spec gate to become ready only when `spec.md` exists and parses, so that I don't approve an empty stage.
26. As a developer, I want a Tickets stint to write `issues/NN-*.md` files in this work item's folder, numbered in dependency order with `Status:` and `Blocked by:` lines, so that Implement can start on the frontier.
27. As a developer, I want the Tickets gate to become ready only when at least one ticket exists, all tickets parse without warnings and the blocking order is valid, so that Implement doesn't start on broken tickets.
28. As a developer, I want the gate view to say what's missing when a gate isn't ready, so that I know whether to start another stint or edit by hand.
29. As a developer, I want to edit the spec or tickets by hand between stints, so that I stay in control of the content.
30. As a developer, I want changes I make to the spec or tickets after a handoff listed in the next brief, as for Implement, so that the agent works from the current files.
31. As a developer, I want Spec and Tickets stints to commit their output at the checkpoint like any other stint, so that every stage leaves history.
32. As a developer, I want a Bug's Diagnose stage and a Quick task's Do stage to work the same way, so that every workflow can start from Stintwork.

### Workflows as YAML

33. As a developer, I want the built-in workflows to be readable YAML files, so that I can see exactly which skills and agents each stage uses.
34. As a developer, I want to copy a built-in workflow into `.stintwork/workflows/` with one action, so that I can customise it without writing YAML from scratch.
35. As a developer, I want to change a stage's skill, default agent, name or gate in my copy, so that the workflow matches the skills my team uses.
36. As a developer, I want to add or remove stages in my copy, so that a workflow can be shorter or longer than the built-in.
37. As a developer, I want my repo's workflow file with the same id to replace the built-in, so that customising doesn't need new names.
38. As a developer, I want a new workflow id in `.stintwork/workflows/` to appear as a choice when creating a work item, so that I can define my own kinds of work.
39. As a developer, I want an invalid workflow file reported as a warning, with work items on it falling back to the built-in, so that a typo never hides my board.
40. As a developer, I want workflow files committed with the repo, so that everyone working on the project shares them.
41. As a developer, I want every workflow to end in a Ship stage, so that review and merge always work.

### Guided setup

42. As a developer opening a repo without mattpocock's layout, I want the Setup chip to open a guide that lists what's missing, so that I know what Stintwork needs.
43. As a developer, I want to see the exact content or diff of every file setup will create or change before it writes anything, so that nothing surprises me.
44. As a developer, I want setup to add the tracker config saying issues are local Markdown in `.scratch/`, so that agents' skills and Stintwork agree on where work lives.
45. As a developer, I want setup to add an "Agent skills" pointer block to AGENTS.md, creating the file if needed and never rewriting what's already there, so that every agent finds the conventions.
46. As a developer, I want setup to add a one-line CLAUDE.md pointing to AGENTS.md when CLAUDE.md is missing, so that Claude Code reads the same instructions as Codex.
47. As a developer, I want setup to add `.stintwork/local/` to `.gitignore`, so that stint logs never get committed.
48. As a developer, I want setup to create a starter `.stintwork/roadmap.md`, so that milestones work from day one.
49. As a developer, I want to choose which of the proposed changes to apply, so that I can skip ones I don't want.
50. As a developer, I want setup to write everything in one commit with its own message, so that I can revert it in one step.
51. As a developer, I want setup to refuse when the files it would change have uncommitted edits, so that it never mixes with my work.
52. As a developer, I want to see, for each agent, whether the stage skills (for example `/to-spec`) look installed, with install instructions when they don't, so that the first Spec stint doesn't fail on a missing skill.
53. As a developer, I want the skill check to say "can't tell" instead of guessing when it can't see an agent's skills, so that I'm not misled.
54. As a developer, I want Stintwork to never install skills or change agent configuration itself, so that my agents stay under my control.

### Roadmap editing

55. As a developer, I want to add a milestone from the board, so that I don't hand-edit Markdown.
56. As a developer, I want to rename a milestone and set its status (planned, active, shipped) and target date, so that the roadmap reflects reality.
57. As a developer, I want to reorder milestones, so that the roadmap shows what comes next.
58. As a developer, I want to move a work item to another milestone, so that re-planning is one action.
59. As a developer, I want each roadmap change to be one commit with its own message, so that roadmap history is readable.
60. As a developer, I want hand-written text in the roadmap file preserved when Stintwork edits it, so that my notes aren't lost.
61. As a developer, I want a roadmap edit refused when the file has uncommitted hand edits, so that Stintwork never overwrites them.

### Docs and licence

62. As a developer arriving at the repository, I want a README that says what Stintwork is, how to run it, and its status, so that I can decide in a minute whether to try it.
63. As a developer, I want a short getting-started guide covering installing, logging in to an agent, the three concepts, and taking a first work item from creation to shipped, so that I can succeed without help.
64. As a developer, I want the README to say which agents are verified (Claude Code, Codex) and which are experimental (Grok Build), so that I know what to expect.
65. As a contributor, I want every source file to carry an Apache-2.0 SPDX header, enforced by a check, so that the licence is unambiguous.
66. As a contributor, I want CI to build, test and smoke-test the packed package on Linux and macOS, so that a broken package never ships.

### Release

67. As the maintainer, I want the package version, changelog and release notes prepared by the release work, so that publishing is one deliberate step.
68. As the maintainer, I want publishing to npm and making the GitHub repository public to happen only when I confirm each, so that nothing goes public by accident.
69. As the maintainer, I want 3–5 developers outside the project to install it and start a real task in their own repo without help, and say whether they'd keep using it, so that v0.1 is proven on people other than me.

## Implementation Decisions

- **Creating a work item** is a new server action on the main checkout: title, workflow id, optional milestone and optional intent. The server derives a kebab-case slug from the title (ASCII, lower case, at most 48 characters) and returns it in a preview before confirmation. It refuses existing or invalid slugs. On confirmation it writes `.scratch/<slug>/workflow.yaml` with the workflow, the first stage and the intent (a new `intent` field). It adds the slug to the chosen milestone in `.stintwork/roadmap.md`, and commits both as "Create work item <slug>" (agent-polish 03's one-message-per-write rule). It refuses while those paths have uncommitted changes. No worktree is created until the first stint (unchanged).
- **Indexing:** a feature folder containing only `workflow.yaml` is a valid work item with no spec and no tickets. Its stage comes from `workflow.yaml` as today. Core's work-item indexer stops requiring a spec or issues folder when a valid `workflow.yaml` exists.
- **Briefs for the first stages** name the exact output location: "Write the spec to `.scratch/<slug>/spec.md`", "Write tickets to `.scratch/<slug>/issues/` as `NN-<slug>.md`, numbered from 01 in dependency order, each with `Status: ready-for-agent` and a `Blocked by:` line", and "Do not create another work item folder". The intent from `workflow.yaml` is included as "What the developer asked for" in every stage's brief, not only the first. Stage-level stints already run in the work item's worktree (ADR 0009), so their outputs are read from there and committed at the checkpoint.
- **Gate readiness per stage** extends M3's rule with an output condition, expressed in the workflow definition as `gate: manual | spec | tickets | evidence | merge`. `manual` is the developer's approval with no file check (Clarify, Diagnose, Do). `spec` additionally needs a parsing `spec.md`. `tickets` needs at least one ticket, no warnings, and valid dependency order. `evidence` is M4's Review rule. `merge` is the Ship stage. The gate view lists the output condition with the other conditions and what to do about it.
- **Memory changes during Clarify** use M4's memory proposals unchanged. Open proposals block the Clarify gate, as they block Review.
- **Workflows as YAML:** the built-ins move from code to YAML files bundled with the package. A workflow file has `id`, `name`, `defaultAgent` and an ordered `stages` list, each with `id`, `name`, `column` (one of the six board columns), `skill` (a slash command or null), `gate` and an optional `agent`. Core validates: unique stage ids, a known column, a known gate kind, and the last stage being a `merge` gate in the `ship` column. Repo files in `.stintwork/workflows/*.yaml` override built-ins by id or add new ids. Invalid files produce warnings, and work items on them fall back to the built-in with the same id (or Feature). The workflow id type becomes an open string validated against the loaded set. A "Customise" action copies a built-in into `.stintwork/workflows/<id>.yaml` after confirmation, committed as "Customise workflow <id>".
- **Guided setup** extends core's existing setup detection into a plan: a list of proposed file changes, each with its full new content or a diff. They are the tracker config at `docs/agents/issue-tracker.md` (local Markdown in `.scratch/`, as `setup-matt-pocock-skills` writes it); an "## Agent skills" block in AGENTS.md (appended, or AGENTS.md created; existing content never rewritten); a one-line CLAUDE.md when it's missing; a `.stintwork/local/` entry in `.gitignore`; and a starter `.stintwork/roadmap.md`. The server applies only the items the developer selects, refuses if any target has uncommitted changes, and commits once as "Set up Stintwork". The Setup chip opens the guide; it no longer only counts.
- **Skill availability** is best-effort and read-only. Each agent profile declares where its skills can live (for Claude Code, the user's and the project's skills directories; for Codex, its skills or prompts directories). Setup reports, per agent and per stage skill of the loaded workflows: found, missing (with mattpocock/skills install instructions), or can't tell. Stintwork never installs skills or edits agent configuration.
- **Roadmap editing** goes through core's roadmap parser and a new serialiser that rewrites only the fields it owns (heading, `Id`, `Status`, `Target`, the work-item list). It keeps any other lines in each milestone section and any text before the first milestone. Server actions add, rename, reorder and update milestones and move work items. Each is one commit ("Update roadmap: <what>"), refused when the roadmap has uncommitted changes. Milestone ids are derived once at creation and never change on rename.
- **Packaging:** one published npm package named `stintwork` containing the CLI, the bundled server, core, agents and git code, and the built web app. Workspace packages stay private and are bundled at build time, and real third-party dependencies remain normal dependencies, including the ACP adapters and `@agentclientprotocol/sdk`. The package has no native dependencies. `engines.node` is `>=22.12`. Only the built output, README, LICENSE and the bundled workflow YAML are in the package. The version for this milestone is `0.1.0`.
- **Licence headers:** every TypeScript, JavaScript, CSS and HTML source file starts with `SPDX-License-Identifier: Apache-2.0`. A repo check script, run in CI and in the project's checks, fails on a missing header.
- **CI** keeps the current job and adds a packed-tarball smoke job on Ubuntu and macOS. It also updates the GitHub Actions versions that GitHub warned target Node 20.
- **Docs:** the README is rewritten for users (what it is, install, first run, verified agents, status, links). It drops "planning, no production code", and AGENTS.md's same line is updated. A getting-started guide in `docs/` walks the first work item end to end. `docs/plan.md` M5 drops the terminal fallback, which moves to Later.
- **Release and publishing:** the release work prepares the version, a changelog entry and release notes, and runs the smoke test. `npm publish` and making the GitHub repository public are separate, explicit steps that need the maintainer's confirmation each time. No ticket performs them automatically.
- **Terminal fallback:** moved to Later (decided with the developer when this spec was written). The ACP-only agent list stays Claude Code, Codex, and Grok Build (experimental).

## Testing Decisions

- **Good tests check external behaviour:** API responses, WebSocket frames, files and commits in temporary repos, rendered UI, and for packaging, what an installed package actually does. Tests that read this repo's own `.scratch/` assert only durable properties (AGENTS.md).
- **Main seam: the server against the scriptable fake ACP agent**, as in M2–M4. Server tests cover:
  - creating a work item: preview, refusal for duplicates, invalid titles and dirty paths, the commit, the roadmap entry, the card in the first stage, and the intent in the brief;
  - Clarify, Spec and Tickets stints whose fake agent writes the expected files, with the gate becoming ready only on valid output, and wrong-folder output leaving the gate not ready with a reason;
  - repo workflow files overriding and adding workflows, invalid files falling back with warnings, and Customise writing a committed copy;
  - setup plans for bare repos and partially set-up repos, selective apply, refusal on dirty targets, and the single commit;
  - roadmap actions producing the expected files and commits while preserving hand-written text.
- **New seam: packed-tarball smoke test.** Build and pack the real `stintwork` package. Install the tarball into an empty temporary directory outside the monorepo, run `stintwork --version` and `--help`, start it in a fresh temporary git repo without opening a browser, and check `/api/health` and `/api/project`. It runs in CI on Ubuntu and macOS and locally on demand. It is the only test that proves `npx stintwork` works outside the workspace.
- **Core tests (pure):** workflow YAML validation and fallback, slug derivation, gate readiness per gate kind, the setup plan for each combination of missing files, roadmap serialisation round trips (parse, edit, serialise keeps unknown lines), and skill-availability classification from fixture directory listings.
- **Web component tests:** the create dialog (slug preview, workflow choice, refusals), the gate view's output condition, the setup guide (diffs, selection, confirmation), roadmap editing controls, and Customise workflow.
- **Prior art:** the M2–M4 server suites (stints, gates, memory proposals, ship), core's existing setup, roadmap and stage tests, the board and drawer component tests, and the fake executable on PATH used for `gh` and pnpm.
- **Manual (coordinator):** a real Claude or Codex Spec stint and Tickets stint on a fresh work item created from the board in a throwaway repo, run to resolved tickets; guided setup on a repo without mattpocock's layout; `npx` against the packed tarball on a clean machine profile.
- **Exit test:** 3–5 developers outside the project install Stintwork and start a real task in their own repo within a minute, without help, then say whether they'd keep using it. The coordinator records the results.

## Out of Scope

- The terminal fallback for agents without ACP (moved to Later).
- Grok Build end-to-end verification (deferred to Later, agent-polish 04).
- The Lists and Cockpit views, GitHub Issues, more ACP agents, a desktop wrapper, parallel stints on one work item, a visual workflow editor, teams.
- Installing skills or editing agent configuration on the developer's behalf.
- Publishing to npm or making the repository public without the maintainer's explicit confirmation.
- Workflows with branches or optional stages; a workflow is an ordered list of stages.

## Further Notes

- **Decisions made while writing this spec:** the test seams (server against the fake ACP agent, plus a packed-tarball smoke test), and moving the terminal fallback to Later.
- The skills `/to-spec` and `/to-tickets` decide their own output folder when run by hand. The brief's explicit paths and the gate's output check are what keep them inside the work item. A real Spec stint should be checked early, because this is where real agents are most likely to drift.
- The bundled ACP adapters pin the versions verified in M2–M4. Rerun the ACP probe before release if they change (AGENTS.md).
