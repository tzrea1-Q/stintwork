# Getting started

Take a first Feature work item through Clarify, Spec, Tickets, Implement, Review and Ship. Use a small change in a repository you can safely experiment with. The final step merges it; finishing a stint alone does not make it Shipped.

## 1. Open your project

You need Node.js 22.12 or newer, Git and at least one installed agent CLI on PATH. Start from the project's main checkout and main branch. Commit the project files you want the agent to see before its first stint.

Run this in your own project's git repository, not the Stintwork repository; npx downloads Stintwork from npm for you.

```bash
cd /path/to/your/project
npx stintwork
```

The CLI finds the git repository containing the current directory and shows that project's work items on the board. Work item worktrees are created next to the project at `<project>-worktrees/<slug>`. Running outside a git repository exits with an error. It prints a local address and opens the browser. Leave the terminal open while you use the board.

Add `--no-open` to start without opening a browser; open the printed address yourself. `--help` lists the options and `--version` prints the package version. Ctrl+C stops the server.

## 2. Set up your agents

Stintwork uses your own installed agent CLIs and logins: for each agent you want it to use, install its CLI on PATH and sign in from another terminal.

| Agent | CLI | Sign in | Status |
|---|---|---|---|
| Claude Code | `claude` | `claude auth login` | Verified over ACP |
| Codex | `codex` | `codex login` | Verified over ACP |
| Grok Build | `grok` | `grok login` | Experimental; not verified end to end |

Stintwork includes the Claude Code and Codex ACP adapters, not their CLIs or logins; it does not handle your credentials. Set up at least one agent to start; you can set up several, choose one per stage or stint, and switch between stints.

When a missing CLI or login is detected, the agent picker disables that agent and shows an installation or sign-in hint; detected login requirements also appear in **Needs you** with the login command and **Refresh agent availability**. Sign in, refresh availability there and start another stint.

Use Claude Code or Codex for this guide.

## 3. Review guided setup and skills

Open **Setup** at the top of the board. Expand each preview. In a project without these files, setup proposes:

- `docs/agents/issue-tracker.md`: the local Markdown tracker conventions.
- `AGENTS.md`: an appended **Agent skills** block pointing to the tracker conventions. Existing content is kept.
- `CLAUDE.md`: `@AGENTS.md`, only when the file is missing.
- `.gitignore`: an entry for `.stintwork/local/`.
- `.stintwork/roadmap.md`: a starter milestone, only when the file is missing.

Select the changes you want. Review the confirmation and apply them. Stintwork makes one **Set up Stintwork** commit. It refuses selected files with uncommitted changes; commit those changes yourself, then reopen setup. Unselected files are left alone.

Setup also lists stage skills for each agent. **Found** means a file exists in a supported location, not that the skill was tested. **Missing** means it was not found in the checked locations. **Can't tell** means Stintwork could not determine availability.

The Feature workflow uses skills from `mattpocock/skills`: `/grill-with-docs`, `/to-spec`, `/to-tickets`, `/implement` and `/code-review`. If they are missing, follow setup's installation hint yourself:

```bash
npx skills@latest add mattpocock/skills
```

Select your agent and the needed skills. Check setup again afterwards. Stintwork never installs skills or changes agent configuration. Setup does not create a glossary or decision records; Clarify can propose them when needed.

## 4. Create a work item

Press `c` on the board, or open ⌘K / Ctrl+K and choose **Create work item**. For example:

- **Title:** Add a greeting command.
- **Workflow:** Feature.
- **Milestone:** the starter milestone, or no milestone.
- **Intent:** Add a greeting command that accepts a name and prints a greeting. Cover the default and named cases with the project's existing checks.

Check the folder preview: `.scratch/add-a-greeting-command/`. Confirm creation. Stintwork writes `workflow.yaml` with the title, intent, workflow and first stage. If you selected a milestone, it updates the roadmap too. Both changes belong to one **Create work item add-a-greeting-command** commit.

The work item appears in Clarify. A spec and tickets are not needed yet. Existing folders, invalid titles and uncommitted target paths are refused rather than overwritten.

Open the work item. The stage rail lets you choose Claude Code or Codex for each stage. You can keep the same agent throughout or switch between stints.

## 5. Clarify the intent

In the Clarify section, choose **Start stint** to preview the brief. It includes the intent, project-file pointers, the last handoff and files changed since it. Choose a permission level, read its warnings, then choose **Start**:

- **Ask:** Stintwork asks you to decide permission requests it receives.
- **Edit freely:** the default. Eligible worktree edits and safe commands are answered automatically; other requests need your answer.
- **Autonomous:** eligible worktree edits and commands are answered automatically.

These levels depend on the agent's capabilities. They are not an independent security boundary. In particular, Codex can execute commands without sending a permission request. Stintwork can only decide requests the agent sends.

The first stint creates a worktree on `stintwork/add-a-greeting-command`. The drawer shows its path. All stage stints use that worktree, including Clarify, Spec and Tickets. If you edit the spec or tickets between stints, edit the copies there, not the main checkout.

Clarify uses `/grill-with-docs`. Answer questions through **Needs you**. If a stint ends with unresolved handoff items, open them, write a **Developer note** and save it. The next brief includes that note. Start another Clarify stint if more work is needed.

Changes to `GLOSSARY.md`, `docs/adr/` and `AGENTS.md` appear as memory proposals in Needs you. Inspect each diff and accept or reject it. Rejection restores the whole file to that stint's starting version, including later committed changes; read the warning before rejecting.

At the end of a stint, Stintwork records a checkpoint commit when there are changes and stores a handoff. **Stop** also ends a stint and preserves its changes through a checkpoint. You can start the next stint with another agent and the recorded handoff.

When you are satisfied, choose **Approve Clarify**. This is your judgement, not a file-output check. It still needs a finished stage stint with a handoff and no open memory proposals. A stopped or failed stint does not satisfy that condition.

## 6. Write and approve the spec

In Spec, preview and start a stint. Its brief invokes `/to-spec` and names the exact output: `.scratch/add-a-greeting-command/spec.md` in the worktree.

Read the spec shown in the drawer. Check that it describes the intended outcome and acceptance criteria. Answer any unresolved handoff items with a developer note; start another stint if the spec needs revision.

The Spec gate needs a finished stint with a handoff and a `spec.md` that parses. At minimum, the file needs a nonempty top-level Markdown heading. A file written to another folder does not satisfy this gate. The gate view names the missing output and its expected path.

Choose **Approve Spec** when the gate is ready and the content is right. Approval advances the work item to Tickets and is recorded in `workflow.yaml` with who approved, when and at which commit.

## 7. Write and approve tickets

Start a Tickets stint. The brief invokes `/to-tickets` against the work item's folder. It asks for separate files in `.scratch/add-a-greeting-command/issues/`, named `NN-<slug>.md` from `01` in dependency order.

Each ticket needs a `Status:` line and a `Blocked by:` line. New implementation tickets should use `Status: ready-for-agent`. `Blocked by: none` means there is no blocker; otherwise it lists the ticket numbers that must be resolved first.

Read the tickets in the drawer. The Tickets gate needs a finished stint with a handoff, at least one ticket, no ticket warnings and valid dependency order. Fix missing or invalid output in the worktree, or ask for another stint using a developer note.

Choose **Approve Tickets** when the gate is ready. The work item advances to Implement.

## 8. Implement each ready ticket

Choose **Start stint** on a ready ticket. Preview its brief and start it. `/implement` receives that ticket's path, the spec and project memory. It is told to finish that ticket only, set its status to `resolved`, append under `## Comments`, commit with the ticket reference and leave pushing to you.

Watch progress and answer permission requests in Needs you. If you stop a stint, inspect its checkpoint and handoff, answer unresolved items and start another stint on that ticket. The next brief includes changes you made since the handoff.

A resolved ticket satisfies its blockers, so dependent tickets become available. Repeat until all tickets are resolved. The Implement gate is manual: no active stint and every ticket resolved. It does not substitute for the Review checks.

Choose **Approve Implement** to enter Review.

## 9. Review the change and check its evidence

Choose the Review agent, then start a Review stint. Its brief invokes `/code-review` for both Standards and Spec against the work item's merge-base-to-head diff. It tells the agent not to implement fixes. The handoff and findings are recorded against the reviewed commit.

Choose **Open review** in the drawer to inspect the diff, findings and checks. For every finding, either resolve it after fixing the change or accept it with a reason. Use **Send back** for changes that need more implementation. After a fix, start a new Review stint; older findings remain history, not current gate evidence.

Start the local checks from the checks panel. Results include the command, output and checked commit. By default, Stintwork selects existing `test`, `lint`, `typecheck`, `build` and `format:check` scripts from your main checkout's `package.json`. Projects with other checks can configure named commands in `.stintwork/config` in the main checkout, for example if `npm test` is your project's test command:

```yaml
permissionLevel: edit-freely
checks:
  - name: test
    command: npm test
```

Use commands appropriate to your project. An explicit `checks` list replaces the defaults. Commit configuration changes before checking the work item. Checks execute in its worktree and require committed changes and no active stint.

The Review gate lists every condition:

- The latest Review stint finished and produced findings, or explicitly no findings.
- Every current finding is resolved or accepted.
- Every configured check passed.
- The evidence is current, not stale.
- No memory proposals remain open.

After code changes, start another Review stint and repeat the checks on the new head commit. Gate and review-decision bookkeeping alone does not make evidence stale. Accept or reject any remaining memory proposals before continuing.

Choose **Approve Review** when every condition is ready. The work item advances to Ship. Earlier approved stages also have **Reopen** actions if you need to revisit them.

## 10. Merge and confirm Shipped

For a first work item, choose **Merge locally** in Ship. No remote or `gh` is needed. Stintwork checks for conflicts and refuses uncommitted worktree changes or overlapping uncommitted changes in the main checkout. Keep the main checkout on its main branch.

If there are conflicts, inspect the listed paths and choose **Send back**. Resolve them through further implementation, then obtain fresh Review evidence and approval before trying again.

On success, Stintwork merges the work item's branch, records the merge and removes its worktree and branch. The board shows **Shipped** with the merge commit. Stint history and recorded evidence remain available. If recording or cleanup fails, read the error; a merge may already have happened, so do not assume the change is unmerged.

Alternatively, with a GitHub remote and an authenticated `gh`, choose **Open pull request**. Inspect the remote, branch, base, commit and proposed text. Nothing is pushed until you choose **Confirm push and open pull request**. Once all PR CI checks pass and the approved Review evidence is current, choose **Merge pull request**, inspect the proposed merge method and confirm it. A work item with a pull request must use that path rather than Merge locally.

**Shipped means merged**, not just an ended stint or an approved gate.

## After the first work item

- **Edit roadmap** on the board adds, renames and reorders milestones, changes their status or target date, and moves work items between them. Each edit is one commit to `.stintwork/roadmap.md`.
- **Customise** on a work item or in ⌘K previews a built-in workflow, then copies it into `.stintwork/workflows/<id>.yaml` in one commit. Edit the copy's skills, agents or ordered stages yourself. The final stage must use `gate: merge` and `column: ship`. Invalid YAML is reported with a warning; an invalid override falls back to the built-in workflow.
- Bug uses Diagnose → Fix → Review → Ship. Quick uses Do → Review → Ship. Choose one when creating a work item if it fits the change better.

The durable work item files are `.scratch/<slug>/spec.md`, `issues/NN-*.md`, `workflow.yaml` and `review.yaml`. `.stintwork/config` holds permission and check settings. `.stintwork/local/` holds gitignored stint logs and handoffs. Keep the durable files committed with the project.

See the [glossary](../GLOSSARY.md) for terms, the [product brief](brief.md) for scope and the [decision records](adr/) for design choices.
