# 05 — Go public

Status: resolved
Blocked by: 04

## What to build

Follow `.scratch/go-public/issues/03-make-the-repo-public.md`. After its prerequisites and the release, the maintainer confirms and changes `tzrea1-Q/stintwork` to public. The coordinator checks the public repository and records results in go-public 03 and here. The coordinator does not change visibility.

## Acceptance criteria

- [x] Maintainer confirmation and the visibility change are recorded in go-public 03.
- [x] Without private-repository access, both READMEs render and their links work; CI passes at the merged revision, with run and revision recorded.
- [x] Both issue templates render and are available; SECURITY's private reporting route is available without posting a public vulnerability.
- [x] Failures remain open with their evidence; go-public 03 is resolved only after its checks pass.

## Comments

**Coordinator, 2026-11-10:** Done; results are recorded in [go-public 03](../../go-public/issues/03-make-the-repo-public.md).

- **Visibility:** the maintainer confirmed and changed `tzrea1-Q/stintwork` to public on 2026-11-10, and enabled private vulnerability reporting. `gh repo view` reports `PUBLIC`; the API reports private vulnerability reporting `enabled: true`. No agent changed visibility or settings.
- **Without sign-in (curl, no credentials):** the repo page, `README.md`, `README.zh-CN.md`, `SECURITY.md` and the security policy page return 200. All 14 distinct link targets in both READMEs (repo files and directories, the repo URL and the Antigravity CLI page) return 200.
- **Issue templates:** `config.yml` disables blank issues and offers "Report a security problem privately". GitHub's file preview renders both forms without errors while signed out: Bug report (version, OS, Node.js and further fields) and Feature idea (problem, proposed change, alternatives). Opening a new issue requires a GitHub sign-in, as expected.
- **Security route:** SECURITY points to `/security/advisories/new`, which redirects signed-out visitors to GitHub sign-in and is available to signed-in users; GraphQL reports the security policy enabled. No vulnerability report was posted to test it.
- **CI:** [run 42837728740](https://github.com/tzrea1-Q/stintwork/actions/runs/42837728740) succeeded on `4255b1a`, the current main.
