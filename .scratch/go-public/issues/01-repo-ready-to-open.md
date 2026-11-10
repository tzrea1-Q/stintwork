# 01 — Repo ready to open

Status: resolved
Blocked by: none

## What to build

Prepare `tzrea1-Q/stintwork` for public use. Add bug-report and feature-idea templates in `.github/ISSUE_TEMPLATE/`, a short CONTRIBUTING.md and SECURITY.md. CONTRIBUTING explains the plan, tickets in `.scratch/`, agents implementing and the coordinator verifying, and how to report a problem. SECURITY points to a private reporting route confirmed by the maintainer.

Scan tracked files and reachable Git history for secrets and private paths before opening. Record the scan's scope and result, not secret values. Findings block opening until addressed. Exposed credentials need rotation; any history rewrite needs the maintainer's confirmation. This ticket does not change repo visibility.

## Acceptance criteria

- [x] Both issue templates ask for enough information to triage a report or idea.
- [x] CONTRIBUTING explains the existing build process and how to report a problem in plain, short sentences.
- [x] SECURITY points to a private reporting route confirmed by the maintainer.
- [x] Comments record the scan tool, tracked-file and history scope, findings and disposition. No unresolved secrets or private paths remain in that scope.
- [x] Preparation is merged before ticket 03. Visibility stays private until the maintainer changes it.

## Comments

**Codex, 2026-10-13:**

Added `.github/ISSUE_TEMPLATE/bug-report.yml`, `feature-idea.yml` and `config.yml`, plus `CONTRIBUTING.md` and `SECURITY.md`. The forms collect bug details or an idea's problem, proposed change and alternatives. Blank issues are disabled. Security reports point to GitHub private vulnerability reporting. The docs describe the existing ticket and coordinator process, source commands and local-agent limitations. `scripts/check-licence-headers.mjs` checks package source extensions, not `.md` or `.yml`; these files need no SPDX header.

Scan method: a temporary Python standard-library regex scanner, not gitleaks or trufflehog. Read all 479 tracked files and their names at HEAD `4dfcc1a3a133074f6004e52ade0bc7b40333701c` with `git ls-tree -r -z --name-only HEAD` and `git show HEAD:<path>`. Scanned full reachable patch history with `git log -p --all --full-history -m --root --no-ext-diff --no-textconv --format=SCAN_COMMIT:%H`, including added, removed and context lines. All 221 unique commits from `git rev-list --all --count` appeared in the scan. Also checked author and committer email metadata with `git log --all --format=%H%x09%ae%x09%ce`; the 221 records have one expected identity pair. Email values are omitted. This covers locally reachable refs, not unfetched remote refs, reflogs or unreachable objects.

Patterns covered AWS access-key IDs, GitHub token prefixes (`ghp_`, `gho_`, `github_pat_` and related prefixes), npm tokens, provider keys beginning `sk-`, private-key blocks, credential assignments with quoted or bare values, and `.env` filenames. Private-path patterns covered `/Users/`, `/home/` and Windows user directories. The username check excluded the GitHub handle `tzrea1-Q`. Matched values were not written to the scan results or this comment.

Findings:

- No AWS, GitHub, npm or provider keys, private-key blocks or tracked `.env` files matched at HEAD or in history. No real credential was found among assignment candidates.
- No private absolute paths or machine-username occurrences outside the GitHub handle matched at HEAD or in history. There are no current tracked private paths to refer to the coordinator. Author and committer emails are expected Git metadata, not exposed credentials; no machine-username match occurred there.
- Assignment candidates occurred in the six paths below, at HEAD and across 22 unique historical commits. Historical matches were compared with the reviewed HEAD lines. The only differing historical candidates were earlier UI label strings in `CheckpointWarnings.tsx`; those were inspected separately. Keep all six paths unchanged: the matches are a test fixture or syntax, not real credentials. No documentation example needed separate disposition.

| Path | Historical commit example | Commits with patch matches | Disposition |
|---|---|---|---|
| `packages/agents/src/claude-code.test.ts` | `0e705a211177119dd454280360f1bcfb301e1ab0` | 8 | Synthetic login token used to test that credentials are not published. Keep the fixture. |
| `packages/agents/src/grok-config.ts` | `3d58c8e1dfc72b997b8f80a646b0efd77eedf89c` | 6 | Parser parameter type, not a credential assignment. No action. |
| `packages/core/src/safe-commands.ts` | `00be1cc8d68e628f585a234ce6a9ff0e0ea40884` | 2 | Command-parser variable and comparisons, not credentials. No action. |
| `packages/web/src/CheckpointWarnings.tsx` | `026ba251a3b8f0dc66779b3d1dd052354351d990` | 7 | Warning label strings and translation references, not credentials. No action. |
| `packages/web/src/i18n/en.ts` | `2fe4fc3ace8f61144f8bfdcbd14ab2056fdcd92a` | 3 | Warning label key and translation, not credentials. No action. |
| `packages/web/src/i18n/zh-CN.ts` | `2f1a025de045413a2e3243a5ff4b88c437cc7143` | 5 | Warning label key and translation, not credentials. No action. |

Checks run: `pnpm --config.verify-deps-before-run=false format:check` passed (307 files). `pnpm --config.verify-deps-before-run=false lint` passed (283 licence headers; 308 linted files), with one existing informational Biome deprecation notice. A Node check using the installed `yaml` parser passed for the forms' requested fields, unique field IDs, log warning, disabled blank issues and security contact URL. `git diff --check` passed. No typecheck, test suite or build was run.

Open risks: regex scanning is not proof that no secret exists. The maintainer still needs to confirm that private vulnerability reporting is enabled and the route works before opening. GitHub rendering and access were not tested. Visibility is unchanged; no repo settings, history, commits or pushes were changed. Ticket Status is unchanged.

**Coordinator, 2026-10-13:** Built by Codex and verified on `go-public`. Codex's scan stopped at `4dfcc1a`. My own scan used `git grep` on HEAD and `git log -p --all` for absolute user paths, the machine username (other than the `tzrea1-Q` handle), GitHub, npm and `sk-` token prefixes and private-key blocks. It covered the later commits from this ticket, 02 and the CI fix, and found nothing. `spikes/acp-probe/runs/` (probe transcripts) is gitignored and untracked. Every commit's author and committer email is the maintainer's personal address, which becomes public with the repo; the maintainer decides this at ticket 03. On `go-public` with no `packages/*/dist`, in CI order: `format:check`, `lint`, `typecheck`, `test` (2100 passed), `build` and `smoke:package` passed. That includes the core tests that parse this repo's tickets. Code review: no hard violations. SECURITY's "Supported versions" section (latest published version only) goes beyond the ticket and needs the maintainer's agreement. Waiting on the maintainer to confirm GitHub private vulnerability reporting as the route; it is enabled at ticket 03.

**Coordinator, 2026-10-17:** Built and merged; Status stays ready-for-human pending the maintainer's confirmation of the SECURITY route and latest-published-version support policy. The repo stays private until M13, when ticket 03 enables and checks the public reporting route. M7 now covers preparation only and can exit after 01 and 02 are resolved on the maintainer's confirmation.

**Coordinator, 2026-11-10: maintainer confirmation.** The maintainer confirmed GitHub private vulnerability reporting as SECURITY's reporting route, and the support policy that only the latest published version receives security fixes. The route is enabled and checked on the public repo in ticket 03 (M13). Visibility stays private until then.
