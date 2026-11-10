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
