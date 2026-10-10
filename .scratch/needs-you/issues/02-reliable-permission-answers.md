# 02 — Reliable permission answers

Status: ready-for-agent
Blocked by: none

## What to build

In the M2 exit test, a stint waited 15 minutes on a permission request. Answers sent by the coordinator's script didn't take effect, while a manual answer through the same endpoint worked first time. A server-side cause hasn't been ruled out. Make answering verifiably reliable:

- An answer returns success only after the decision has been forwarded to the agent and logged. If forwarding fails, the response is an error with a reason.
- Answering a request whose stint has ended, or that was already answered, returns a clear 409 reason.
- A pending request is removed when its stint ends.
- Investigate and fix whatever could make a 200 answer not reach the agent (for example duplicate pending maps, races between the request event and registration, or answers arriving before the request is registered).

## Acceptance criteria

- [ ] Server test: a real HTTP answer to a fake agent's permission request produces exactly one decision entry in the log, and the fake agent receives the chosen option. Repeat the cycle 20 times in one stint with no misses.
- [ ] Server test: an answer sent the moment the request event appears (racing registration) is applied, not lost.
- [ ] Server test: answering after the stint ended returns 409 with a reason, and no pending request remains.
- [ ] All checks pass.
