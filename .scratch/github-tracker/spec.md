# GitHub Issues as a tracker

Status: ready-for-agent

Milestone: M11 · GitHub Issues as a tracker

See `docs/plan.md` (v0.2, M11), `docs/brief.md`, ADR 0001, 0005, 0006, 0009 and accepted 0013, and `docs/research/2026-10-27-github-tracker.md`.

## Problem Statement

Skills configured for GitHub publish the spec and tickets as issues, but Stintwork cannot display or use them. At `cc6e8b4d17dfd4bc667edcc5e1d51a75af806c39`, `work-items.ts` indexes `.scratch/<slug>/spec.md` and `issues/NN-*.md`, parsing metadata and comments and ordering dependencies. `setup.ts` detects a GitHub tracker, but `setup-plan.ts` proposes local Markdown and does not replace another tracker by default. `project.ts` builds the shared snapshot from local files, and `workflows.ts` loads workflow definitions; board and work-item views consume that snapshot. `brief.ts` points agents to local paths and tells them to update local ticket status. `gates.ts` checks readiness and records developer, time and HEAD via `workflow-writes.ts` in `.scratch/<slug>/workflow.yaml`; ADR 0009 selects the worktree copy. None reads GitHub issue content for this flow.

## Solution

For a GitHub-configured project, read parent issues as work items and native direct sub-issues as tickets through the developer's `gh` login. The parent body is the spec; agents write issues with their skills and `gh`. Stintwork never writes issues. Keep its workflow and gate records committed locally, with remote revision evidence, and extend the shared project model so the existing views show provenance, completeness and safe action availability. Local Markdown remains unchanged. ADR 0013 explicitly narrows the offline/repo-only promise of ADR 0001 and supersedes 0005.

## User Stories

1. As a developer, I can find a GitHub work item and its tickets on the board and see their status and blockers.
2. As a developer, I can start a ticket stint with pointers to the actual issues and the worktree, without a second copy of the spec.
3. As a developer, I can see when data is incomplete or unavailable and avoid acting on unknown blockers or stale approvals.
4. As a developer, I can approve the issue revision I reviewed and see when later edits require renewed approval.
5. As a maintainer, I can verify the flow with deterministic fixtures and a separate real-repo exit.

## Implementation Decisions

### Discovery, identity and scope

A work item is an issue in the configured repository with no parent and either at least one direct same-repository sub-issue or the `stintwork:work-item` label. The label also includes a standalone spec with no tickets; its body is its spec, not a ticket. A labelled child is only a ticket of its parent, with a warning about the conflicting label. Unlabelled standalone issues and orphan tickets are not discovered; show the rule and link to GitHub so a developer can label a parent. Unrelated top-level parent issues, such as epics, also appear; this is an accepted consequence. No task-list or `Part of` fallback creates membership. Only direct native sub-issues in the same repository are tickets. Exclude PRs, nested descendants and cross-repo children, show a warning and mark the parent incomplete so they cannot silently pass gates. User labels have no discovery meaning except the exact label above; label matching is case-insensitive. Closed qualifying parents remain discoverable.

Use github.com only in M11. Resolve the repo explicitly from the project's `origin` GitHub remote, normalized to owner/repo, and pass `-R OWNER/REPO` or an explicit API path on every read; no guessing upstream or accepting a different host. Missing, ambiguous or non-GitHub origin is a setup error. Persist the GitHub repository node ID and parent issue node ID, number and canonical URL with the work item; use deterministic slug `github-<parent-number>` within the project for existing branch/stint and roadmap references. Validate returned identities before associating data. A rename or transfer, changed node ID, missing/deleted issue or inaccessible repo is not silently remapped: show identity/access ambiguity, retain existing branch and records, and require developer resolution outside M11. A 404 cannot distinguish deletion from private access denial. No automatic migration or collision overwrite.

### Status, dependencies and ordering

Read configured triage label roles from `docs/agents/triage-labels.md`; when absent use the spike's standard role names. A closed issue with reason `completed` is resolved; `not planned` is cancelled, not resolved. Missing/unknown closed reason is unknown. Open issues map a single triage role to its named state (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`); no role is open/untriaged, and multiple roles are conflicting/unknown with a warning. An open `wontfix` is not complete. Assignment alone never means in progress: an active Stintwork stint on that ticket is in progress; otherwise preserve the triage state. Cancelled and unknown tickets cannot be implemented or satisfy the all-resolved gate.

For each ticket fetch every native `blocked_by` edge. If at least one exists, native edges are authoritative and text/task lists cannot add or remove edges; warn on disagreement. If the complete native list is empty, parse only `Blocked by: #N, #N` or a `## Blocked by` section containing same-repo `#N` references; `none` means none. Task lists are not dependencies. Resolve all referenced blockers, including outside the parent, using explicit same-repo identity. Any closed blocker, including not planned, satisfies the GitHub dependency convention; open blocks. Missing/inaccessible/cross-repo references, unsupported relation API, incomplete pages or cycles give unknown/blocked, never unblocked. Display the reason; no ticket stint or dependency-dependent gate may proceed on unknown. Topologically order known edges among direct tickets, then ascending issue number for ties; cycles warn and remain blocked. Text parse ambiguity is unknown rather than an empty list.

### Fetch, freshness and failure

Fetch discovery on project open and explicit Refresh; fetch a parent, its children, comments and edges on opening its work-item view, after every stint ends, and immediately before starting a ticket stint or any approval/use of a remote-dependent gate. Refresh again immediately after writing a gate record; if changed or unavailable, retain the audit record but mark it stale/unknown, stop subsequent dependent actions and require re-review. A remote edit during a stint is shown on the next refresh; do not overwrite either local work or remote content. Local worktree changes continue through the existing watcher. No cross-system atomic snapshot is claimed.

Keep only an in-memory snapshot scoped to this project and current authenticated identity; clear it on project/login change or server restart. On failure, show the last successful snapshot read-only with its fetch time, stale/incomplete badge and error; if none, show an unavailable state, not an empty board. It is never authority for starting a ticket or approving a gate. Reload and retry after login/access/network recovery; never persist private issue bodies to a shared cache or logs, expose credentials or use `--show-token`. A successful partial fetch identifies which pages/connections failed and never claims completeness. Offline, access loss, unsupported enterprise feature or failed refresh makes dependencies and current approval unknown.

| State | English | 简体中文 |
| --- | --- | --- |
| `gh` missing | GitHub CLI is not installed. Install `gh`, then retry. | 未安装 GitHub CLI。请安装 `gh` 后重试。 |
| Login absent or expired | GitHub login is unavailable. Sign in with `gh`, then retry. | GitHub 登录不可用。请通过 `gh` 登录后重试。 |
| No access / ambiguous 404 | Repository or issue unavailable. Check the repository and your access, then retry. | 仓库或 Issue 不可用。请检查仓库和访问权限后重试。 |
| Rate limited | GitHub rate limit reached. Retry after the indicated time. | 已达到 GitHub 速率限制。请在提示的时间后重试。 |
| Offline / server error | GitHub could not be reached. Showing stale data when available. | 无法连接 GitHub。如有旧数据，将显示旧数据。 |
| Incomplete | Results are incomplete; dependencies and approvals may be unknown. | 结果不完整；依赖关系和审批状态可能未知。 |
| Stale | Last successful fetch: {time}. Refresh to continue. | 上次成功获取：{time}。请刷新后继续。 |

Check `gh` availability, active github.com login and explicit repository access separately; classify rate-limit responses and respect retry/reset headers without automatic tight retries. When classification is ambiguous, say unavailable rather than inventing a cause. No credentials are stored. Surface a retry action in both languages.

### Bounded reads

`gh issue list` cannot filter by sub-issue presence. Use read-only `gh api graphql` against the explicit repository: paginate its `issues` connection (open and closed, 100 issues per page, stable creation order), selecting issue identity, number, title, `parent`, `labels` and `subIssues { totalCount, nodes { repository { id } }, pageInfo }`. The issues connection excludes PRs. For a top-level issue, a matching label or at least one child whose repository ID matches qualifies it; `totalCount` alone cannot prove a same-repository child. Paginate that issue’s labels and sub-issues independently when needed to decide membership, including when the first children are cross-repo. A failed, unavailable or capped connection makes membership unknown and discovery incomplete, never silently excludes the issue. Sort discovered items by issue number.

Scan at most 500 issues (five issue pages) per discovery refresh; Load more resumes the cursor for another batch of at most 500. Show scanned count and incomplete state until the issue cursor and every membership decision are complete, including failures, partial pages and safety caps. Each issue page and each additional relationship/label page is one GraphQL request against the authenticated GraphQL rate budget; the point cost is query-dependent, not one point per issue or a fixed page cost. Request `rateLimit { cost remaining resetAt }` and record the returned actual cost for every page; stop on a limit and respect retry/reset. Load bodies, comments and full relation pages on demand for an opened item or required gate, not for all discovered issues. Independently paginate every child, blocker, label and comment connection to completion, with at most four concurrent `gh` requests and a 1,000-record per-connection safety cap; hitting it is incomplete, never success. Record request count, actual point cost and elapsed time in coordinator evidence without issue content. Do not infer completeness from `gh issue list` defaults or nested connection totals.

### Workflow, revision and gates

Store `.stintwork/github/<owner>/<repo>/<parent-number>/workflow.yaml` using lowercase canonical owner/repo path segments validated as GitHub names, no traversal or symlinks. It uses existing `workflow`, `stage`, `stages.<stage>.approved/reopened` format, plus a top-level `github` identity (`host`, `repositoryId`, `repository`, `issueId`, `number`) and each approval's existing `by`, `at`, `commit` plus `remote` evidence. Example:

```yaml
workflow: feature
stage: tickets
github:
  host: github.com
  repository: owner/repo
  repositoryId: R_example
  issueId: I_example
  number: 42
stages:
  spec:
    approved:
      by: Developer
      at: 2026-10-27T12:00:00Z
      commit: abc123
      remote:
        version: 1
        parentId: I_example
        digest: sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

Use the worktree copy once created, otherwise the checkout; create the branch/worktree using the stable slug and include the workflow file in normal setup/gate commits. Preserve other staged and dirty work using existing write safeguards; reject invalid YAML, identity mismatch, symlinks, unresolved index/merge conflicts or concurrent writers without overwriting. A branch merge carries the file; resolve conflicts explicitly in Git, never auto-select an approval. Warn on main/worktree divergence. No issue content is mirrored into the committed file.

Evidence version 1 hashes canonical UTF-8 JSON with fixed field order and unambiguous arrays: parent node ID and exact body; for tickets and later gates, additionally the sorted complete direct-child set, each child node ID, exact body, state/reason, relevant triage labels, complete sorted blocker identities and states, and all comment IDs and exact bodies sorted by ID. Parent comments are discussion, not spec, and are excluded; ticket comments are included because agents use them as durable implementation history. Titles, assignees and timestamps alone do not change the digest. Store the parent identity and `sha256:<lowercase hex>` with the approved code HEAD; the digest is calculated from fetched bytes, not `updatedAt`. Fetch the required complete set immediately before approval, compare with the reviewed snapshot and current worktree HEAD, refuse if either changed or unavailable, and record the observed evidence. Recheck after commit and before any dependent use. A parent body edit invalidates its spec approval and downstream remote-dependent approvals; ticket set/body/comments/status/labels/dependencies changes invalidate ticket and downstream approvals, but do not invalidate the spec approval. An edit later reverted to identical evidence is equivalent. A different HEAD invalidates checks/review under existing commit rules; keep approval history and explicitly show stale, never silently rewrite it. Reopening uses the existing stage record, invalidates downstream use and requires fresh evidence and approval. Since reads and Git cannot be atomic, even a successful post-check is only an observation; later refresh can invalidate it.

### Agent brief

For a GitHub ticket, give the stage skill, explicit github.com owner/repo, parent and ticket numbers, canonical URLs and node identities; point to the parent body, ticket body, comments and blocker issues via read-only `gh issue view`/`gh api` commands using explicit repo. Include snapshot time, worktree path/branch, local conventions, glossary and ADR pointers, last handoff, checkpoint and local changes. Tell the agent to refetch before work, finish only the selected ticket, use its configured tracker skill and `gh` for status/comments, record actual checks, reference the issue in its commit, leave gate approval to the developer and do not push unless authorized. Never tell it to create `.scratch` spec/ticket files or edit a local Status line. Planning-stage briefs likewise publish to the parent/children through the configured skill, not Stintwork. No token or copied private issue body is required in the brief.

## Testing Decisions

All automated tracker tests use recorded, sanitized `gh` JSON fixtures and a fake `gh` executable, never network. Cover pagination, partial/failed pages, native/text conflicts, status and unknown blockers, identity, revisions, concurrent changes and local-tracker regressions. Unit and fake-process integration tests need no real `gh`, network, sockets or browser; server/browser integration tests may need local sockets and a browser and are coordinator-run. Browser cases follow `docs/agents/frontend.md`, all four widths and both languages, both colour schemes at 1440/390 when styling changes; coordinator reviews 1440/390 in both languages. The coordinator alone runs live `gh`, network and real-repo exit checks and records actual evidence, limits and cleanup.

## Out of Scope

GitHub issue writes by Stintwork, two-way sync, GitHub Enterprise hosts, multiple remotes, automatic rename/transfer migration, cross-repo/nested tickets, task-list membership, standalone ticket inference, persistent offline cache, Projects, live subscriptions and generalized tracker adapters are later work. Local Markdown behavior and existing review/check/merge security remain intact.

## Further Notes

The spike observed no nonempty live relationships; fixtures verify the documented shapes but do not prove real access or end-to-end skills output. The exit requires a maintainer-selected real repo, existing authenticated access, permission to create/edit issues and merge a PR, a qualifying parent (with direct same-repository sub-issues or the label), a direct same-repository ticket for the exit, and suitable checks. The coordinator asks which repo; none is assumed. Do not mark M11 shipped until the maintainer accepts the real exit.

## Comments

**Codex, 2026-10-27:** Filed the spec and proposed ADR. The maintainer subsequently approved ADR 0013 and revised discovery to include top-level issues with direct same-repository sub-issues. Live evidence remains pending.
