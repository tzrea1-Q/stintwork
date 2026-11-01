# Read GitHub Issues as project memory

Status: partly superseded by [ADR 0014](0014-github-evidence-v2.md) (evidence content)

Accepted by the maintainer on 2026-10-27.

In a project configured for GitHub Issues, the parent issue body is the spec and its sub-issues are tickets. Agents use their own skills and `gh` to write them; Stintwork reads through `gh` and does not sync or write issues. Stintwork stores its workflow and gate records in a committed file keyed by repository and parent issue number, read from the work item's worktree once present. Approvals identify the observed issue content and code commit; an unavailable or changed revision cannot be represented as a current approval. See the [M11 spec](../../.scratch/github-tracker/spec.md) for discovery, evidence and failure rules.

This supersedes [ADR 0005](0005-local-markdown-only-in-v1.md), while retaining its reason for avoiding two-way sync. It explicitly narrows [ADR 0001](0001-repo-files-are-the-source-of-truth.md): the spec, tickets and comments are durable remote state, unavailable offline or in a bare clone. The hybrid does not satisfy its all-durable-state-in-repo rule. Local Markdown projects remain unchanged. [ADR 0006](0006-views-are-separate-from-project-state.md) keeps the shared project model, and [ADR 0009](0009-work-item-files-come-from-its-worktree.md) still governs committed work-item files, not remote issue content.

The alternative of a local authoritative spec conflicts with the GitHub skills' published issue; mirroring introduces reconciliation. Remote approval comments or labels would require Stintwork to write GitHub and do not provide the same committed worktree record. Remote reads and Git commits cannot form an atomic transaction, so later revalidation and explicit stale/unknown states are necessary.
