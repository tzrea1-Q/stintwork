# 08 — Guided setup

Status: ready-for-agent
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

- [ ] Core tests: the plan for a bare repo, a partly set-up repo and a fully set-up repo; skill classification from fixture directory listings.
- [ ] Server tests: selective apply, the single commit, refusal on dirty targets, AGENTS.md appended without rewriting.
- [ ] Component tests: the guide's diffs, selection, confirmation and skill report.
- [ ] Manual (coordinator): guided setup on a throwaway repo without mattpocock's layout.
- [ ] All checks pass.
