# ACP agent probe

Node 22 ESM; uses the installed `@agentclientprotocol/sdk` 1.7.0 and the repository's
existing `tsx` to load Stintwork's permission mapping, with no added dependencies.

```sh
node probe.mjs --agent claude --scenario all
node probe.mjs --agent codex --scenario commands --timeout-sec 120
node probe.mjs --agent grok --scenario cancel
node --check probe.mjs
node selftest.mjs
```

Run each agent separately. By default, adapters come from this directory's
`node_modules`; Claude uses `CLAUDE_CODE_EXECUTABLE` or `command -v claude` in a
login zsh, and Codex uses `CODEX_PATH` or its bundled launcher. Grok requires
`grok` on PATH. Existing agent logins are used. The
probe records authentication errors and advertised methods, never logs in.

## Isolated installed/bundled comparison

Run preparation only on the coordinator's network-enabled machine. From the
repository root (Node 22+, npm on PATH):

```sh
matrix=$(mktemp -d "${TMPDIR:-/tmp}/stintwork-cli-probes.XXXXXX")
node spikes/acp-probe/prepare-prefix.mjs --agent claude --profile installed \
  --dir "$matrix/claude-installed" --cache "$matrix/npm-cache/claude-installed" \
  --registry https://registry.npmjs.org
node spikes/acp-probe/probe.mjs --agent claude --scenario all \
  --adapter-prefix "$matrix/claude-installed" --executable /Users/tzrea1/.local/bin/claude
```

`prepare-prefix.mjs` requires `--agent claude|codex`, `--profile installed|bundled`,
`--dir`, `--registry`, and a separate `--cache`. It refuses an existing prefix
(including partial installs); use a new directory after failure. It pins ADR
0011's adapter and SDK/launcher versions, overriding the latter's transitive
resolution too. Both profiles use `npm install --no-audit --no-fund
--ignore-scripts --omit=optional`; bundled adds only the host-native package as
an exact required dependency (including Codex's npm alias). Claude Linux chooses
glibc or musl; Codex Linux uses its musl payload on either libc. Unsupported
hosts fail rather than guessing. Private empty npmrc files and explicit local
prefix/cache/registry flags keep global installs and user/global npm config
unchanged. No agent config or credentials are read by these scripts.
Npm is invoked as `node <npm-cli.js>`, not through the POSIX `npm` executable or
a shell: resolution accepts npm's `npm_execpath` (not pnpm's), a PATH installation
including Windows `npm.cmd` layouts, or Node's adjacent npm installation.

The generated `package-lock.json` and `package-lock.sha256` identify **this probe's**
resolved closure. Preserve both with results: fresh preparation can resolve newer
peers/transitives, so an adapter pin alone is not a released lock. This is probe
preparation, not ticket 04's production cache or frozen release profiles.

`--adapter-prefix DIR` loads `DIR/node_modules/<adapter>/dist/index.js` via Node,
not a PATH adapter or this spike's bin shim. Package resolution is confined to
that prefix, including SDK/launcher/native packages. With a prefix, supplying
`--executable PATH` selects Installed via `CLAUDE_CODE_EXECUTABLE` (Claude) or
`CODEX_PATH` (Codex). Omitting it selects Bundled: inherited executable overrides
are cleared, and Claude's PATH lookup is skipped. Explicit executable paths are
resolved to absolute paths; missing/non-executable files fail without fallback.
These options do not apply to Grok. The probe client still uses this spike's SDK;
the adapter and its own SDK/launcher come from the selected prefix.

Ticket 03's Comments contain all four coordinator commands and acceptance rules.
Preparation and `--version` do **not** establish compatibility; run all five
authenticated ACP scenarios, inspect their evidence, and only then record proven
pairs for the pure `selectAgentSource` policy in `packages/agents/src/executable.ts`.
The table keeps exact fully proven evidence points, including bundled runs;
the coordinator-approved policy derives a stable CLI range from the lowest point
through, but excluding, its next major: Claude `>=2.1.293 <3.0.0` with adapter
0.88.0 and Codex `>=0.159.3 <1.0.0` with adapter 2.1.1. Installed Codex 0.163.0
passes all five Ask-mode scenarios in `2026-10-17T09-30-46-164Z-codex`;
0.148.0 remains partial (four passes, Ask permission untested) and below the floor.
Explicit negative evidence for an exact version overrides range compatibility.
Versions must be normalized stable `major.minor.patch` (optional build metadata);
missing versions return `missing`, malformed/prerelease versions `unparseable`,
versions below the floor (or without a proven floor) `below-tested-range`, and
next-major-or-later versions or explicit negatives `incompatible`.
The policy is deliberately not connected to launch until tickets 04/05, which
require a prompt-free ACP initialize/new-session handshake at each stint start:
failure selects the pinned bundled package for that stint and surfaces
`handshake failed`. Range acceptance is not a claim that every version was probed.

Each invocation creates `runs/<timestamp>-<agent>/fixture/`, a disposable git
repository with a README, `src/add.js`, and committed `probe-skill` files in
both `.claude/skills` and `.agents/skills`. It never commits in this directory's
own repository. All session working directories are absolute fixture paths.

| Scenario | What it checks |
| --- | --- |
| `basic` | Initialize metadata, new-session settings, all update kinds, and a nonempty README-summary reply ending with `end_turn`. It does not grade sentence quality. |
| `commands` | Wait up to five seconds for command discovery; try `/probe-skill`, then `$probe-skill` in a new session only for Codex if needed. Success means the reply contains `PROBE-SKILL-OK`. |
| `permission` | Stintwork Ask-mode permission requests, full tool/options shape, allow-once creating a file, and reject-once leaving it absent in a second session. No permission request means rejection is unproven (`unsupported`), unless the reject run creates the file (`fail`). |
| `cancel` | Send the SDK cancellation notification eight seconds after prompting for `sleep 60`; measure prompt-resolution latency and require `cancelled`. Early completion fails the check. |
| `resume` | Remember HERON, kill the original process, initialize another, load/resume the same session, and check the new reply. Session-list-only capability is logged but cannot prove resume support. |

The permission scenario defaults to `--permission-mode ask`: it calls the same
`permissionPolicy` in `packages/core/src/permission-levels.ts` as the agent launcher
(Codex `read-only`, Claude `default`), then sets that mode on **both** allow and
reject sessions. An unavailable required mode is an error, never a silent
fallback. The summary records `permissionMode` and the scenario's
`facts.sessionModes` (permission level, advertised default, requested and chosen
mode for each session). `--permission-mode default` retains the old auto-approving
default as a diagnostic comparison, not approval proof. `PROBE_MODE` still applies
to other scenarios, but cannot override the permission scenario's selected policy.

`summary.json` contains status, scenario facts, every initialization response,
session responses (including any modes/models/configOptions returned), update
counts and first examples, all updates, permission decisions, stderr paths,
errors, stop reasons, and timings. Raw inbound/outbound protocol frames and raw
responses are retained too, so SDK schema normalization cannot hide extra
returned fields (such as `models`) or unknown update types. `<scenario>.jsonl` records every event with
an ISO timestamp and elapsed milliseconds. `<scenario>-a.stderr.log` captures
process stderr; resume also has `resume-b.stderr.log`. The stdout table is an
overview; use the JSON files for complete evidence.

`summary.json.runtime` records Agent source, prefix, adapter entry/version,
SDK/launcher version (and Claude's bundled CLI reference), native package
presence plus actual on-disk package paths/versions (not optional entries merely
listed in the lock), selected executable path and real path, `--version` stdout
and stderr, OS/architecture/libc, Node version, and SHA-256 of the prefix's
`package-lock.json`. Default local runs hash this spike's `pnpm-lock.yaml`.
`invocation` records explicit prefix/executable options; fake-process runs are
marked `testOverride` and cannot be used as compatibility evidence. Resolution
failures are recorded as errors, never silently switched to another source.
Executable `--version` has a separate 60-second first-launch allowance for large
freshly downloaded binaries (including macOS scanning), before the scenario
deadlines start. `runtime.executable.versionTimeoutMs` records this allowance and
`versionWallTimeMs` records actual elapsed time on success or failure.

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
It also checks both prefix profiles with fake npm, fake adapters and fake native
version executables, exact manifests/flags, override forwarding, prefix isolation,
native presence/absence, lock digests, CLI parsing and preparation failure paths.
Regression checks cover Ask-mode approvals versus default auto-approval,
missing-mode refusal, Windows npm JS invocation without a shell, and a fake
first-launch version check that takes more than five seconds.
