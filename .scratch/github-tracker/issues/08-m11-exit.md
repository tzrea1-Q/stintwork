# 08 — M11 exit

Status: ready-for-human
Blocked by: 01, 02, 03, 04, 05, 06, 07, 13

## What to build

After all prerequisites and ADR approval, the coordinator asks the maintainer which real GitHub-tracked repo to use. It needs an existing authenticated github.com login, authorized issue and PR write/merge access, a qualifying parent (a top-level issue with direct same-repo sub-issues or the `stintwork:work-item` label) with a spec body and a direct same-repo ticket to implement, a suitable workflow and checks, and permission to use and clean up the chosen work. Use the actual built revision and take one ticket from the board through a real agent stint, checks, PR and merge. Real gh, provider network, local sockets and browser are required. Do not inspect or record credentials.

## Acceptance criteria

- [ ] Tickets 01–07 and 13 are resolved, the approved ADR and fixture, build and browser evidence are linked.
- [ ] The selected repo and permission are confirmed with the maintainer; record repository and issue/PR identities and tested revision.
- [ ] Board discovery, ticket dependencies, brief and real stint are observed; issue changes are made by the agent through its own skill/gh.
- [ ] A real PR for the ticket passes required checks on its current head and is merged; record URLs, commits and check outcomes.
- [ ] A remote edit and refresh demonstrate approval invalidation or a separately authorized disposable issue demonstrates it; failure and recovery are observed.
- [ ] Record actual timing/request counts, browser evidence, cleanup, failures and limits; no credentials or private content are copied.
- [ ] Only the maintainer accepted full pass sets M11 shipped; otherwise leave active with concrete blockers.

## Comments

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.
