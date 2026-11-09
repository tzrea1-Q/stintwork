import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveAgent, runProbe, SCENARIOS } from './probe.mjs';
import { npmEntry, preparePrefix } from './prepare-prefix.mjs';
import { environment, lockIdentity, nativePackage, PINS } from './lib/prefix.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const execute = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'acp-probe-selftest-'));
const outsideFile = join(root, 'outside.txt');
await writeFile(outsideFile, 'outside-original');
const run = (scenarios, mode = 'normal', overrides = {}) => runProbe({
  agent: 'codex', scenarios, root, timeoutSec: 10, cancelAfterMs: 100,
  spawnSpec: { command: process.execPath, args: [join(here, 'lib/fake-agent.mjs')], env: { FAKE_MODE: mode, FAKE_OUTSIDE_FILE: outsideFile } },
  ...overrides,
});

function assertDead(connection) {
  assert.ok(connection.pid);
  assert.throws(() => process.kill(connection.pid, 0), (error) => error.code === 'ESRCH');
}

try {
  const ask = (await run(['permission'], 'ask_required')).scenarios[0];
  assert.equal(ask.status, 'pass', 'Ask must override the auto-approving default for both sessions');
  assert.deepEqual(ask.facts.sessionModes.map(({ requestedMode, chosenMode, permissionLevel }) => ({ requestedMode, chosenMode, permissionLevel })), [
    { requestedMode: 'read-only', chosenMode: 'read-only', permissionLevel: 'ask' },
    { requestedMode: 'read-only', chosenMode: 'read-only', permissionLevel: 'ask' },
  ]);
  const agentDefault = (await run(['permission'], 'ask_required', { permissionMode: 'default' })).scenarios[0];
  assert.equal(agentDefault.status, 'fail');
  assert.equal(agentDefault.facts.allow.requests.length, 0);
  assert.equal(agentDefault.facts.reject.fileExists, true);
  const noAskMode = (await run(['permission'], 'no_ask_mode')).scenarios[0];
  assert.equal(noAskMode.status, 'error');
  assert.match(noAskMode.error.message, /required read-only mode/);
  const claudeAsk = (await run(['permission'], 'normal', { agent: 'claude' })).scenarios[0];
  assert.equal(claudeAsk.status, 'pass');
  assert.deepEqual(claudeAsk.facts.sessionModes.map(({ chosenMode }) => chosenMode), ['default', 'default']);
  await assert.rejects(run(['permission'], 'normal', { permissionMode: 'invalid' }), /permission-mode must be ask or default/);
  console.log('PASS: Stintwork Ask modes, both sessions, missing-mode refusal, explicit default-mode diagnostic');

  const npmTools = join(root, 'fake npm tools');
  const npmJs = join(npmTools, 'node_modules/npm/bin/npm-cli.js');
  await mkdir(dirname(npmJs), { recursive: true });
  await writeFile(join(npmTools, 'npm.cmd'), '@echo off\nexit /b 91\n');
  await writeFile(npmJs, `const fs = require('node:fs');\nfs.writeFileSync('npm-invocation.json', JSON.stringify({ executable: process.execPath, args: process.argv.slice(2) }));\nfs.writeFileSync('package-lock.json', JSON.stringify({ lockfileVersion: 3 }));\n`);
  assert.equal(await npmEntry({ PATH: npmTools, npm_execpath: join(npmTools, 'pnpm.cjs') }, 'win32'), await realpath(npmJs));
  assert.equal(await npmEntry({ PATH: '', npm_execpath: npmJs }, 'win32'), await realpath(npmJs));
  const npmPrefix = join(root, 'fake npm prefix');
  await execute(process.execPath, [join(here, 'prepare-prefix.mjs'), '--agent', 'codex', '--profile', 'installed', '--dir', npmPrefix, '--cache', join(root, 'fake npm cache'), '--registry', 'https://registry.example.invalid'], { env: { ...process.env, PATH: npmTools, npm_execpath: npmJs } });
  const npmInvocation = JSON.parse(await readFile(join(npmPrefix, 'npm-invocation.json'), 'utf8'));
  assert.equal(npmInvocation.executable, process.execPath);
  assert.equal(npmInvocation.args[0], 'install');
  assert.ok(npmInvocation.args.includes('--ignore-scripts'));
  assert.match(await readFile(join(npmPrefix, 'package-lock.sha256'), 'utf8'), /^[a-f0-9]{64}  package-lock.json\n$/);
  console.log('PASS: Windows npm.cmd layout and npm_execpath resolution, fake npm JS invoked via Node without a shell');

  for (const agent of ['claude', 'codex']) {
    for (const profile of ['installed', 'bundled']) {
      const prefix = join(root, `${agent}-${profile}`);
      const cache = join(root, `${agent}-${profile}-cache`);
      const pin = PINS[agent];
      let installArgs;
      const prepared = await preparePrefix({ agent, profile, dir: prefix, cache, registry: 'https://registry.example.invalid' }, async (args, options) => {
        installArgs = args;
        assert.equal(options.cwd, prefix);
        assert.ok(Object.keys(options.env).every((key) => !/^npm_config_/i.test(key)));
        await writeFile(join(prefix, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, agent, profile }));
      });
      const manifest = JSON.parse(await readFile(join(prefix, 'package.json'), 'utf8'));
      assert.equal(manifest.dependencies[pin.adapter], pin.version);
      assert.equal(manifest.dependencies[pin.dependency], pin.dependencyVersion);
      const native = nativePackage(agent);
      assert.equal(manifest.dependencies[native.name], profile === 'bundled' ? native.version : undefined);
      assert.equal(Object.keys(manifest.dependencies).length, profile === 'bundled' ? 3 : 2);
      for (const flag of ['--no-audit', '--no-fund', '--ignore-scripts', '--omit=optional', '--global=false']) assert.ok(installArgs.includes(flag));
      for (const [flag, value] of [['--cache', cache], ['--prefix', prefix], ['--registry', 'https://registry.example.invalid/'], ['--userconfig', join(prefix, '.npmrc')], ['--globalconfig', join(prefix, '.global-npmrc')]]) assert.equal(installArgs[installArgs.indexOf(flag) + 1], value);
      assert.equal(await readFile(join(prefix, 'package-lock.sha256'), 'utf8'), `${prepared.lock.digest}  package-lock.json\n`);
      assert.deepEqual(prepared.lock, await lockIdentity(join(prefix, 'package-lock.json')));
      await assert.rejects(preparePrefix({ agent, profile, dir: prefix, cache, registry: 'https://registry.example.invalid' }), { code: 'EEXIST' });

      const writePackage = async (name, data) => {
        const directory = join(prefix, 'node_modules', name);
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, 'package.json'), JSON.stringify({ name, type: 'module', ...data }));
        return directory;
      };
      const adapterDir = await writePackage(pin.adapter, { version: pin.version });
      await writePackage(pin.dependency, { version: pin.dependencyVersion, optionalDependencies: { [native.name]: native.version } });
      await mkdir(join(adapterDir, 'dist'));
      const override = agent === 'claude' ? 'CLAUDE_CODE_EXECUTABLE' : 'CODEX_PATH';
      const otherOverride = agent === 'claude' ? 'CODEX_PATH' : 'CLAUDE_CODE_EXECUTABLE';
      await writeFile(join(adapterDir, 'dist/index.js'), `import assert from 'node:assert/strict';\nassert.equal(process.env.${override}, ${JSON.stringify(profile === 'installed' ? process.execPath : '')});\nassert.equal(process.env.${otherOverride}, '');\nprocess.env.FAKE_OUTSIDE_FILE = ${JSON.stringify(outsideFile)};\nawait import(${JSON.stringify(pathToFileURL(join(here, 'lib/fake-agent.mjs')).href)});\n`);
      if (profile === 'bundled') {
        const nativeDir = await writePackage(native.name, { version: agent === 'claude' ? '0.3.293' : `0.159.3-${process.platform}-${process.arch}` });
        const host = environment();
        const target = `${host.arch === 'arm64' ? 'aarch64' : 'x86_64'}-${{ darwin: 'apple-darwin', linux: 'unknown-linux-musl', win32: 'pc-windows-msvc' }[host.os]}`;
        const binary = agent === 'claude' ? join(nativeDir, 'claude') : join(nativeDir, 'vendor', target, 'bin/codex');
        await mkdir(dirname(binary), { recursive: true });
        await writeFile(binary, `#!${process.execPath}\nsetTimeout(() => console.log('fake-${agent}-bundled'), process.env.FAKE_SLOW_VERSION ? 5200 : 0);\n`);
        await chmod(binary, 0o755);
      }
      const options = { adapterPrefix: prefix, ...(profile === 'installed' ? { executable: process.execPath } : {}) };
      const resolved = await resolveAgent(agent, options);
      assert.equal(resolved.spec.command, process.execPath);
      assert.equal(resolved.spec.args[0], join(await realpath(adapterDir), 'dist/index.js'));
      assert.equal(resolved.spec.env[override], profile === 'installed' ? process.execPath : '');
      assert.equal(resolved.metadata.agentSource, profile);
      assert.equal(resolved.metadata.nativePackages.present, profile === 'bundled');
      assert.equal(resolved.metadata.nativePackages.packages.length, profile === 'bundled' ? 1 : 0);
      assert.equal(resolved.metadata.adapter.version, pin.version);
      assert.equal(resolved.metadata.sdkOrLauncher.version, pin.dependencyVersion);
      assert.equal(resolved.metadata.executable.version, profile === 'installed' ? process.version : `fake-${agent}-bundled`);
      assert.equal(resolved.metadata.executable.versionTimeoutMs, 60_000);
      assert.ok(resolved.metadata.executable.versionWallTimeMs >= 0);
      assert.equal(resolved.metadata.lock.digest, prepared.lock.digest);
      const result = await runProbe({ agent, scenarios: ['basic'], root, ...options });
      assert.equal(result.scenarios[0].status, 'pass');
      const saved = JSON.parse(await readFile(join(result.runDir, 'summary.json'), 'utf8'));
      const { versionWallTimeMs: savedTime, ...savedExecutable } = saved.runtime.executable;
      const { versionWallTimeMs: resolvedTime, ...expectedExecutable } = resolved.metadata.executable;
      assert.ok(savedTime >= 0 && resolvedTime >= 0);
      assert.deepEqual(savedExecutable, expectedExecutable);
      assert.deepEqual({ ...saved.runtime, executable: null }, { ...resolved.metadata, executable: null });
      assert.equal(saved.runtime.environment.node, process.version);
      assert.equal(saved.runtime.environment.os, process.platform);
    }
  }
  const prefix = join(root, 'codex-installed');
  const { stdout: cliOutput } = await execute(process.execPath, [join(here, 'probe.mjs'), '--agent', 'codex', '--adapter-prefix', prefix, '--executable', process.execPath, '--scenario', 'permission', '--permission-mode', 'ask'], { env: { ...process.env, CODEX_PATH: '/must-not-run', CLAUDE_CODE_EXECUTABLE: '/must-not-run', FAKE_MODE: 'ask_required', PROBE_MODE: 'default' } });
  const cliSummaryPath = cliOutput.match(/Summary: (.+)/)[1];
  const cliSummary = JSON.parse(await readFile(cliSummaryPath, 'utf8'));
  assert.equal(cliSummary.runtime.agentSource, 'installed');
  assert.equal(cliSummary.permissionMode, 'ask');
  assert.equal(cliSummary.scenarios[0].status, 'pass');
  await rm(dirname(cliSummaryPath), { recursive: true });
  const { stdout: slowOutput } = await execute(process.execPath, [join(here, 'probe.mjs'), '--agent', 'codex', '--adapter-prefix', join(root, 'codex-bundled'), '--scenario', 'basic', '--permission-mode', 'default'], { env: { ...process.env, FAKE_SLOW_VERSION: '1' } });
  const slowSummaryPath = slowOutput.match(/Summary: (.+)/)[1];
  const slowSummary = JSON.parse(await readFile(slowSummaryPath, 'utf8'));
  assert.equal(slowSummary.scenarios[0].status, 'pass');
  assert.equal(slowSummary.permissionMode, 'default');
  assert.equal(slowSummary.runtime.executable.versionTimeoutMs, 60_000);
  assert.ok(slowSummary.runtime.executable.versionWallTimeMs >= 5000 && slowSummary.runtime.executable.versionWallTimeMs < 60_000);
  await rm(dirname(slowSummaryPath), { recursive: true });
  console.log('PASS: first-launch version exceeds five seconds, succeeds within sixty, and records wall time');
  const previousOverride = process.env.CODEX_PATH;
  try {
    process.env.CODEX_PATH = '/must-not-run';
    assert.equal((await resolveAgent('codex', { adapterPrefix: join(root, 'codex-bundled') })).spec.env.CODEX_PATH, '');
  } finally {
    if (previousOverride === undefined) delete process.env.CODEX_PATH;
    else process.env.CODEX_PATH = previousOverride;
  }
  const missingExecutable = await runProbe({ agent: 'codex', adapterPrefix: prefix, executable: join(root, 'missing-cli'), scenarios: ['basic'], root });
  assert.equal(missingExecutable.scenarios[0].status, 'error');
  assert.equal(missingExecutable.runtime.agentSource, 'installed');
  assert.equal(missingExecutable.runtime.executable.path, join(root, 'missing-cli'));
  assert.equal(missingExecutable.runtime.executable.version, null);
  assert.equal(missingExecutable.runtime.nativePackages.present, false);
  const missingPrefix = join(root, 'empty-prefix');
  await mkdir(missingPrefix);
  await assert.rejects(resolveAgent('claude', { adapterPrefix: missingPrefix, executable: process.execPath }), /Missing .*adapter prefix/);
  await mkdir(join(missingPrefix, 'node_modules/@agentclientprotocol'), { recursive: true });
  await symlink(join(prefix, 'node_modules/@agentclientprotocol/codex-acp'), join(missingPrefix, 'node_modules/@agentclientprotocol/codex-acp'));
  await assert.rejects(resolveAgent('codex', { adapterPrefix: missingPrefix, executable: process.execPath }), /outside adapter prefix/);
  await assert.rejects(resolveAgent('grok', { adapterPrefix: prefix }), /only supported for Claude and Codex/);
  await assert.rejects(resolveAgent('antigravity', { adapterPrefix: prefix }), /only supported for Claude and Codex/);
  const agy = join(root, 'agy');
  await writeFile(agy, `#!${process.execPath}\nimport assert from 'node:assert/strict';\nif (process.argv[2] === '--version') console.log('agy fake 1.0');\nelse { assert.deepEqual(process.argv.slice(2), ['acp']); await import(${JSON.stringify(pathToFileURL(join(here, 'lib/fake-agent.mjs')).href)}); }\n`);
  await chmod(agy, 0o755);
  const previousPath = process.env.PATH;
  const previousOutside = process.env.FAKE_OUTSIDE_FILE;
  const previousMode = process.env.FAKE_MODE;
  try {
    process.env.PATH = `${root}:${previousPath}`;
    process.env.FAKE_OUTSIDE_FILE = outsideFile;
    process.env.FAKE_MODE = 'both_resume';
    const resolvedAgy = await resolveAgent('antigravity');
    assert.equal(resolvedAgy.spec.command, agy);
    assert.deepEqual(resolvedAgy.spec.args, ['acp']);
    assert.equal(resolvedAgy.metadata.executable.version, 'agy fake 1.0');
    assert.equal((await resolveAgent('antigravity', { executable: relative(process.cwd(), agy) })).spec.command, agy);
    await assert.rejects(resolveAgent('antigravity', { executable: join(root, 'missing-agy') }), { code: 'ENOENT' });
    const agyRun = await runProbe({ agent: 'antigravity', scenarios: SCENARIOS, root, timeoutSec: 10, cancelAfterMs: 100 });
    assert.deepEqual(agyRun.scenarios.map(({ status }) => status), SCENARIOS.map(() => 'pass'));
    assert.deepEqual(agyRun.scenarios[4].facts.replayedUpdates, { loadSession: 1, resumeSession: 1 });
    for (const scenario of agyRun.scenarios) for (const connection of scenario.connections) { assert.ok(connection.cleanup); assertDead(connection); }
    process.env.FAKE_MODE = 'no_replay';
    const noReplay = (await runProbe({ agent: 'antigravity', scenarios: ['resume'], root, timeoutSec: 10 })).scenarios[0];
    assert.equal(noReplay.facts.replayedUpdates.loadSession, 0);
    await assert.rejects(execute(process.execPath, [join(here, 'probe.mjs'), '--agent', 'antigravity', '--adapter-prefix', prefix, '--scenario', 'basic']), /only supported for Claude and Codex/);
    await assert.rejects(execute(process.execPath, [join(here, 'probe.mjs'), '--agent', 'antigravity', '--executable']), /Missing value/);
    process.env.FAKE_MODE = 'agy_auth';
    const agyAuth = (await runProbe({ agent: 'antigravity', executable: agy, scenarios: ['basic'], root })).scenarios[0];
    assert.equal(agyAuth.status, 'error');
    assert.equal(agyAuth.error.code, -32000);
    assert.match(agyAuth.error.message, /Authentication required/);
    assert.equal(agyAuth.authMethods[0][0].id, 'test-login');
    assertDead(agyAuth.connections[0]);
  } finally {
    process.env.PATH = previousPath;
    if (previousOutside === undefined) delete process.env.FAKE_OUTSIDE_FILE; else process.env.FAKE_OUTSIDE_FILE = previousOutside;
    if (previousMode === undefined) delete process.env.FAKE_MODE; else process.env.FAKE_MODE = previousMode;
  }
  console.log('PASS: Antigravity native launch, resolution, all scenarios, both replay counts, auth failure and cleanup');
  for (const options of [
    { agent: 'grok', profile: 'installed' }, { agent: 'codex', profile: 'other' },
    { agent: 'codex', profile: 'installed', dir: join(root, 'bad-prefix'), cache: join(root, 'bad-prefix/cache'), registry: 'https://registry.example.invalid' },
    { agent: 'codex', profile: 'installed', dir: join(root, 'bad-prefix'), cache: join(root, 'cache'), registry: 'https://user:secret@registry.example.invalid' },
  ]) await assert.rejects(preparePrefix(options));
  await assert.rejects(preparePrefix({ agent: 'codex', profile: 'installed', dir: join(root, 'failed-install'), cache: join(root, 'cache'), registry: 'https://registry.example.invalid' }, async () => { throw new Error('fake npm failure'); }), /fake npm failure/);
  await assert.rejects(readFile(join(root, 'failed-install/package-lock.sha256')), { code: 'ENOENT' });
  assert.match(nativePackage('claude', { os: 'linux', arch: 'x64', libc: 'musl' }).name, /linux-x64-musl$/);
  assert.match(nativePackage('claude', { os: 'linux', arch: 'arm64', libc: 'glibc-2.39' }).name, /linux-arm64$/);
  assert.equal(nativePackage('codex', { os: 'linux', arch: 'arm64', libc: 'glibc-2.39' }).version, 'npm:@openai/codex@0.159.3-linux-arm64');
  assert.throws(() => nativePackage('claude', { os: 'linux', arch: 'x64', libc: 'unknown' }), /unknown Linux libc/);
  assert.throws(() => nativePackage('codex', { os: 'freebsd', arch: 'x64' }), /Unsupported/);
  console.log('PASS: pinned preparation (fake npm), both agents/profiles, overrides, bundled identities, native absence/presence, prefix isolation, lock digests, CLI options; no real compatibility claimed');

  const summary = await run(SCENARIOS);
  assert.deepEqual(summary.scenarios.map((result) => [result.scenario, result.status]), SCENARIOS.map((scenario) => [scenario, 'pass']));
  const [basic, commands, permission, cancel, resume] = summary.scenarios;
  assert.equal(basic.connections[0].initialization.agentInfo.name, 'fake-acp-agent');
  assert.equal(basic.connections[0].updateCounts.agent_message_chunk, 2);
  assert.equal(basic.connections[0].firstUpdates.agent_message_chunk.update.content.text, 'This fixture contains ');
  assert.equal(basic.facts.prompt.reply, 'This fixture contains a tiny JavaScript add function.');
  assert.equal(basic.facts.prompt.stopReason, 'end_turn');
  assert.equal(basic.connections[0].sessions[basic.facts.prompt.sessionId].response.models.currentModelId, 'fake-model');
  assert.ok(basic.facts.prompt.wallTimeMs >= 0);
  assert.deepEqual(commands.facts.commands, { received: true, names: ['probe-skill'] });
  assert.deepEqual(commands.facts.worked, ['/probe-skill']);
  assert.equal(permission.facts.allow.fileExists, true);
  assert.equal(permission.facts.reject.fileExists, false);
  assert.notEqual(permission.facts.allow.sessionId, permission.facts.reject.sessionId);
  assert.equal(permission.facts.allow.requests[0].response.outcome.optionId, 'allow-once-id');
  assert.equal(permission.facts.reject.requests[0].response.outcome.optionId, 'reject-once-id');
  assert.equal(permission.facts.allow.requests[0].request.toolCall.kind, 'execute');
  assert.equal(cancel.facts.prompt.stopReason, 'cancelled');
  assert.ok(cancel.facts.cancelSent);
  assert.ok(cancel.facts.cancelLatencyMs >= 0 && cancel.facts.cancelLatencyMs < 2000);
  assert.equal(cancel.connections[0].updateCounts.tool_call_update, 1);
  assert.equal(resume.facts.heronReturned, true);
  assert.equal(resume.facts.listedOriginalSession, true);
  assert.equal(resume.facts.recall.reply, 'HERON');
  assert.equal(resume.facts.recall.sessionId, resume.facts.originalSessionId);
  assert.equal(resume.connections.length, 2);
  assert.notEqual(resume.connections[0].pid, resume.connections[1].pid);
  assert.equal(await readFile(join(summary.fixture.path, 'nested/client-write.txt'), 'utf8'), 'client-write-ok\n');
  assert.equal(await readFile(outsideFile, 'utf8'), 'outside-original');
  const { stdout: commits } = await execute('git', ['rev-list', '--count', 'HEAD'], { cwd: summary.fixture.path });
  assert.equal(commits.trim(), '1');
  const { stdout: tracked } = await execute('git', ['ls-files'], { cwd: summary.fixture.path });
  assert.deepEqual(tracked.trim().split('\n'), ['.agents/skills/probe-skill/SKILL.md', '.claude/skills/probe-skill/SKILL.md', 'README.md', 'src/add.js']);
  const saved = JSON.parse(await readFile(join(summary.runDir, 'summary.json'), 'utf8'));
  assert.equal(saved.scenarios.length, 5);
  for (const result of summary.scenarios) {
    const events = (await readFile(result.eventFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(events[0].event, 'scenario_start');
    assert.equal(events.at(-1).event, 'scenario_result');
    assert.equal(events.filter((event) => event.event === 'session_update').length,
      result.connections.reduce((count, connection) => count + Object.values(connection.updateCounts).reduce((total, amount) => total + amount, 0), 0));
    for (const connection of result.connections) {
      assert.match(await readFile(connection.stderrFile, 'utf8'), /fake ACP ready/);
      assertDead(connection);
    }
  }
  console.log('PASS: basic, commands, allow/reject permission, cancel, cross-process loadSession; SDK callbacks, fixture, JSONL, summary, stderr, cleanup');

  const fallback = (await run(['permission'], 'fallback_options')).scenarios[0];
  assert.equal(fallback.status, 'pass');
  assert.equal(fallback.facts.allow.requests[0].selectedOption.kind, 'allow_always');
  assert.equal(fallback.facts.reject.requests[0].selectedOption.kind, 'reject_always');
  const missing = (await run(['permission'], 'missing_reject')).scenarios[0];
  assert.equal(missing.status, 'fail');
  assert.equal(missing.facts.reject.requests[0].response.outcome.outcome, 'cancelled');
  assert.equal(missing.facts.reject.fileExists, false);
  const bypass = (await run(['permission'], 'ignore_reject')).scenarios[0];
  assert.equal(bypass.status, 'fail');
  assert.equal(bypass.facts.reject.fileExists, true);
  const noPermission = (await run(['permission'], 'no_permission')).scenarios[0];
  assert.equal(noPermission.status, 'fail');
  assert.equal(noPermission.facts.allow.requests.length, 0);
  assert.equal(noPermission.facts.reject.requests.length, 0);
  assert.deepEqual((await run(['commands'], 'dollar_only')).scenarios[0].facts.worked, ['$probe-skill']);
  assert.equal((await run(['resume'], 'no_resume')).scenarios[0].status, 'unsupported');
  const listOnly = (await run(['resume'], 'list_only')).scenarios[0];
  assert.equal(listOnly.status, 'unsupported');
  assert.equal(listOnly.facts.listedOriginalSession, true);
  const resumeMethod = (await run(['resume'], 'resume_method')).scenarios[0];
  assert.equal(resumeMethod.status, 'pass');
  assert.equal(resumeMethod.facts.method, 'resumeSession');
  const replayOnly = (await run(['resume'], 'resume_replay_only')).scenarios[0];
  assert.equal(replayOnly.status, 'fail');
  assert.equal(replayOnly.facts.heronReturned, false);
  console.log('PASS: permission fallbacks/missing options/bypass, Codex dollar fallback, unsupported/list-only/resumeSession, history replay isolation');

  const auth = (await run(['basic'], 'auth')).scenarios[0];
  assert.equal(auth.status, 'error');
  assert.match(auth.error.message, /auth_required/);
  assert.equal(auth.authMethods[0][0].id, 'test-login');
  assertDead(auth.connections[0]);
  const crash = (await run(['basic'], 'crash')).scenarios[0];
  assert.equal(crash.status, 'error');
  assert.equal(crash.connections[0].exit.code, 23);
  assertDead(crash.connections[0]);
  const timeout = (await run(['basic'], 'ignore_cancel', { timeoutSec: 0.5 })).scenarios[0];
  assert.equal(timeout.status, 'timeout');
  assert.equal(timeout.error.code, 'PROBE_TIMEOUT');
  const timeoutEvents = (await readFile(timeout.eventFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(timeoutEvents.some((event) => event.event === 'cancel_sent'));
  assertDead(timeout.connections[0]);
  const spawnFailure = await runProbe({ agent: 'grok', scenarios: ['basic'], root, spawnSpec: { command: join(root, 'does-not-exist') }, timeoutSec: 1 });
  assert.equal(spawnFailure.scenarios[0].status, 'error');
  assert.equal(spawnFailure.scenarios[0].error.code, 'ENOENT');
  console.log('PASS: auth errors without login, process crash, timeout cancellation/kill, spawn failure');
  const defaultCancel = (await run(['cancel'], 'normal', { cancelAfterMs: undefined, timeoutSec: 12 })).scenarios[0];
  assert.equal(defaultCancel.status, 'pass');
  assert.ok(defaultCancel.facts.prompt.wallTimeMs >= 7900 && defaultCancel.facts.prompt.wallTimeMs < 11000);
  assertDead(defaultCancel.connections[0]);
  console.log('PASS: production eight-second cancellation timer');
  console.log('All selftests passed. No real agents were run.');
} finally {
  await rm(root, { recursive: true, force: true });
}
