# 08 — Guided setup

Status: resolved
Blocked by: 01

## What to build

A repo without mattpocock's layout is set up from Stintwork, with consent (spec user stories 42–54). Extend core's setup detection into a plan of proposed file changes, each with its full new content or a diff:
- `docs/agents/issue-tracker.md` saying issues are local Markdown in `.scratch/`;
- an "## Agent skills" block in AGENTS.md (appended, or AGENTS.md created; existing content never rewritten);
- a one-line CLAUDE.md pointing to AGENTS.md when it's missing;
- a `.stintwork/local/` entry in `.gitignore`;
- a starter `.stintwork/roadmap.md`.

The Setup chip opens a guide listing them. The developer selects which to apply. The server refuses if any target has uncommitted changes and commits once as "Set up Stintwork". The guide also reports, per agent and per stage skill of the loaded workflows, whether the skill is found, missing (with mattpocock/skills install instructions) or can't tell, from the skill locations each agent profile declares. Stintwork never installs skills or edits agent configuration.

## Acceptance criteria

- [x] Core tests: the plan for a bare repo, a partly set-up repo and a fully set-up repo; skill classification from fixture directory listings.
- [x] Server tests: selective apply, the single commit, refusal on dirty targets, AGENTS.md appended without rewriting.
- [x] Component tests: the guide's diffs, selection, confirmation and skill report.
- [x] Manual (coordinator): guided setup on a throwaway repo without mattpocock's layout.
- [x] All checks pass.

## Comments

**Coordinator, 2026-10-11:** Built by Codex; the coordinator fixed the skill report. Codex also loads skills from the shared `~/.agents/skills` and `<project>/.agents/skills`, so on the developer's machine every Codex stage skill was wrongly reported missing. Those locations are now declared and allowed, with a server test. verify.sh passed (1451 tests before the fix). Real check on a bare repo with its own AGENTS.md: the plan listed five changes; the skill report matched the developer's real skill folders (Claude Code and Codex: all found; Grok: can't tell). In the browser, deselecting the roadmap and confirming made one commit "Set up Stintwork" with four files; AGENTS.md kept its content with the Agent skills block appended; CLAUDE.md is `@AGENTS.md`; the roadmap was not written; the worktree is clean.
