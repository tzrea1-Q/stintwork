# Exclude ticket and blocker states from GitHub evidence

Status: partly superseded by [ADR 0015](0015-pre-spec-approvals-ignore-body.md) (pre-spec approvals) and [ADR 0016](0016-github-evidence-v3.md) (evidence content)

Accepted by the maintainer on 2026-10-31.

Evidence version 2 excludes ticket state and state reason and blocker states, while retaining blocker identities. Under version 1, closing a ticket invalidates the Tickets approval and downstream approvals, including through sibling blocker states, forcing repeated approval during normal work. Fresh dependency reads still refuse open or unknown external blockers and unordered or cyclic siblings at the Tickets gate and before each ticket stint. Version 1 approvals remain verifiable under version 1 rules.

This supersedes only the evidence-content part of [ADR 0013](0013-github-issues-tracker.md).
