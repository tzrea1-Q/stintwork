# 02 — Brief preview

Status: ready-for-agent
Blocked by: none

## What to build

On an open, unblocked ticket of a work item in its Implement stage (Fix for bugs, Do for quick tasks), the drawer offers "Start stint". It opens a brief preview showing exactly what the agent would be told, per `.scratch/first-stint/spec.md` (user stories 1–9):

- the skill line, e.g. `/implement <ticket path>`;
- "Read first" pointers with reasons (AGENTS.md, GLOSSARY.md, decision records, the spec, the ticket);
- the last handoff ("none yet" in this ticket);
- what changed since (none yet);
- the full prompt text, with a copy button.

An agent picker shows Codex as available, and Claude Code and Grok Build as disabled ("coming in M3"). The Start button is disabled ("arrives in the next ticket") until ticket 03. The action is unavailable on blocked or resolved tickets, with the reason shown.

The brief compiler is a pure `core` function (spec → Implementation Decisions), and the preview is served by a server endpoint.

## Acceptance criteria

- [ ] Core tests: the brief for a ticket lists AGENTS.md, GLOSSARY.md, existing decision records, the spec and the ticket as pointers with reasons. The skill line uses the stage's skill and the ticket path. The prompt contains every section in the validated order.
- [ ] Core tests: given a last handoff and changed paths, the brief includes them, with "where the handoff and the files disagree, the files win".
- [ ] Server test: the preview endpoint returns the brief for a work item and ticket, and rejects blocked or resolved tickets with a reason.
- [ ] Component tests: the preview renders each section, copies the prompt, and shows the disabled agents and the disabled reason on blocked tickets.
- [ ] In the browser on this repo: the preview for an open `first-stint` ticket shows real pointers and paths.
