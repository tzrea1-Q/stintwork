# Pre-release ACP contract

Run manually on the final release revision with a clean checkout. Node 22+, pnpm and the repository dependencies are required. The maintainer installs and signs in to each agent beforehand; this harness never logs in or reads or changes agent configuration or credentials. Product preparation may download the pinned adapter on first use. Run only trusted agents: their tools are not sandboxed by this probe.

```sh
pnpm test:acp-contract
node --conditions=development --import tsx spikes/acp-probe/contract.mjs --run
node spikes/acp-probe/contract.mjs --check spikes/acp-probe/runs/contract-<timestamp>
```

The self-test uses the existing fake ACP agent and is deliberately separate from default `pnpm test` because it spawns processes. It is not release evidence. `--run` executes all agents and the server checkpoint fallback test; the generated `verdict.json` includes the revision, clean-tree flag, OS, source, selected executable and version, adapter pin and lock identity, and results. The check requires all four agents, every applicable scenario, a clean recorded revision matching current HEAD, a currently clean working tree and real-agent markers. Rerun on the final revision after any change. Record commands, OS, revision, versions, sources, results and justified capability limits in the ticket. Review the probe summaries and raw observations before recording evidence; machine results do not replace review. Run directories under `runs/` are gitignored. Transcripts may contain sensitive output and must stay private.

| Agent | Source and version | Required scenarios and results |
| --- | --- | --- |
| Claude Code | Product-selected Installed compatible CLI (>=2.1.293 and <3) or Bundled 2.1.293; pinned adapter 0.88.0 | basic, commands, Ask permission, cancel and ACP recovery pass; recovery must demonstrate `session/load` in a new process (ADR 0012) |
| Codex | Product-selected Installed compatible CLI (>=0.159.3 and <1) or Bundled 0.159.3; pinned adapter 2.1.1 | Same as Claude, including new-process `session/load` |
| Grok Build | Installed `grok agent stdio`; product currently has no enforced version floor; 1.0.77 was probed | basic, commands, Ask permission and cancel pass, subject to the limitations below; ACP recovery is recorded separately from checkpoint fallback |
| Antigravity CLI | Installed `agy acp`, >=1.5.3 (ADR 0018) | Same as Grok; checkpoint fallback is separate from ACP recovery |

Basic requires a nonempty completed reply; commands require the fixture skill marker; Ask requires both an allow request that creates a file and a reject request that does not; cancel requires a cancelled running prompt. ACP recovery probes a fresh process and recall. For Grok and Antigravity, unsupported load/resume is accepted only when neither the first nor the replacement process advertises either capability, because ADR 0012 and more-agents tickets 04/07 establish that the product uses checkpoint fallback instead; the server's startup eligibility test must also pass. A missing or inconsistent observation, failed attempt or timed-out recovery probe blocks. Claude and Codex require `session/load` even if `session/resume` works.

Every result is `pass`, `fail`, `timeout`, `unsupported-accepted`, `unsupported-unexplained`, or `untested`. Only pass and the documented exceptions count. On 2026-11-10 the maintainer accepted Grok's account rate limits and untestable Ask scenario as known limitations for v0.2; Grok remains experimental. If both Ask sessions raise no requests, the result is accepted as untested, not permission support (see [agent-polish 04](../../.scratch/agent-polish/issues/04-grok-end-to-end.md)). A failed Grok scenario reporting rate limiting is also accepted. Basic must run, and the verdict lists accepted limitations and reasons. The harness never reads or changes agent configuration. Missing login, missing version, other untested or unsupported behavior, other failures and timeouts still block release. These Grok exceptions do not apply to other agents. See [probe details](README.md) for scenario evidence.
