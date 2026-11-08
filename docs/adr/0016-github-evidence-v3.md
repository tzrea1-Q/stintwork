# Exclude ticket comments from GitHub evidence

Status: accepted 2026-11-07 by the maintainer.

Evidence version 3 is version 2 without ticket comments. Ticket set, bodies, relevant triage labels and blocker identities remain evidence; parent comments remain excluded. Ticket comments are progress history, not spec. ADR 0015's pre-spec rule still applies.

New approvals record version 3. Versions 1 and 2 remain verifiable only under their own rules: their stored digests cannot be recomputed without the comments they covered. A later ticket comment therefore leaves an existing v1/v2 approval that includes tickets stale until it is re-approved once under v3.

This supersedes only the evidence-content part of [ADR 0014](0014-github-evidence-v2.md).
