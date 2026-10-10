# 08 — Grok Build agent

Status: resolved
Blocked by: 01, 03

## What to build

Grok Build joins the registry through its native `grok agent stdio`, with the developer's existing login. Its capability profile, from the probe: no ACP modes; model and reasoning effort only, as config options. Availability and login detection work as for Claude (`grok login`). When the developer's Grok config sets `permission_mode = "always-approve"`, Stintwork records it in the profile and warns before every Grok stint that Grok won't ask for permissions. It never edits the developer's global config.

## Acceptance criteria

- [ ] Server tests with the fake agent using the Grok profile: a full stint, auth-required handling, and the always-approve warning surfaced in the brief preview.
- [ ] Config detection is tested against fixture Grok configs (always-approve, other modes, missing file).
- [ ] Manual: a real Grok Build stint on a throwaway repo finishes with a handoff and checkpoint.
- [ ] All checks pass.
