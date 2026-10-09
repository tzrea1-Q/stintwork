import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable, Writable } from 'node:stream';
import { readFile, writeFile, symlink } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION, RequestError } from '@agentclientprotocol/sdk';

const execute = promisify(execFile);
const mode = process.env.FAKE_MODE ?? 'normal';
const sessions = new Map();
const pending = new Map();
const options = [
  { optionId: 'allow-once-id', kind: 'allow_once', name: 'Allow once' },
  { optionId: 'reject-once-id', kind: 'reject_once', name: 'Reject once' },
  { optionId: 'allow-always-id', kind: 'allow_always', name: 'Always allow' },
  { optionId: 'reject-always-id', kind: 'reject_always', name: 'Always reject' },
];

new AgentSideConnection((client) => {
  const message = (sessionId, text) => client.sessionUpdate({
    sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
  });
  const restore = async ({ sessionId, cwd }) => {
    const stored = JSON.parse(await readFile(join(cwd, `.fake-session-${sessionId}.json`), 'utf8'));
    sessions.set(sessionId, stored);
    await message(sessionId, 'Historical reply: HERON');
    return {};
  };
  return {
    initialize(request) {
      assert.equal(request.protocolVersion, PROTOCOL_VERSION);
      assert.deepEqual(request.clientCapabilities.fs, { readTextFile: true, writeTextFile: true });
      assert.equal(request.clientCapabilities.terminal, false);
      const resumeCapabilities = mode === 'no_resume' ? {} : mode === 'list_only'
        ? { sessionCapabilities: { list: {} } } : mode === 'resume_method'
          ? { sessionCapabilities: { resume: {} } } : { loadSession: true, sessionCapabilities: { list: {} } };
      return {
        protocolVersion: PROTOCOL_VERSION,
        agentInfo: { name: 'fake-acp-agent', version: '1.0.0' },
        agentCapabilities: { ...resumeCapabilities },
        authMethods: [{ id: 'test-login', name: 'Fake login (never invoked)' }],
      };
    },
    async authenticate() {
      throw new Error('Harness must never call authenticate');
    },
    async newSession(request) {
      assert.ok(isAbsolute(request.cwd));
      assert.deepEqual(request.mcpServers, []);
      if (mode === 'auth') throw RequestError.authRequired({ detail: 'fake login is missing' }, 'auth_required: fake login is missing');
      const sessionId = randomUUID();
      sessions.set(sessionId, { cwd: request.cwd });
      await client.sessionUpdate({ sessionId, update: {
        sessionUpdate: 'available_commands_update',
        availableCommands: [{ name: 'probe-skill', description: 'Test skill' }],
      } });
      return {
        sessionId,
        modes: { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default' }] },
        models: { currentModelId: 'fake-model', availableModels: [{ modelId: 'fake-model', name: 'Fake model' }] },
        configOptions: [],
      };
    },
    loadSession: restore,
    resumeSession: restore,
    async listSessions({ cwd }) {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(cwd);
      return { sessions: files.filter((file) => file.startsWith('.fake-session-')).map((file) => ({
        sessionId: file.slice('.fake-session-'.length, -'.json'.length), cwd,
      })) };
    },
    async prompt({ sessionId, prompt }) {
      const session = sessions.get(sessionId);
      assert.ok(session);
      assert.equal(prompt[0].type, 'text');
      const text = prompt[0].text;
      if (mode === 'crash') process.exit(23);
      if (mode === 'timeout' || mode === 'ignore_cancel' || text.includes('sleep 60')) {
        const toolCall = { toolCallId: 'sleep-tool', title: 'sleep 60', kind: 'execute', status: 'pending' };
        await client.sessionUpdate({ sessionId, update: { sessionUpdate: 'tool_call', ...toolCall } });
        const permission = await client.requestPermission({ sessionId, toolCall, options });
        assert.equal(permission.outcome.optionId, 'allow-once-id');
        return new Promise((resolvePrompt) => {
          const timer = setTimeout(async () => {
            pending.delete(sessionId);
            await message(sessionId, 'FINISHED');
            resolvePrompt({ stopReason: 'end_turn' });
          }, 60000);
          pending.set(sessionId, { timer, resolvePrompt });
        });
      }
      if (text.includes('README.md')) {
        const full = await client.readTextFile({ sessionId, path: join(session.cwd, 'README.md') });
        assert.equal(full.content.split('\n').length, 3);
        const line = await client.readTextFile({ sessionId, path: join(session.cwd, 'README.md'), line: 2, limit: 1 });
        assert.equal(line.content, 'This repository contains a tiny JavaScript add function.\n');
        await assert.rejects(client.readTextFile({ sessionId, path: 'README.md' }));
        await assert.rejects(client.readTextFile({ sessionId, path: join(session.cwd, 'README.md'), line: 0 }));
        await assert.rejects(client.readTextFile({ sessionId, path: '/outside-fixture' }));
        const escaped = join(session.cwd, 'escaped-link');
        await symlink(process.env.FAKE_OUTSIDE_FILE, escaped);
        await assert.rejects(client.readTextFile({ sessionId, path: escaped }));
        await assert.rejects(client.writeTextFile({ sessionId, path: escaped, content: 'must not overwrite' }));
        await client.writeTextFile({ sessionId, path: join(session.cwd, 'nested/client-write.txt'), content: 'client-write-ok\n' });
        await message(sessionId, 'This fixture contains ');
        await message(sessionId, 'a tiny JavaScript add function.');
      } else if (text.includes('touch PERMISSION_PROBE.txt')) {
        const toolCall = { toolCallId: 'touch-tool', title: 'touch PERMISSION_PROBE.txt', kind: 'execute', status: 'pending', rawInput: { command: 'touch PERMISSION_PROBE.txt' } };
        await client.sessionUpdate({ sessionId, update: { sessionUpdate: 'tool_call', ...toolCall } });
        let allowed = mode === 'no_permission';
        if (!allowed) {
          const offered = mode === 'fallback_options' ? options.filter((option) => option.kind.endsWith('_always'))
            : mode === 'missing_reject' ? options.filter((option) => option.kind.startsWith('allow_')) : options;
          const permission = await client.requestPermission({ sessionId, toolCall, options: offered });
          allowed = permission.outcome.outcome === 'selected' && permission.outcome.optionId.startsWith('allow-');
        }
        if (allowed || mode === 'ignore_reject') await execute('touch', [join(session.cwd, 'PERMISSION_PROBE.txt')]);
        await client.sessionUpdate({ sessionId, update: { sessionUpdate: 'tool_call_update', toolCallId: toolCall.toolCallId, status: allowed ? 'completed' : 'failed' } });
        await message(sessionId, allowed ? 'DONE' : 'Rejected');
      } else if (text === '/probe-skill' || text === '$probe-skill') {
        const skill = await readFile(join(session.cwd, '.agents/skills/probe-skill/SKILL.md'), 'utf8');
        assert.ok(skill.includes('PROBE-SKILL-OK'));
        await message(sessionId, mode === 'dollar_only' && text.startsWith('/') ? 'Unknown command' : 'PROBE-SKILL-OK');
      } else if (text.includes('Remember the code word')) {
        session.word = 'HERON';
        await writeFile(join(session.cwd, `.fake-session-${sessionId}.json`), JSON.stringify(session));
        await message(sessionId, 'OK');
      } else {
        assert.equal(text, 'What was the code word?');
        await message(sessionId, mode === 'resume_replay_only' ? 'I do not remember' : session.word);
      }
      return { stopReason: 'end_turn' };
    },
    async cancel({ sessionId }) {
      if (mode === 'ignore_cancel') return;
      const operation = pending.get(sessionId);
      if (operation) {
        clearTimeout(operation.timer);
        pending.delete(sessionId);
        await client.sessionUpdate({ sessionId, update: { sessionUpdate: 'tool_call_update', toolCallId: 'sleep-tool', status: 'failed' } });
        operation.resolvePrompt({ stopReason: 'cancelled' });
      }
    },
  };
}, ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
console.error('fake ACP ready');
