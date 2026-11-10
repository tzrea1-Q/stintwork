import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable, Writable } from 'node:stream';
import { appendFileSync, createWriteStream } from 'node:fs';
import { access, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { environment, inside, lockIdentity, nativePackage, packageInfo, PINS } from './lib/prefix.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const execute = promisify(execFile);
export const SCENARIOS = ['basic', 'commands', 'permission', 'cancel', 'resume'];
const permissionPrompt = 'Run the shell command `touch PERMISSION_PROBE.txt` in the repository root, then say DONE.';

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const errorInfo = (error) => ({
  name: error.name,
  message: error.message,
  ...(error.code === undefined ? {} : { code: error.code }),
  ...(error.data === undefined ? {} : { data: error.data }),
});

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function fixturePath(fixture, path) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('ACP file path must be absolute');
  const inside = (candidate) => {
    const offset = relative(fixture, candidate);
    return offset === '' || (!isAbsolute(offset) && offset !== '..' && !offset.startsWith(`..${sep}`));
  };
  const target = resolve(path);
  if (!inside(target)) throw new Error('ACP file path is outside the fixture');
  let ancestor = target;
  while (true) {
    try {
      if (!inside(await realpath(ancestor))) throw new Error('ACP file symlink escapes the fixture');
      return target;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      ancestor = dirname(ancestor);
    }
  }
}

async function createFixture(runDir) {
  const fixture = join(runDir, 'fixture');
  await mkdir(join(fixture, 'src'), { recursive: true });
  await writeFile(join(fixture, 'README.md'), 'ACP probe fixture.\nThis repository contains a tiny JavaScript add function.\n');
  await writeFile(join(fixture, 'src/add.js'), 'export function add(left, right) { return left + right; }\n');
  const skill = '---\nname: probe-skill\ndescription: Test skill for the ACP probe; invoke it to verify skill discovery.\n---\n\nWhen invoked, reply with exactly PROBE-SKILL-OK and nothing else.\n';
  for (const directory of ['.claude', '.agents']) {
    const skillDir = join(fixture, directory, 'skills/probe-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), skill);
  }
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  const git = (...args) => execute('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: fixture, env });
  await git('init', '--quiet');
  await git('add', '--force', 'README.md', 'src/add.js', '.claude/skills/probe-skill/SKILL.md', '.agents/skills/probe-skill/SKILL.md');
  await git('-c', 'user.name=ACP Probe', '-c', 'user.email=acp-probe@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Create throwaway ACP probe fixture');
  return { path: await realpath(fixture), commit: (await git('rev-parse', 'HEAD')).stdout.trim() };
}

export async function resolveAgent(agent, { adapterPrefix, executable } = {}, metadata = {}) {
  Object.assign(metadata, { agentSource: null, adapterPrefix: adapterPrefix ? resolve(adapterPrefix) : null, environment: environment() });
  if (adapterPrefix && ['grok', 'antigravity'].includes(agent)) throw new Error('Adapter prefix is only supported for Claude and Codex');
  if (agent === 'grok' && executable) throw new Error('Prefix/executable options are only supported for Claude and Codex');
  const prefix = adapterPrefix ? await realpath(resolve(adapterPrefix)) : undefined;
  metadata.adapterPrefix = prefix ?? null;
  const env = { CLAUDE_CODE_EXECUTABLE: '', CODEX_PATH: '' };
  let spec;
  if (agent === 'grok' || agent === 'antigravity') {
    const binary = agent === 'grok' ? 'grok' : 'agy';
    if (executable) executable = resolve(executable);
    for (const directory of (process.env.PATH ?? '').split(delimiter)) {
      if (executable) break;
      const path = resolve(directory, binary);
      try { await access(path, constants.X_OK); executable = path; break; } catch (error) {
        if (!['ENOENT', 'EACCES'].includes(error.code)) throw error;
      }
    }
    if (!executable) throw new Error(`${binary} not found on PATH`);
    spec = { command: executable, args: agent === 'grok' ? ['agent', 'stdio'] : ['acp'] };
  } else {
    const pin = PINS[agent];
    const adapter = await packageInfo(pin.adapter, join(prefix ?? here, 'package.json'), prefix);
    if (!adapter) throw new Error(`Missing ${pin.adapter} in adapter prefix`);
    const dependency = await packageInfo(pin.dependency, adapter.path, prefix);
    if (!dependency) throw new Error(`Missing ${pin.dependency} in adapter prefix`);
    const entry = await realpath(join(dirname(adapter.path), 'dist/index.js'));
    if (prefix && !inside(prefix, entry)) throw new Error('Adapter entry escapes prefix');
    metadata.adapter = { name: adapter.name, version: adapter.version, entry };
    metadata.sdkOrLauncher = { name: dependency.name, version: dependency.version, path: dependency.path, bundledCliVersion: dependency.data.claudeCodeVersion ?? null };
    const packages = [];
    for (const name of Object.keys(dependency.data.optionalDependencies ?? {})) {
      const native = await packageInfo(name, dependency.path, prefix);
      if (native) packages.push({ name, packageName: native.data.name, version: native.version, path: native.path });
    }
    metadata.nativePackages = { present: packages.length > 0, packages };
    metadata.lock = await lockIdentity(join(prefix ?? here, prefix ? 'package-lock.json' : 'pnpm-lock.yaml'));
    if (!executable && !prefix) {
      executable = agent === 'codex' ? process.env.CODEX_PATH : process.env.CLAUDE_CODE_EXECUTABLE;
      if (!executable && agent === 'claude') {
        const { stdout } = await execute('/bin/zsh', ['-lc', 'command -v claude'], { timeout: 5000 });
        executable = stdout.trim().split('\n').at(-1);
      }
    }
    metadata.agentSource = executable ? 'installed' : 'bundled';
    if (executable) {
      executable = resolve(executable);
      env[agent === 'claude' ? 'CLAUDE_CODE_EXECUTABLE' : 'CODEX_PATH'] = executable;
    } else {
      const native = await packageInfo(nativePackage(agent).name, dependency.path, prefix);
      if (!native) throw new Error(`Missing bundled native package for ${agent}`);
      if (agent === 'claude') executable = join(dirname(native.path), process.platform === 'win32' ? 'claude.exe' : 'claude');
      else {
        const target = `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-${{ darwin: 'apple-darwin', linux: 'unknown-linux-musl', win32: 'pc-windows-msvc' }[process.platform]}`;
        executable = join(dirname(native.path), 'vendor', target, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
      }
    }
    spec = { command: process.execPath, args: [entry], env };
  }
  metadata.agentSource ??= 'installed';
  metadata.executable = { path: executable, version: null, versionTimeoutMs: 60_000 };
  await access(executable, constants.X_OK);
  metadata.executable.realPath = await realpath(executable);
  if (prefix && metadata.agentSource === 'bundled' && !inside(prefix, metadata.executable.realPath)) throw new Error('Bundled executable escapes prefix');
  const started = performance.now();
  try {
    const version = await execute(executable, ['--version'], { env: { ...process.env, ...env }, timeout: metadata.executable.versionTimeoutMs, maxBuffer: 64 * 1024 });
    Object.assign(metadata.executable, { version: version.stdout.trim(), versionStderr: version.stderr.trim() });
  } finally {
    metadata.executable.versionWallTimeMs = performance.now() - started;
  }
  return { spec, metadata };
}

function makeConnection(context, spec, label) {
  if (context.ended) throw new Error('Scenario has already ended');
  const { log, fixture, result } = context;
  const stderrPath = join(context.runDir, `${context.scenario}-${label}.stderr.log`);
  const stderr = createWriteStream(stderrPath);
  const child = spawn(spec.command, spec.args ?? [], {
    cwd: fixture,
    env: { ...process.env, ...spec.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  const state = {
    label, pid: child.pid, stderrFile: stderrPath,
    initialization: null, sessions: Object.create(null), updateCounts: Object.create(null), firstUpdates: Object.create(null), permissions: [], rawResponses: [],
  };
  result.connections.push(state);
  log('process_spawn', { label, command: spec.command, args: spec.args ?? [], pid: child.pid, stderrFile: stderrPath });
  child.stderr.pipe(stderr);
  let stopping = false;
  let permissionPolicy = 'allow';
  const cancelledSessions = new Set();
  const pendingSessions = new Set();
  const commandWaiters = new Map();
  let rejectFailure;
  const failure = new Promise((unused, reject) => { rejectFailure = reject; });
  failure.catch(() => {});
  const fail = (error) => {
    if (!stopping) {
      log('connection_error', { label, error: errorInfo(error) });
      rejectFailure(error);
    }
  };
  child.on('error', fail);
  child.stdin.on('error', fail);
  child.stdout.on('error', fail);
  stderr.on('error', fail);
  child.on('exit', (code, signal) => {
    state.exit = { code, signal };
    log('process_exit', { label, code, signal, stopping });
    fail(new Error(`Agent process exited (code=${code}, signal=${signal})`));
  });
  const sessionState = (sessionId) => state.sessions[sessionId] ??= {
    sessionId, updates: [], validatedUpdates: [], commands: [], commandsReceived: false,
  };
  const guard = (operation) => context.ended
    ? Promise.reject(new Error('Scenario has already ended'))
    : Promise.race([operation(), failure]);
  const transport = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout));
  const requests = new Map();
  const outgoing = new TransformStream({ transform(message, controller) {
    log('wire_out', { label, message });
    if (message.method && message.id !== undefined) requests.set(message.id, message.method);
    controller.enqueue(message);
  } });
  outgoing.readable.pipeTo(transport.writable).catch(fail);
  const incoming = transport.readable.pipeThrough(new TransformStream({ transform(message, controller) {
    log('wire_in', { label, message });
    if (message.id !== undefined && requests.has(message.id)) {
      state.rawResponses.push({ method: requests.get(message.id), message });
      requests.delete(message.id);
    }
    const notification = message.params;
    if (message.method === 'session/update' && typeof notification?.sessionId === 'string' && typeof notification.update?.sessionUpdate === 'string') {
      const { sessionId, update } = notification;
      const type = update.sessionUpdate;
      const session = sessionState(sessionId);
      session.updates.push(update);
      state.updateCounts[type] = (state.updateCounts[type] ?? 0) + 1;
      state.firstUpdates[type] ??= notification;
      if (type === 'available_commands_update' && Array.isArray(update.availableCommands)) {
        session.commandsReceived = true;
        session.commands = update.availableCommands.map((command) => command.name);
        commandWaiters.get(sessionId)?.();
      }
      log('session_update', { label, type, notification });
    }
    controller.enqueue(message);
  } }));
  const connection = new ClientSideConnection(() => ({
    async requestPermission(request) {
      const desired = `${permissionPolicy}_once`;
      const option = request.options.find((item) => item.kind === desired)
        ?? request.options.find((item) => item.kind.startsWith(`${permissionPolicy}_`));
      const response = cancelledSessions.has(request.sessionId) || !option
        ? { outcome: { outcome: 'cancelled' } }
        : { outcome: { outcome: 'selected', optionId: option.optionId } };
      const observation = { request, policy: permissionPolicy, selectedOption: option ?? null, response };
      state.permissions.push(observation);
      log('permission_request', { label, ...observation });
      return response;
    },
    sessionUpdate(notification) {
      sessionState(notification.sessionId).validatedUpdates.push(notification.update);
    },
    async readTextFile(request) {
      log('read_text_file', { label, request });
      const path = await fixturePath(fixture, request.path);
      if (request.line != null && (!Number.isInteger(request.line) || request.line < 1)) throw new Error('line must be a positive integer');
      if (request.limit != null && (!Number.isInteger(request.limit) || request.limit < 0)) throw new Error('limit must be a non-negative integer');
      const content = await readFile(path, 'utf8');
      if (request.line == null && request.limit == null) return { content };
      const start = (request.line ?? 1) - 1;
      const lines = content.match(/[^\n]*\n|[^\n]+$/g) ?? [];
      return { content: lines.slice(start, request.limit == null ? undefined : start + request.limit).join('') };
    },
    async writeTextFile(request) {
      log('write_text_file', { label, request });
      const path = await fixturePath(fixture, request.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, request.content, 'utf8');
      return {};
    },
  }), { writable: outgoing.writable, readable: incoming });
  connection.closed.then(() => fail(new Error('ACP transport closed unexpectedly')), fail);

  async function cancel(sessionId, reason) {
    cancelledSessions.add(sessionId);
    log('cancel_sent', { label, sessionId, reason });
    await connection.cancel({ sessionId });
  }

  const signalProcess = (signal) => {
    if (!child.pid) return;
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') log('cleanup_error', { label, error: errorInfo(error) });
    }
  };

  let stopPromise;
  function stop(reason) {
    return stopPromise ??= (async () => {
      stopping = true;
      for (const sessionId of pendingSessions) {
        await Promise.race([cancel(sessionId, reason).catch(() => {}), delay(100)]);
      }
      rejectFailure(new Error(`Agent stopped: ${reason}`));
      signalProcess('SIGTERM');
      await delay(300);
      signalProcess('SIGKILL');
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
      await new Promise((resolveEnd) => stderr.end(resolveEnd));
      state.cleanup = { reason, signals: ['SIGTERM', 'SIGKILL'], exit: state.exit ?? null };
      log('process_cleanup', { label, ...state.cleanup });
    })();
  }

  const client = {
    state, stop, cancel,
    setPermissionPolicy(policy) { permissionPolicy = policy; },
    async initialize() {
      const request = {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
        clientInfo: { name: 'acp-probe', version: '1.0.0' },
      };
      log('initialize_request', { label, request });
      state.initialization = await guard(() => connection.initialize(request));
      log('initialize_response', { label, response: state.initialization });
      return state.initialization;
    },
    async newSession() {
      const request = { cwd: fixture, mcpServers: [] };
      log('new_session_request', { label, request });
      const response = await guard(() => connection.newSession(request));
      const rawResponse = state.rawResponses.findLast((item) => item.method === 'session/new')?.message.result ?? response;
      sessionState(response.sessionId).response = rawResponse;
      log('new_session_response', { label, response: rawResponse });
      const isPermission = context.scenario === 'permission';
      const permissionLevel = isPermission && context.permissionMode === 'ask' ? 'ask' : null;
      const availableModes = rawResponse.modes?.availableModes ?? [];
      let modeId = isPermission ? null : process.env.PROBE_MODE ?? null;
      if (permissionLevel) {
        const { tsImport } = await import('tsx/esm/api');
        const { permissionPolicy } = await tsImport('../../packages/core/src/permission-levels.ts', import.meta.url);
        modeId = permissionPolicy({
          id: context.agent, displayName: context.agent,
          capabilities: { modes: availableModes.map(({ id }) => id), defaultMode: null },
        }, permissionLevel).mode;
      }
      const selection = {
        sessionId: response.sessionId, permissionLevel,
        advertisedDefaultMode: rawResponse.modes?.currentModeId ?? null,
        requestedMode: modeId, chosenMode: rawResponse.modes?.currentModeId ?? null,
      };
      if (isPermission) (result.facts.sessionModes ??= []).push(selection);
      if (modeId && !availableModes.some((mode) => mode.id === modeId) && permissionLevel) {
        selection.chosenMode = null;
        throw new Error(`${context.agent} does not offer the required ${modeId} mode for Stintwork Ask`);
      }
      if (modeId && availableModes.some((mode) => mode.id === modeId)) {
        selection.chosenMode = null;
        await guard(() => connection.setSessionMode({ sessionId: response.sessionId, modeId }));
        selection.chosenMode = modeId;
        log('set_session_mode', { label, modeId, permissionLevel, sessionId: response.sessionId });
      }
      return response.sessionId;
    },
    async restore(sessionId, method) {
      const request = { sessionId, cwd: fixture, mcpServers: [] };
      log('restore_request', { label, method, request });
      const session = sessionState(sessionId);
      const offset = session.updates.length;
      try {
        const response = await guard(() => connection[method](request));
        session.response = response;
        return response;
      } finally {
        const updateTypes = {};
        for (const update of session.updates.slice(offset)) updateTypes[update.sessionUpdate] = (updateTypes[update.sessionUpdate] ?? 0) + 1;
        const replayedUpdates = ['user_message_chunk', 'agent_message_chunk', 'tool_call', 'tool_call_update']
          .reduce((count, type) => count + (updateTypes[type] ?? 0), 0);
        result.facts.replayedUpdates[method] = replayedUpdates;
        result.facts.restoreUpdateTypes[method] = updateTypes;
        log('restore_updates', { label, method, sessionId, replayedUpdates, updateTypes });
      }
    },
    async listSessions() {
      const pages = [];
      let cursor;
      const seen = new Set();
      do {
        const response = await guard(() => connection.listSessions({ cwd: fixture, ...(cursor ? { cursor } : {}) }));
        pages.push(response);
        log('list_sessions_response', { label, response });
        cursor = response.nextCursor;
        if (cursor && seen.has(cursor)) throw new Error('Agent repeated a session-list cursor');
        seen.add(cursor);
      } while (cursor);
      return pages;
    },
    async waitForCommands(sessionId, milliseconds = 5000) {
      const session = sessionState(sessionId);
      if (!session.commandsReceived) {
        let timer;
        try {
          await guard(() => new Promise((resolveWait) => {
            commandWaiters.set(sessionId, resolveWait);
            timer = setTimeout(resolveWait, milliseconds);
          }));
        } finally {
          clearTimeout(timer);
          commandWaiters.delete(sessionId);
        }
      }
      return { received: session.commandsReceived, names: [...session.commands] };
    },
    async prompt(sessionId, text) {
      const session = sessionState(sessionId);
      const offset = session.validatedUpdates.length;
      const started = performance.now();
      pendingSessions.add(sessionId);
      cancelledSessions.delete(sessionId);
      log('prompt_request', { label, sessionId, text });
      try {
        const response = await guard(() => connection.prompt({ sessionId, prompt: [{ type: 'text', text }] }));
        const reply = session.validatedUpdates.slice(offset)
          .filter((update) => update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text')
          .map((update) => update.content.text).join('');
        const observation = { sessionId, text, reply, stopReason: response.stopReason, wallTimeMs: performance.now() - started, response };
        log('prompt_response', { label, ...observation });
        return observation;
      } finally {
        pendingSessions.delete(sessionId);
      }
    },
  };
  context.clients.push(client);
  return client;
}

async function scenarioBody(context, spec, cancelAfterMs) {
  const { result, scenario, fixture } = context;
  const client = makeConnection(context, spec, 'a');
  const initialization = await client.initialize();
  const capabilities = initialization.agentCapabilities ?? {};
  if (scenario === 'resume' && !capabilities.loadSession && capabilities.sessionCapabilities?.resume == null && capabilities.sessionCapabilities?.list == null) {
    await client.stop('restart for resume capability check');
    const replacement = makeConnection(context, spec, 'b');
    await replacement.initialize();
    return { status: 'unsupported', facts: { reason: 'No loadSession, resume, or list capability advertised by the first process' } };
  }
  const sessionId = await client.newSession();
  if (scenario === 'basic') {
    const prompt = await client.prompt(sessionId, 'Read README.md and reply with one sentence summarizing it.');
    return { status: prompt.stopReason === 'end_turn' && prompt.reply.trim() ? 'pass' : 'fail', facts: { prompt } };
  }
  if (scenario === 'commands') {
    result.facts.commands = await client.waitForCommands(sessionId);
    result.facts.attempts = [];
    const first = await client.prompt(sessionId, '/probe-skill');
    result.facts.attempts.push({ invocation: '/probe-skill', ...first });
    if (!first.reply.includes('PROBE-SKILL-OK') && context.agent === 'codex') {
      const fallbackSessionId = await client.newSession();
      result.facts.fallbackCommands = await client.waitForCommands(fallbackSessionId);
      result.facts.attempts.push({ invocation: '$probe-skill', ...await client.prompt(fallbackSessionId, '$probe-skill') });
    }
    result.facts.worked = result.facts.attempts.filter((attempt) => attempt.reply.includes('PROBE-SKILL-OK')).map((attempt) => attempt.invocation);
    return { status: result.facts.worked.length ? 'pass' : 'fail' };
  }
  if (scenario === 'permission') {
    const file = join(fixture, 'PERMISSION_PROBE.txt');
    await rm(file, { force: true });
    result.facts.allow = { sessionId };
    client.setPermissionPolicy('allow');
    result.facts.allow.prompt = await client.prompt(sessionId, permissionPrompt);
    result.facts.allow.fileExists = await exists(file);
    result.facts.allow.requests = client.state.permissions.filter((item) => item.request.sessionId === sessionId);
    await rm(file, { force: true });
    const rejectSessionId = await client.newSession();
    result.facts.reject = { sessionId: rejectSessionId };
    client.setPermissionPolicy('reject');
    result.facts.reject.prompt = await client.prompt(rejectSessionId, permissionPrompt);
    result.facts.reject.fileExists = await exists(file);
    result.facts.reject.requests = client.state.permissions.filter((item) => item.request.sessionId === rejectSessionId);
    const allowWorked = result.facts.allow.fileExists && result.facts.allow.requests.some((item) => item.response.outcome.outcome === 'selected');
    const rejectWorked = !result.facts.reject.fileExists && result.facts.reject.requests.some((item) => item.response.outcome.outcome === 'selected');
    const arrived = result.facts.allow.requests.length > 0 && result.facts.reject.requests.length > 0;
    const status = result.facts.reject.fileExists ? 'fail' : !arrived ? 'unsupported' : allowWorked && rejectWorked ? 'pass' : 'fail';
    result.facts.reason = arrived ? `Checked allow/reject outcomes with permission-mode=${context.permissionMode}` : `No permission request in one or both sessions (permission-mode=${context.permissionMode}); rejection was not demonstrated`;
    return { status };
  }
  if (scenario === 'cancel') {
    let finished = false;
    let timer;
    let resolveCancelled;
    const cancelled = new Promise((resolveCancel) => { resolveCancelled = resolveCancel; });
    result.facts.cancelSent = false;
    const prompt = client.prompt(sessionId, 'Run the shell command `sleep 60` and then say FINISHED.');
    timer = setTimeout(() => {
      if (finished) return;
      result.facts.cancelSent = true;
      result.facts.cancelAtMs = performance.now();
      client.cancel(sessionId, 'cancel scenario').then(() => resolveCancelled(), (error) => resolveCancelled(error));
    }, cancelAfterMs);
    try {
      result.facts.prompt = await prompt;
      finished = true;
      result.facts.cancelLatencyMs = result.facts.cancelSent ? performance.now() - result.facts.cancelAtMs : null;
      if (result.facts.cancelSent) {
        const error = await cancelled;
        if (error) throw error;
      }
      return { status: result.facts.cancelSent && result.facts.prompt.stopReason === 'cancelled' ? 'pass' : 'fail' };
    } finally {
      finished = true;
      clearTimeout(timer);
    }
  }
  result.facts.remember = await client.prompt(sessionId, 'Remember the code word HERON. Reply OK.');
  result.facts.originalSessionId = sessionId;
  if (capabilities.loadSession && capabilities.sessionCapabilities?.resume != null) {
    result.facts.resumeSessionId = await client.newSession();
    result.facts.resumeRemember = await client.prompt(result.facts.resumeSessionId, 'Remember the code word HERON. Reply OK.');
  }
  await client.stop('restart for resume');
  const resumed = makeConnection(context, spec, 'b');
  const secondInitialization = await resumed.initialize();
  const secondCapabilities = secondInitialization.agentCapabilities ?? {};
  if (capabilities.sessionCapabilities?.list != null && secondCapabilities.sessionCapabilities?.list != null) {
    try {
      result.facts.listPages = await resumed.listSessions();
      result.facts.listedOriginalSession = result.facts.listPages.some((page) => page.sessions.some((session) => session.sessionId === sessionId));
    } catch (error) { result.facts.listError = errorInfo(error); }
  }
  const method = capabilities.loadSession && secondCapabilities.loadSession ? 'loadSession'
    : capabilities.sessionCapabilities?.resume != null && secondCapabilities.sessionCapabilities?.resume != null ? 'resumeSession' : null;
  if (!method) return { status: result.facts.listError ? 'fail' : 'unsupported', facts: { reason: 'Listing sessions does not imply an advertised load/resume method on both connections' } };
  result.facts.method = method;
  result.facts.replayedUpdates = {};
  result.facts.restoreUpdateTypes = {};
  result.facts.restoreAttempts = {};
  const methods = [method];
  if (method === 'loadSession' && capabilities.sessionCapabilities?.resume != null && secondCapabilities.sessionCapabilities?.resume != null) methods.push('resumeSession');
  for (const [index, currentMethod] of methods.entries()) {
    const attempt = result.facts.restoreAttempts[currentMethod] = {};
    attempt.sessionId = index ? result.facts.resumeSessionId : sessionId;
    try {
      let connection = resumed;
      if (index) {
        await resumed.stop('restart for session/resume');
        connection = makeConnection(context, spec, 'c');
        const initialization = await connection.initialize();
        if (initialization.agentCapabilities?.sessionCapabilities?.resume == null) throw new Error('session/resume capability disappeared on third connection');
      }
      attempt.response = await connection.restore(attempt.sessionId, currentMethod);
      attempt.recall = await connection.prompt(attempt.sessionId, 'What was the code word?');
      attempt.heronReturned = /\bHERON\b/.test(attempt.recall.reply);
    } catch (error) { attempt.error = errorInfo(error); }
  }
  result.facts.recall = result.facts.restoreAttempts[method].recall;
  result.facts.heronReturned = result.facts.restoreAttempts[method].heronReturned;
  if (methods.length > 1) {
    result.facts.resumeRecall = result.facts.restoreAttempts.resumeSession.recall;
    result.facts.resumeHeronReturned = result.facts.restoreAttempts.resumeSession.heronReturned;
  }
  return { status: !result.facts.listError && methods.every((name) => result.facts.restoreAttempts[name].heronReturned) ? 'pass' : 'fail' };
}

async function runScenario({ agent, scenario, fixture, runDir, timeoutSec, spawnSpec, launchError, cancelAfterMs, permissionMode }) {
  const started = performance.now();
  const eventFile = join(runDir, `${scenario}.jsonl`);
  await writeFile(eventFile, '');
  const log = (event, data = {}) => appendFileSync(eventFile, `${JSON.stringify({ timestamp: new Date().toISOString(), elapsedMs: performance.now() - started, event, ...data })}\n`);
  const result = { scenario, status: 'error', facts: {}, connections: [], eventFile };
  const context = { agent, scenario, fixture, runDir, log, result, clients: [], permissionMode };
  let timer;
  log('scenario_start', { agent, scenario, fixture, timeoutSec, permissionMode });
  try {
    if (launchError) throw launchError;
    const outcome = await Promise.race([
      scenarioBody(context, spawnSpec, cancelAfterMs),
      new Promise((unused, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`Scenario exceeded ${timeoutSec}s`);
          error.code = 'PROBE_TIMEOUT';
          reject(error);
        }, timeoutSec * 1000);
      }),
    ]);
    result.status = outcome.status;
    Object.assign(result.facts, outcome.facts);
  } catch (error) {
    result.status = error.code === 'PROBE_TIMEOUT' ? 'timeout' : 'error';
    result.error = errorInfo(error);
    result.authMethods = result.connections.map((item) => item.initialization?.authMethods ?? []);
    log('scenario_error', { status: result.status, error: result.error, authMethods: result.authMethods });
  } finally {
    context.ended = true;
    clearTimeout(timer);
    await Promise.all(context.clients.map((client) => client.stop(result.status)));
  }
  result.wallTimeMs = performance.now() - started;
  log('scenario_result', { result });
  return result;
}

export async function runProbe({ agent, scenarios = SCENARIOS, timeoutSec = 120, root = join(here, 'runs'), spawnSpec, adapterPrefix, executable, cancelAfterMs = 8000, permissionMode = 'ask', prepared }) {
  if (!['claude', 'codex', 'grok', 'antigravity'].includes(agent)) throw new Error('agent must be claude, codex, grok, or antigravity');
  if (agent === 'antigravity' && adapterPrefix) throw new Error('Adapter prefix is only supported for Claude and Codex');
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) throw new Error('timeout-sec must be a positive number');
  if (!scenarios.length || scenarios.some((scenario) => !SCENARIOS.includes(scenario))) throw new Error('Unknown scenario');
  if (!['ask', 'default'].includes(permissionMode)) throw new Error('permission-mode must be ask or default');
  await mkdir(root, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = resolve(root, `${timestamp}-${agent}`);
  await mkdir(runDir);
  const fixture = await createFixture(runDir);
  const summary = { agent, sdkVersion: '1.7.0', timestamp, runDir, fixture, timeoutSec, permissionMode, invocation: { adapterPrefix: adapterPrefix ? resolve(adapterPrefix) : null, executable: executable ? resolve(executable) : null }, scenarios: [] };
  let launchError;
  if (spawnSpec) summary.runtime = { testOverride: true, environment: environment() };
  else if (prepared) {
    summary.runtime = { ...prepared, environment: environment(), testOverride: false };
    spawnSpec = agent === 'claude' || agent === 'codex'
      ? { command: process.execPath, args: [prepared.adapterEntry], env: { CLAUDE_CODE_EXECUTABLE: agent === 'claude' ? prepared.executable.path : '', CODEX_PATH: agent === 'codex' ? prepared.executable.path : '' } }
      : { command: prepared.executable.path, args: agent === 'grok' ? ['agent', 'stdio'] : ['acp'] };
  }
  else {
    summary.runtime = {};
    try {
      const resolved = await resolveAgent(agent, { adapterPrefix, executable }, summary.runtime);
      spawnSpec = resolved.spec;
      summary.runtime = resolved.metadata;
    } catch (error) {
      launchError = error;
      summary.runtime.error = errorInfo(error);
    }
  }
  const summaryFile = join(runDir, 'summary.json');
  await writeFile(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);
  for (const scenario of scenarios) {
    summary.scenarios.push(await runScenario({ agent, scenario, fixture: fixture.path, runDir, timeoutSec, spawnSpec, launchError, cancelAfterMs, permissionMode }));
    await writeFile(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);
  }
  return summary;
}

function describe(result) {
  const facts = result.facts;
  const types = [...new Set(result.connections.flatMap((item) => Object.keys(item.updateCounts)))].join(', ') || 'none';
  if (result.error) return `${result.error.message}; updates=${types}`;
  if (result.scenario === 'basic') return `updates=${types}; stop=${facts.prompt.stopReason}; ${Math.round(facts.prompt.wallTimeMs)}ms`;
  if (result.scenario === 'commands') return `commands=${JSON.stringify(facts.commands.names)}; skill=${facts.worked.join(', ') || 'none'}`;
  if (result.scenario === 'permission') {
    const shapes = [...facts.allow.requests, ...facts.reject.requests].map(({ request }) => ({ title: request.toolCall.title, kind: request.toolCall.kind, options: request.options }));
    return `allow requests=${facts.allow.requests.length}, file=${facts.allow.fileExists}; reject requests=${facts.reject.requests.length}, file=${facts.reject.fileExists}; shape=${JSON.stringify(shapes)}; ${facts.reason}`;
  }
  if (result.scenario === 'cancel') return `cancel sent=${facts.cancelSent}; latency=${facts.cancelLatencyMs == null ? 'n/a' : `${Math.round(facts.cancelLatencyMs)}ms`}; stop=${facts.prompt.stopReason}`;
  return facts.reason ?? `method=${facts.method}; HERON=${facts.heronReturned}`;
}

function parseArgs(args) {
  const options = { scenario: 'all', timeoutSec: 120 };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (!['--agent', '--scenario', '--timeout-sec', '--adapter-prefix', '--executable', '--permission-mode'].includes(flag)) throw new Error(`Unknown argument: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--agent') options.agent = value;
    else if (flag === '--scenario') options.scenario = value;
    else if (flag === '--adapter-prefix') options.adapterPrefix = value;
    else if (flag === '--executable') options.executable = value;
    else if (flag === '--permission-mode') options.permissionMode = value;
    else options.timeoutSec = Number(value);
  }
  return { ...options, scenarios: options.scenario === 'all' ? SCENARIOS : [options.scenario] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node probe.mjs --agent <claude|codex|grok|antigravity> --scenario <basic|commands|permission|cancel|resume|all> [--timeout-sec N] [--adapter-prefix DIR] [--executable PATH] [--permission-mode ask|default]');
    } else {
      const summary = await runProbe(options);
      console.log(`\nAgent: ${summary.agent}\nFixture: ${summary.fixture.path}\n`);
      console.table(summary.scenarios.map((result) => ({ scenario: result.scenario, status: result.status, facts: describe(result) })));
      console.log(`Summary: ${join(summary.runDir, 'summary.json')}`);
      if (summary.scenarios.some((result) => ['fail', 'error', 'timeout'].includes(result.status))) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`ACP probe: ${error.message}`);
    process.exitCode = 1;
  }
}
