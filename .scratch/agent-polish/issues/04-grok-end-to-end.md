# 04 — Grok Build end to end

Status: ready-for-agent
Blocked by: none

## What to build

Grok Build's registration, warnings and handoff parsing were fixed with real-config and real-reply evidence in M3, but every real stint and probe since was refused with "Rate limited" by Grok's API on the developer's account. When the rate limit allows, rerun the ACP probe for Grok, and a real Grok stint that finishes with a parsed handoff. Record both. This needs no code unless the run finds a defect.

## Acceptance criteria

- [ ] The probe for Grok Build is recorded (basic, commands, cancel, resume).
- [ ] A real Grok stint finishes with a parsed handoff and checkpoint, recorded in Comments.
