# 06 — Cover cache, offline and interruption behavior

Status: ready-for-agent
Blocked by: 04, 05

## What to build

Add focused fixture-driven coverage at the existing preparation, launcher, server and UI seams. Do not use or clear the developer's real caches or write their login/configuration. Test both proven-compatible installed-CLI selection and pinned bundled fallback for missing, incompatible or unverified installed versions.

Exercise warm cross-project reuse, offline cold misses, corrupt/incomplete entries, integrity/registry errors, cancellation or process termination during preparation, stale/concurrent preparation, explicit retry and CLI-version changes. Count requested packages so compatible paths fetch no native payload and fallback paths fetch only the selected agent's pinned host-native package. Test a cached adapter whose bundled native package is still absent: offline fallback preparation must fail clearly rather than claim ready or run partial content. Local preparation success offline is not proof of provider-backed inference offline.

## Acceptance criteria

- [ ] Warm cross-project/root-version reuse performs no package downloads and preserves recorded pins and executable selection.
- [ ] Compatible installed paths request zero native payloads; missing/incompatible/unverified paths request only their selected pinned bundled fallback and expose the reason.
- [ ] Offline warm/cold tests cover both paths, including an adapter cached without its required fallback native package, with honest readiness/errors.
- [ ] Corrupt entries, integrity/registry failures, cancellation/kill, stale and concurrent preparation never launch partial content or replace a previous good entry.
- [ ] Explicit retry recovers with unchanged pins; CLI identity/version changes trigger reselection and do not silently reuse an incompatible installed executable.
- [ ] Board/availability requests never prepare/download agents; changed UI states show source/reason, progress and retry without blocking board use.
- [ ] Tests assert no project/global CLI/credential writes; real-repo tracker assertions cover only parsing, no warnings and dependency order, not fixed counts/statuses.

## Comments
