# Pre-spec approvals ignore parent body edits

Status: accepted 2026-11-01 by the maintainer

Publishing the spec edits the parent body, so treating that edit as a change to Clarify evidence forces an unnecessary upstream reapproval. Approvals of stages before the workflow's first stage whose column is `spec` verify the parent node ID only; their recorded digest remains as history. This applies to evidence versions 1 and 2, including existing approvals. Parent body edits invalidate the Spec approval and later remote-dependent approvals. If a workflow has no spec stage, retain the existing evidence rules. Reopen and head-change rules remain unchanged.

This supersedes only the corresponding pre-spec evidence rules of [ADR 0013](0013-github-issues-tracker.md) and [ADR 0014](0014-github-evidence-v2.md).
