# 08 — Verify crash boundaries and prepare real-agent checks

Status: ready-for-agent
Blocked by: 07

## What to build

Close gaps in existing lifecycle coverage and leave a repeatable coordinator runbook for ticket 09 in Comments. Reuse `packages/server/src/stint-history.test.ts`, fake ACP/process/cache fixtures and browser harness; do not build another test framework or repeat tests already added by 02–07. Exercise actual server-process replacement, same-session load/continuation, resumed-twice operation, pending permission and failed-resume checkpoint/new-stint flow.

Cover crash boundaries that can restart the wrong phase: before session persistence, after resume reservation/load, during permission answer/write receipt, between work/handoff/findings, after saved outputs and during checkpoint/ended append. Keep legacy/torn/missing/foreign logs, terminal-history immutability, no startup downloads, exact source/environment, old-process cleanup and concurrent-read/owner cases in the affected regression suite. Preserve Review evidence and risky-file assertions rather than weakening them.

Run available full affected checks and package smoke if feasible. The runbook must prepare both Installed/Bundled sources explicitly before recovery and identify real agent/adapter/executable/lock/revision evidence, observable kill points, server-only kill, expected absence of `newSession`/brief/registry traffic, waiting Ask permission, rejection, graceful restart and forced fallback. Do not inspect credentials or change global agent/configuration. Mark missing real/network/socket/browser resources for the coordinator, not as passes.

## Acceptance criteria

- [ ] Existing suites cover the listed crash/phase boundaries, two successive restarts, ownership/concurrency and one ending per stint without redundant new harnesses.
- [ ] Socket-enabled fake-server tests prove process replacement, history/live-stream consistency, current permission delivery and a checkpoint/new-stint fallback while preserving old files.
- [ ] Tests enforce zero recovery preparation/download/reselection and immutable terminal history, with Review/risky-file assertions intact.
- [ ] Comments record format/lint/typecheck, affected core/agents/server/web results and available build/package/browser checks, including exact commands and exclusions.
- [ ] A coordinator runbook specifies both agents and both sources, server-only crash, graceful restart, pending Ask allow/reject, forced fallback and exact evidence to retain.
- [ ] Real-agent/network/socket/browser gaps and platform limits remain explicit; neither old probes nor fake tests are reported as the M10 real exit.

## Comments

**Codex, 2026-10-26:** Unit/fake-process checks use disposable local fixtures. Socket lifecycle, real agents/logins, registry/provider network and browser checks are coordinator-run. Retain successful and failed runs with reasons; do not delete the developer's caches or claim untested platforms.
