# 03 — Review findings

Status: ready-for-agent
Blocked by: 01, 02

## What to build

A review stint turns into structured findings (spec user stories 1–9, 11–13). After a stint's work turn on the Review stage, a findings request runs as the second after-turn request (ticket 01). It asks for a fixed Markdown format: one block per finding with axis (Standards or Spec), severity (blocker, major, minor, nit), path, line, title and body, or an explicit "No findings". Define the format once, and keep the parser lenient about preambles, as the handoff parser is. Store the parsed findings, or the parse error with the raw reply, in the stint log with the reviewed commit. The review overlay pins each finding under its new-side line, shows findings outside the diff at the top of their file, and lists them in a rail filterable by axis, severity and status. The review brief points at the spec, the tickets, the diff range and `/code-review`, with Codex as the default reviewer.

## Acceptance criteria

- [ ] Agents/core tests: parsing findings, "No findings", preambles, and a malformed reply producing a recorded error.
- [ ] Server test with the fake agent: a review stint records its findings with the reviewed commit, and they appear in the snapshot.
- [ ] Component tests: pinned findings, out-of-diff findings, filters, the "no findings" and parse-failure states.
- [ ] Manual: a real Codex review stint produces parsed findings.
- [ ] All checks pass.
