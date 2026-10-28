# v1 tracks work in local Markdown only; GitHub owns PRs and CI

Status: superseded by [ADR 0013](0013-github-issues-tracker.md)

In v1, work items, tickets and specs live only in the repo's `.scratch/` folder. Stintwork neither reads nor syncs GitHub Issues. GitHub (through `gh`) stays the authority for pull requests and CI checks, which Stintwork displays but doesn't duplicate. mattpocock/skills treats GitHub Issues and local Markdown as alternatives, not a pair, and two-way sync would double the state-reconciliation problem in v1. Reading GitHub Issues is a candidate for a later version.
