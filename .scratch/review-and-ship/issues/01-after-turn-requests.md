# 01 — After-turn requests

Status: resolved
Blocked by: none

## What to build

A refactor that makes findings easy to add: no change in behaviour. Today the agents package hard-codes one follow-up after a stint's work turn: the handoff request, with its retry after a cancel (M2 ticket 12), its timeout, message joining that copes with preambles (M3), and its recorded error. Generalise this into an ordered list of **after-turn requests**. Each has a prompt, a parser, a result field and an error field, and all share the same session, timeout budget, retry and message-joining rules. The handoff becomes the first registered request. Review findings (ticket 03) will be the second.

## Acceptance criteria

- [ ] Existing handoff tests pass unchanged, including the Grok preamble case and the retry-after-cancel cases.
- [ ] Agents test: two after-turn requests run in order in the same session within one timeout budget, each recording its result or error independently.
- [ ] All checks pass.
