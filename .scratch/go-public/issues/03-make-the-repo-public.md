# 03 — Make the repo public

Status: resolved
Blocked by: 01, 02

## What to build

After 01 and 02 merge, the maintainer confirms and changes `tzrea1-Q/stintwork` to public. The coordinator checks CI, both README renders and the bug-report and feature-idea templates on the public repo. Check that SECURITY's private reporting route is available. No agent changes visibility on the maintainer's behalf.

## Acceptance criteria

- [x] Comments record the maintainer's confirmation and the visibility change.
- [x] The repo and both READMEs can be read without private-repo access, and their links work.
- [x] CI passes at the merged revision; Comments link the run and record the revision.
- [x] Both issue templates are available on the public repo and render correctly.
- [x] Private security reporting is available as described in SECURITY; no vulnerability is posted publicly to test it.

## Comments

**Coordinator, 2026-10-17:** This work happens in M13 · v0.2 release and going public, not M7. The repo stays private until then. The maintainer changes visibility; the coordinator records the public CI, README, issue-template and private-reporting checks here.

**Coordinator, 2026-11-10: author email.** Every existing commit's author and committer email is the maintainer's personal address, which becomes public with the repo. The maintainer decided to keep existing history unchanged and use the GitHub noreply address for future commits. The coordinator set the noreply address in this checkout's local Git config; the maintainer's global Git config and GitHub email settings are unchanged.

**Coordinator, 2026-11-10: pre-public rescan.** After v0.2.0 was published, a rescan of HEAD for absolute user paths, the machine username and GitHub, npm, `sk-` and private-key token patterns found no credentials. It found machine-specific paths (the home directory and session temp paths) in ten ticket, research and probe-README files added since the October scan; they were replaced with `~` and placeholders in `5d59bb8`. Nine historical commits still contain those paths, which reveal only the local username; history is kept unchanged, consistent with the maintainer's decision on author emails. The published `stintwork@0.2.0` tarball contains no such path.

**Coordinator, 2026-11-10: public checks passed.**

- **Visibility:** the maintainer confirmed and changed `tzrea1-Q/stintwork` to public on 2026-11-10, and enabled private vulnerability reporting. `gh repo view` reports `PUBLIC`; the API reports private vulnerability reporting `enabled: true`. No agent changed visibility or settings.
- **Without sign-in (curl, no credentials):** the repo page, `README.md`, `README.zh-CN.md`, `SECURITY.md` and the security policy page return 200. All 14 distinct link targets in both READMEs (repo files and directories, the repo URL and the Antigravity CLI page) return 200.
- **Issue templates:** `config.yml` disables blank issues and offers "Report a security problem privately". GitHub's file preview renders both forms without errors while signed out: Bug report (version, OS, Node.js and further fields) and Feature idea (problem, proposed change, alternatives). Opening a new issue requires a GitHub sign-in, as expected.
- **Security route:** SECURITY points to `/security/advisories/new`, which redirects signed-out visitors to GitHub sign-in and is available to signed-in users; GraphQL reports the security policy enabled. No vulnerability report was posted to test it.
- **CI:** [run 42837728740](https://github.com/tzrea1-Q/stintwork/actions/runs/42837728740) succeeded on `4255b1a`, the current main.
