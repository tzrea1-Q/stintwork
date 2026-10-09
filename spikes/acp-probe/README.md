# ACP agent probe

Node 22 ESM; uses the installed `@agentclientprotocol/sdk` 1.7.0 and no added dependencies.

```sh
node probe.mjs --agent claude --scenario all
node probe.mjs --agent codex --scenario commands --timeout-sec 120
node probe.mjs --agent grok --scenario cancel
node --check probe.mjs
node selftest.mjs
```

Run each agent separately. Claude requires `command -v claude` in a login zsh;
the probe sets `CLAUDE_CODE_EXECUTABLE` to that path. Codex uses the installed
`codex-acp`; Grok requires `grok` on PATH. Existing agent logins are used. The
probe records authentication errors and advertised methods, never logs in.

Each invocation creates `runs/<timestamp>-<agent>/fixture/`, a disposable git
repository with a README, `src/add.js`, and committed `probe-skill` files in
both `.claude/skills` and `.agents/skills`. It never commits in this directory's
own repository. All session working directories are absolute fixture paths.

| Scenario | What it checks |
| --- | --- |
| `basic` | Initialize metadata, new-session settings, all update kinds, and a nonempty README-summary reply ending with `end_turn`. It does not grade sentence quality. |
| `commands` | Wait up to five seconds for command discovery; try `/probe-skill`, then `$probe-skill` in a new session only for Codex if needed. Success means the reply contains `PROBE-SKILL-OK`. |
| `permission` | Default-mode permission requests, full tool/options shape, allow-once creating a file, and reject-once leaving it absent in a second session. No permission request means rejection is unproven (`unsupported`), unless the reject run creates the file (`fail`). |
| `cancel` | Send the SDK cancellation notification eight seconds after prompting for `sleep 60`; measure prompt-resolution latency and require `cancelled`. Early completion fails the check. |
| `resume` | Remember HERON, kill the original process, initialize another, load/resume the same session, and check the new reply. Session-list-only capability is logged but cannot prove resume support. |

`summary.json` contains status, scenario facts, every initialization response,
session responses (including any modes/models/configOptions returned), update
counts and first examples, all updates, permission decisions, stderr paths,
errors, stop reasons, and timings. Raw inbound/outbound protocol frames and raw
responses are retained too, so SDK schema normalization cannot hide extra
returned fields (such as `models`) or unknown update types. `<scenario>.jsonl` records every event with
an ISO timestamp and elapsed milliseconds. `<scenario>-a.stderr.log` captures
process stderr; resume also has `resume-b.stderr.log`. The stdout table is an
overview; use the JSON files for complete evidence.

Statuses are `pass`, `fail`, `unsupported`, `timeout`, or `error`. The default
120-second deadline covers the entire scenario, including additional sessions
and reconnection. On timeout the client attempts cancellation, then terminates
the process group (TERM followed by KILL); each scenario always cleans up its
agent. The CLI exits nonzero for fail/error/timeout, not unsupported.

Filesystem callbacks advertise read/write support, preserve 1-based line/limit
reads, and reject paths outside the fixture, including existing symlink escapes.
Terminal callbacks are optional in this SDK and are not advertised or supplied.
Agents execute their own shell commands. This is **not an agent sandbox**:
real agents still inherit the user's environment and login, and may access other
files through their own tools. Use only trusted agents. Event logs can contain
agent output, tool arguments and file contents; do not publish them blindly.

`selftest.mjs` launches `node lib/fake-agent.mjs` using SDK `AgentSideConnection`
and exercises the same client/scenario logic without any real login or agent.
Its fast cancellation timing is a test-only override; the CLI always uses eight
seconds. Passing selftests proves harness behavior, not real-agent support.
