# 04 — Grok Build end to end

Status: ready-for-human
Blocked by: none

## What to build

Grok Build's registration, warnings and handoff parsing were fixed with real-config and real-reply evidence in M3, but every real stint and probe since was refused with "Rate limited" by Grok's API on the developer's account. When the rate limit allows, rerun the ACP probe for Grok, and a real Grok stint that finishes with a parsed handoff. Record both. This needs no code unless the run finds a defect.

## Acceptance criteria

- [x] The probe for Grok Build is recorded (basic, commands, cancel, resume).
- [ ] A real Grok stint finishes with a parsed handoff and checkpoint, recorded in Comments.

## Comments

**Coordinator, 2026-10-11:** Deferred by the developer and moved to `docs/plan.md` → Later. Grok's API kept refusing real stints with "Rate limited" on the developer's account, so this can't be verified now. Grok Build stays registered with its M3 fixes (config warning, handoff parsing), but it is unverified end to end and the README says so. M4 no longer waits on this ticket.

**Coordinator, 2026-11-09:** Back in scope under M12. The maintainer needs to sign in to Grok again; agents do not sign in or read credentials. Grok Build 1.0.62 basic probe `2026-11-09T12-07-43-010Z-grok` returned “Authentication required; updates=none”.

**Coordinator, 2026-11-10:** Probe recorded. The maintainer signed in again with `grok login` on 2026-11-09. Grok Build 1.0.77, run `2026-11-10T01-32-49-342Z-grok` (local), `node probe.mjs --agent grok --scenario all --timeout-sec 180`:

- basic: pass (`end_turn`, 8.4 s);
- commands: pass;
- cancel: pass (`cancelled`, acknowledged in 57 ms);
- resume: pass (`loadSession`, HERON recalled in a fresh process);
- permission: fail, because no permission request was raised in ask mode and the file was written.

This matches the 2026-10-09 finding that the maintainer's own Grok config sets `permission_mode = "always-approve"`, which Stintwork already reports as a warning. The coordinator did not read or change that config.

Ask-mode permissions for Grok therefore remain untested. They are not required by this ticket. The real stint follows under the M12 exit.

**Coordinator, 2026-11-10:** Two real stints were rate limited. Fixture: local repository `/Users/tzrea1/Develop/stintwork-m12-exit` (no remote), work item `countdown`, quick workflow. Served from main `94a9bba`'s built `dist`, with Grok Build 1.0.77 from the Installed source.

- **Stint `18fb717b`.** It read the skill and spec, checked the branch, and wrote `test/countdown.test.js`. After 35 s it ended `failed` with "Rate limited", leaving checkpoint `f3a996e`.
- **Stint `6d39eadc`.** Started 6 minutes later, it ended `failed` with "Rate limited" after 7 s, on the same checkpoint.

Stintwork handled both correctly: preparation showed the source, executable and version, the always-approve warning was shown, and each failure was visible in stint history with a checkpoint and no handoff. The probe a few minutes earlier passed, so the limit applies to sustained use on the maintainer's account. Criterion 2 is still open. Ways forward: retry later, use an account or plan with a higher limit, or record Grok as rate-limited for the M12 exit (the plan allows "subject to its API rate limits"). That decision is the maintainer's.

**Coordinator, 2026-11-10 (later):** A third stint, `c666d08a`, started at 02:47 UTC, about an hour after the second. It also ended `failed` with "Rate limited", after 6 s, on the same fixture and Grok 1.0.77. The account's limit has persisted for over an hour. Criterion 2 is still open, pending the maintainer's decision.
