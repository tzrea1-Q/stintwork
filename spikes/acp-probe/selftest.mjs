import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runProbe, SCENARIOS } from './probe.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const execute = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'acp-probe-selftest-'));
const outsideFile = join(root, 'outside.txt');
const { writeFile } = await import('node:fs/promises');
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
