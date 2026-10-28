# 07 — Verify the integrated flow and prepare the exit

Status: ready-for-agent
Blocked by: 06

## What to build

Exercise the full fixture-backed flow and write a concise coordinator runbook in this ticket's Comments for a maintainer-selected real repo. Include setup, issue identity, read counts/latency, evidence revalidation, failure recovery and safe cleanup; do not perform live writes here.

## Acceptance criteria

- [ ] Fake-gh integration covers discovery through ticket stint, approval and refresh including a remote edit and a failed relation page, without network.
- [ ] Runbook names required access, a parent with direct same-repository sub-issues or the label, and a direct same-repository ticket, checks, issue and PR permissions, cleanup and expected evidence.
- [ ] Record actual automated/build and browser results, commands, revision and limits; distinguish fake gh from real GitHub.
- [ ] Coordinator-only real gh, network, local sockets and browser checks are identified and no real-repo pass is claimed.

## Comments

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.
