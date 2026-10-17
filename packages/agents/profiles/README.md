# Released adapter profiles

Each directory ships an exact `package.json` and reviewed npm v3
`package-lock.json`. Missing locks or integrity data are hard errors, never a
request to resolve versions at runtime. Test locks are synthetic fixtures, not
release evidence. Neither board startup nor availability refresh executes a CLI,
prepares packages or starts ACP. Only an explicit stint start invokes preparation.

Claude: adapter 0.88.0, SDK/native 0.3.293 (CLI 2.1.293). Codex: adapter 2.1.1,
launcher 0.159.3, required native alias `@openai/codex-<os>-<arch>` resolving to
`@openai/codex@0.159.3-<os>-<arch>`. Installed profiles have no required native
package. Bundled profiles require only the selected host native. Claude has
separate Linux glibc/musl profiles; Codex's Linux native targets musl. Supported
OS/architecture rows come from the dated research, not an inferred CLI floor.

From the repository root, with network access:

```sh
# Writes all 16 manifests and complete locks using isolated npm configuration/cache.
# --force is used ONLY for lock-only generation of foreign platform profiles.
node --import tsx scripts/generate-agent-locks.ts
git diff -- packages/agents/profiles
```

Review every lock's versions, transitive/peer closure, npm aliases, registry
artifacts and SHA-512 integrities, rerun the contract probes for this released
closure, and commit all 16 locks before shipping. Generation is a release step;
the runtime only executes frozen `npm ci --ignore-scripts --omit=optional` without
`--force`. `--manifests-only` regenerates manifests without contacting a registry.
No postinstall/preparation scripts are required or permitted by these profiles.
The package builder copies the profiles into `dist/agent-profiles/`.
Generation runs npm in the staged profile's cwd without `--prefix`, avoiding
symlinked-temp path differences on macOS. Every staged lock must pass the same
`releasedProfile` validator as runtime preparation before it is written to the
release directory. Agents tests validate each present released lock; absent locks
are explicitly skipped.

Real preparation and prompt-free installed-CLI handshake (not a provider-backed
stint or proof of login readiness), after the locks are present:

```sh
STINTWORK_PREPARE_AGENT=codex node --conditions=development --import tsx --input-type=module <<'NODE'
import { prepareAgentForStint } from './packages/agents/src/index.ts';
const agent = process.env.STINTWORK_PREPARE_AGENT;
if (!['claude', 'codex'].includes(agent)) throw new Error('Select claude or codex');
const prepared = await prepareAgentForStint({
  agent,
  cwd: process.cwd(),
  onProgress: event => console.log(JSON.stringify(event)),
});
console.log(JSON.stringify(prepared, null, 2));
NODE
```

Repeat with `STINTWORK_PREPARE_AGENT=claude`. Supply `CODEX_PATH` or
`CLAUDE_CODE_EXECUTABLE` for an explicit CLI; otherwise PATH is used. For a deliberate
bundled test, set the corresponding override to a nonexistent absolute path for
that invocation only. The developer's login stays in its existing location;
Stintwork never reads credentials or invokes login.

The default namespace is `~/Library/Caches/stintwork/agents` on macOS,
`${XDG_CACHE_HOME:-~/.cache}/stintwork/agents` on Linux, and
`%LOCALAPPDATA%/stintwork/agents` on Windows (home AppData/Local fallback).
`STINTWORK_AGENT_CACHE=/absolute/empty/directory` overrides the namespace. It must
be outside the project. A nonempty directory without Stintwork's ownership marker
is refused: never point it at a normal npm cache, global installation or agent
configuration. Owned children are `entries/`, `locks/` and `npm-cache/`; npm uses
only this private cache and empty local/global npmrc files. It cannot inherit
`npm_config_*` settings. npm output is suppressed and persistent npm logs disabled.

Entries key agent/adapter, manifest+lock digest, installed/bundled profile,
OS/architecture/libc, Node major and module ABI, independently of project or root
package version. Staging is a unique sibling on the same filesystem. An immutable
PID/token/ticket lock serializes processes using atomic, unique owner records;
no age-based lock stealing is allowed. Dead owners alone can be reclaimed, and
their unique filenames are never reused by new owners. A PID
reused by the OS is conservatively treated as alive until timeout. Waiting and
installation share a five-minute default deadline; cancellation uses AbortSignal.
Only the attempt's staging and owner file are cleaned on failure. Killed-process
staging is ignored and never launched; previous complete entries are retained.
Corrupt entries fail closed and are retained for inspection; use a fresh empty
override directory to retry without deleting evidence or changing pins.

Preparation checks package versions against the released lock, symlink confinement,
owner/write permissions, executable paths/versions, a prompt-free ACP `initialize`
exchange followed by stdin/process closure, and a SHA-256
installed-file/mode/link manifest before atomic publication. Every reuse verifies
that manifest. Initial CLI `--version` and adapter ACP initialization each allow 60 s;
progress reports measured smoke elapsed time and success/failure. Unix ownership
checks use uid and mode bits. Windows checks owner SIDs and ACL write grants using
noninteractive Windows PowerShell, refusing unsafe grants or a missing checker;
SYSTEM/Administrators are trusted. Windows ACL behavior and native execution still
need coordinator validation on Windows.

Ticket 05 consumes exports from `@stintwork/agents`:

- `prepareAgentForStint(options)`: explicit selected-agent preparation, then
  prompt-free `initialize`/new-session handshake for an installed CLI. Protocol or
  startup incompatibility falls back to Bundled with reason `handshake failed`.
  Authentication, permission, provider and unclassified failures propagate.
- `prepareAgent(options)`: package preparation only; success is not login readiness.
- `PreparedAgent`: source, reason, absolute executable path/version/identity,
  absolute adapter entry, adapter version, cache key and released lock digest.
- `AgentPreparationOptions`: agent, cwd, env, AbortSignal, progress callback,
  timeout, cache and profile directory overrides (fixture seams).
  `beforePrepare(event, signal)` pauses before any cache/install work for each
  source selection, including handshake fallback. The web start stream waits for
  source confirmation there; cancellation rejects the wait through its signal.
- `AgentPreparationEvent`: selected/waiting/installing/verifying/smoke/ready,
  agent, adapter version, source/reason, optional executable and elapsed/success.
- `inspectInstalledAgent`, pure `selectAgentSource`, `adapterPins` and
  `agentCacheDirectory`: detection/selection evidence without preparation.
  Inspection runs `--version`; ticket 05 must keep board inspection cheap rather
  than awaiting this first-launch check on the board.
- Existing launchers accept `AgentStintOptions.preparedAgent` plus optional `env`.
  Pass the freshly prepared result directly to the selected registered launcher's
  stint options; this path works with no adapters in Stintwork's node_modules.
  `preparedAgentEnvironment` applies the same absolute CLI override to adapter
  subprocess helpers. Never persist the environment or cache login readiness.

The server invokes preparation only at explicit stint start and passes its result
directly to the launcher. The web start request accepts `application/x-ndjson`:
`starting` supplies the cancellation id, `preparation` streams source/progress,
and `result` carries the final HTTP status/body. `confirm-agent` continues the
selected source; the existing `stop` action aborts preparation and leaves retry
available. Nonstreaming clients retain the existing JSON response contract.
The source, reason, executable and adapter details are also recorded in the stint
log after preparation succeeds. Availability retains explicit-start evidence only
while the local executable identity is unchanged; package completion alone never
marks an agent ready. Grok keeps native `grok agent stdio` and checks readiness only
at explicit start, under the developer's own login.

The root package ships profiles/locks without adapter dependencies. Both adapters
are agents-package devDependencies for the existing launcher tests only. Ticket 06
owns broader adversarial coverage; 07 owns real-agent/platform, network and timing
evidence. Offline npx needs the root package cached. Warm package readiness proves
neither login nor offline provider inference. Stintwork never invokes login or
reads, stores or proxies credentials.
