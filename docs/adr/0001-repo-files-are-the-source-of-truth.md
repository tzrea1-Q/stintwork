# Repo files are the source of truth

All durable project state lives as Markdown in the project's own repo, in the layout mattpocock/skills already uses (`.scratch/<feature>/spec.md`, `issues/NN-*.md` with `Status:` and `Blocked by:` lines, `GLOSSARY.md`, `docs/adr/`, `AGENTS.md`). Stintwork adds only `workflow.yaml` per feature, `.stintwork/roadmap.md`, `.stintwork/workflows/`, and a gitignored `.stintwork/local/` for stint logs. There is no database. We chose this so every agent can read project memory without Stintwork, the data outlives the app (Vibe Kanban's company shut down in 2026, leaving users to depend on its hosted state), and the skills already write this format.

## Considered options

- **App-local SQLite.** Cleaner repos and faster queries, but agents could only reach project memory through Stintwork, and the data dies with the app.
- **Our own new file format.** Rejected: skills would need adapters, and the format would compete with one developers already use.

## Consequences

Stintwork state must be derived from files, `git` and `gh` wherever possible, and an in-memory index rebuilt from a file watcher. Specs, tickets and other planning files appear in diffs and PRs.
