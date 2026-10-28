# 03 — Read tickets and blockers

Status: resolved
Blocked by: 02

## What to build

Add on-demand complete direct-sub-issue, comment and dependency reads to the shared project model. Implement status mapping, native/text precedence and safe ordering exactly as the spec. Use fixtures and fake `gh`; no network.

## Acceptance criteria

- [x] Direct same-repo children, unsupported nested/cross-repo relationships and all required pages have the specified completeness states.
- [x] Status mapping covers closure reasons, configured and conflicting triage roles and active stints; assignment alone does not start work.
- [x] Native and text blockers, missing or inaccessible references, closed-not-planned blockers and cycles obey the specified precedence and never expose unknown as unblocked.
- [x] Topological ordering and issue-number ties are deterministic; capped or failed relations block dependent actions.
- [x] Fake-gh tests exercise multi-page and failure cases without network.

## Comments

**Codex, 2026-10-27:** Filed in dependency order. No implementation or live GitHub exit check has been run in this docs-only filing.

**Codex, 2026-10-27:** Implemented an on-demand, read-only GitHub work-item refresh seam and shared snapshot data for the parent body, direct tickets, comments, statuses and blockers. The reader verifies viewer, origin, repository and issue identities; paginates children, labels, comments and native blockers; rejects duplicate, incomplete and capped connections; retains same-viewer stale data as unknown/blocked; and honors rate-limit reset times. Native blockers take precedence over text, external references are resolved in the same repository, and ticket ordering reuses the local dependency order. Recorded sanitized gh-aw and spec-kit data and synthetic fake-gh responses cover closure, native and text edges, conflicting roles, cycles, missing and cross-repository references, multi-page results, failures, caps, retries and identity changes. GitHub ticket starts and approvals remain unavailable until tickets 04 and 05 implement their fresh-read and evidence checks; ticket 06 owns work-item-view refresh and presentation.

Checks: 1,620 web/core tests passed; 62 focused server tests passed (60 discovery and 2 ticket API tests), with the ticket test rerun after subsequent changes. Format, lint and typecheck passed; lint reported the existing Biome deprecation. Workspace dependencies point to the original checkout, so tests and an additional server typecheck used temporary source aliases. No network or GitHub writes were used. The coordinator must run the full server suite and the real-repository M11/browser exit outside this socket-restricted sandbox.

**Codex, 2026-10-27:** Follow-up to the coordinator's live timing: child label, comment and native blocker connections share a four-request limit, including their independently paginated pages and text blocker reads. Results and warnings remain in child order regardless of completion order; failure waits for in-flight requests to settle before a retry can begin. The refresh reads the viewer and repository once each and binds the result to that observed viewer and origin. A single-page detail refresh uses **5 + 3N + K REST requests** for N children and K text blocker lookups, plus one per additional page (and two `gh auth status` checks); `readGithubTickets` itself uses **3 + 3N + K**. Request count is not GraphQL point cost. The recorded #1433 snapshot test confirms #1472, #1473, #1474, #1475, all cancelled, and fake-gh tests exercise overlap, the four-request ceiling and safe failure/retry.

**Coordinator, 2026-10-27:** Repeated the read-only live `github/gh-aw` #1433 detail read after the concurrency change. Both reads were complete and took 10.3 s and 12.6 s, compared with 23.2 s before the change. The coordinator also ran full verify: 2,830 unit tests and all e2e passed.

**Codex, 2026-10-27:** Review follow-up: GitHub cycle fallback keeps the already sorted acyclic prefix and marks the remaining cycle and dependent tickets blocked in numeric order; local Markdown retains its existing numeric fallback. Discovery refresh and load-more retain matching details as stale for the same viewer and origin, clear stale status on a detail re-read, and discard details for removed or changed identities and on viewer/origin changes. Tests cover those cases and the separate discovery completeness state.

**Codex, 2026-10-27:** Second review follow-up: a parent, child or blocker identity mismatch now clears the affected work item's retained detail from both the current snapshot and cached fallback. Ordinary read failures still retain it as stale; fake-gh tests cover all three mismatches, a network failure and a subsequent failed discovery refresh.

**Codex, 2026-10-28:** Third review follow-up: GitHub issue or pull URLs in a `## Blocked by` line's description now make text dependencies unknown and blocked, including same-repository links. Existing ambiguous `#N` and `owner/repo#N` descriptions remain blocked; a plain description and a repository-only link still resolve the named blocker. The single-line `Blocked by:` form continues to reject descriptions as ambiguous. Added fake-gh coverage for each case.

**Codex, 2026-10-28:** Fourth review follow-up: an empty `## Blocked by` section is unknown and blocked. The GitHub reader now accepts the `to-tickets` template's bold or plain blocker labels, case-insensitive `None` with an optional parenthetical note, bulleted section forms, and explicit `#N` lists. A `None` value that also names a reference, as well as titles-only blockers, stays unknown and blocked. Added fake-gh coverage for these forms and the template's exact `None (can start immediately)` wording.

**Codex, 2026-10-28:** Fifth review follow-up: discovery and per-item detail failures now have separate freshness state, so a detail retry cannot clear a discovery error; retained details become stale until individually re-read. Fake-gh tests cover both failure orders and recovery. Blocker descriptions and `None` notes use one conservative ambiguity rule for standalone numbers, dependency words and URLs or references. This deliberately accepts false positives: for example, `#12 — Support 3 languages` is unknown and blocked, while `#12 — Support v2 API` remains a valid description. URLs in descriptions are now ambiguous, including repository-only and non-GitHub URLs; plain descriptions in the single-line form are accepted.

**Codex, 2026-10-28:** Sixth review follow-up: ticket statuses and blockers now depend on their own work item's detail freshness. The aggregate snapshot can remain stale because discovery or another item's detail failed without hiding freshly read ticket statuses; discovery errors remain visible through detail retries. Fake-gh coverage exercises two retained details, an unrelated detail failure, and a discovery failure with fresh details.

**Coordinator, 2026-10-28:** Resolved. Merged as `380355c`.
- **Real `gh`, read-only:** reading github/gh-aw #1433 (4 tickets) was complete. It took 23.2 s with sequential reads and 10.3–12.6 s after bounded concurrency of 4.
  - Recorded fixtures come from gh-aw #1433 (parent, sub-issues, comments) and github/spec-kit #5073 and #5071 (native blockers), sanitized.
  - Through the snapshot, the #1433 tickets order as #1472, #1473, #1474, #1475, all cancelled.
- **Real skill output:** the `to-tickets` template's blocker forms were checked against the parser, including `**Blocked by:** None (can start immediately)`.
- **Codex reviews (gpt-6.1-terra), seven rounds; the last was clean.** Fixed:
  - acyclic order kept around GitHub cycles (local Markdown unchanged);
  - fetched details carried across refresh as stale;
  - an identity change clears retained details;
  - blocker lines naming another issue, and empty blocker sections, are unknown;
  - one conservative rule for blocker text (accepted false positive: "Support 3 languages");
  - discovery and per-item detail freshness are tracked separately, and ticket status follows each item's own freshness.
- **No UI changes,** so no browser check was needed.
- **Full verify:** format, lint, typecheck, build, 2,901 unit tests, package smoke and all e2e passed.
- **CI:** run 40658962155 passed. Its browser job hit the old 15-minute limit on the first attempt with no failing test, then passed on re-run. The browser job is now split into two shards (`f24cca5`, run 40661148669 green, shards about 5 and 7 minutes).
