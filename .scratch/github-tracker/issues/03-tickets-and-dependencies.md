# 03 — Read tickets and blockers

Status: ready-for-agent
Blocked by: 02

## What to build

Add on-demand complete direct-sub-issue, comment and dependency reads to the shared project model. Implement status mapping, native/text precedence and safe ordering exactly as the spec. Use fixtures and fake `gh`; no network.

## Acceptance criteria

- [ ] Direct same-repo children, unsupported nested/cross-repo relationships and all required pages have the specified completeness states.
- [ ] Status mapping covers closure reasons, configured and conflicting triage roles and active stints; assignment alone does not start work.
- [ ] Native and text blockers, missing or inaccessible references, closed-not-planned blockers and cycles obey the specified precedence and never expose unknown as unblocked.
- [ ] Topological ordering and issue-number ties are deterministic; capped or failed relations block dependent actions.
- [ ] Fake-gh tests exercise multi-page and failure cases without network.

## Comments

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.
