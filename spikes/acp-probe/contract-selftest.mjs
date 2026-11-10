import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { agents, checkRelease, createRunDirectory, releasePass, verdict } from './contract.mjs';
import { runProbe } from './probe.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'acp-contract-'));
try {
  const runDir = join(root, 'contract-run');
  await createRunDirectory(runDir);
  if (process.platform !== 'win32') {
    assert.equal((await stat(runDir)).mode & 0o777, 0o700);
    await chmod(runDir, 0o755);
    await createRunDirectory(runDir);
    assert.equal((await stat(runDir)).mode & 0o777, 0o700);
  }
  await writeFile(join(root, 'outside'), 'outside-original');
  const summary = await runProbe({ agent: 'codex', root, timeoutSec: 10, cancelAfterMs: 100, spawnSpec: { command: process.execPath, args: [join(here, 'lib/fake-agent.mjs')], env: { FAKE_OUTSIDE_FILE: join(root, 'outside') } } });
  assert.ok(summary.runtime.testOverride);
  const results = verdict(summary, true);
  assert.ok(Object.values(results).every((result) => result.status === 'pass'));
  const run = { revision: 'revision', clean: true, fake: false, agents: Object.fromEntries(agents.map((agent) => [agent, { source: 'installed', version: '1', fake: false, results: { ...results, ...(['grok', 'antigravity'].includes(agent) ? { 'checkpoint-fallback': { status: 'pass' } } : {}) } }])) };
  assert.ok(releasePass(run));
  for (const status of ['fail', 'timeout', 'unsupported-unexplained', 'untested']) {
    run.agents.codex.results = { ...results, basic: { status } };
    assert.ok(!releasePass(run), status);
  }
  run.agents.codex.results = results;
  const connections = [{ initialization: { agentCapabilities: {} } }, { initialization: { agentCapabilities: {} } }];
  const recovery = (agent, status, observations = connections, facts = {}) => verdict({ agent, scenarios: [{ scenario: 'resume', status, connections: observations, facts }] }, true)['acp-recovery'];
  for (const agent of ['grok', 'antigravity']) {
    assert.equal(recovery(agent, 'unsupported').status, 'unsupported-accepted');
    for (const capability of [{ loadSession: true }, { sessionCapabilities: { resume: {} } }]) {
      assert.equal(recovery(agent, 'unsupported', [{ initialization: { agentCapabilities: capability } }, connections[1]]).status, 'fail');
      assert.equal(recovery(agent, 'unsupported', [connections[0], { initialization: { agentCapabilities: capability } }]).status, 'fail');
    }
    assert.equal(recovery(agent, 'unsupported', connections.slice(0, 1)).status, 'fail');
    assert.equal(recovery(agent, 'unsupported', connections, { listError: {} }).status, 'fail');
    assert.equal(recovery(agent, 'unsupported', connections, { restoreAttempts: { loadSession: { error: {} } } }).status, 'fail');
    assert.equal(recovery(agent, 'error').status, 'fail');
    assert.equal(recovery(agent, 'timeout').status, 'timeout');
  }
  const unsupported = recovery('grok', 'unsupported');
  run.agents.grok.results['acp-recovery'] = unsupported;
  assert.ok(releasePass(run));
  const scenarioResult = (agent, item) => verdict({ agent, scenarios: [item] }, true)[item.scenario === 'resume' ? 'acp-recovery' : item.scenario];
  const noRequests = { scenario: 'permission', status: 'fail', facts: { allow: { requests: [] }, reject: { requests: [], fileExists: false } } };
  const permission = scenarioResult('grok', noRequests);
  assert.equal(permission.status, 'unsupported-accepted');
  assert.match(permission.reason, /2026-11-10.*agent-polish 04.*not permission support/);
  assert.equal(scenarioResult('antigravity', noRequests).status, 'fail');
  assert.equal(scenarioResult('grok', { ...noRequests, facts: { ...noRequests.facts, reject: { requests: [], fileExists: true } } }).status, 'fail');
  assert.equal(scenarioResult('grok', { ...noRequests, facts: { ...noRequests.facts, reject: { requests: [] } } }).status, 'fail');
  assert.equal(scenarioResult('grok', { ...noRequests, facts: { allow: { requests: [{}] }, reject: { requests: [] } } }).status, 'fail');
  const limited = { scenario: 'basic', status: 'error', error: { name: 'Error', message: 'RATE LIMITED' } };
  const rateLimit = scenarioResult('grok', limited);
  assert.equal(rateLimit.status, 'unsupported-accepted');
  assert.match(rateLimit.reason, /2026-11-10/);
  assert.equal(scenarioResult('grok', { scenario: 'commands', status: 'fail', facts: { attempts: [{ stopReason: 'rate_limited' }] } }).status, 'unsupported-accepted');
  assert.equal(scenarioResult('grok', { scenario: 'basic', status: 'fail', facts: { prompt: { stopReason: 'Rate limited' } } }).status, 'unsupported-accepted');
  for (const facts of [{ prompt: { reply: 'Rate limited' } }, { attempts: [{ reply: 'ratelimited' }] }]) {
    assert.equal(scenarioResult('grok', { scenario: 'basic', status: 'fail', facts }).status, 'unsupported-accepted');
    assert.equal(scenarioResult('grok', { scenario: 'basic', status: 'pass', facts }).status, 'pass');
    assert.equal(scenarioResult('codex', { scenario: 'basic', status: 'fail', facts }).status, 'fail');
  }
  assert.equal(scenarioResult('grok', { scenario: 'basic', status: 'fail', facts: { prompt: { reply: 'other failure' } } }).status, 'fail');
  assert.equal(scenarioResult('grok', { ...limited, error: { name: 'Error', message: 'other failure' } }).status, 'fail');
  assert.equal(scenarioResult('grok', { ...limited, status: 'timeout' }).status, 'timeout');
  assert.equal(scenarioResult('codex', limited).status, 'fail');
  run.agents.grok.results = { ...run.agents.grok.results, permission, basic: rateLimit };
  assert.ok(releasePass(run));
  const allLimited = Object.fromEntries(Object.keys(run.agents.grok.results).map((name) => [name, name === 'checkpoint-fallback' ? { status: 'pass' } : rateLimit]));
  assert.ok(releasePass({ ...run, agents: { ...run.agents, grok: { ...run.agents.grok, results: allLimited } } }));
  assert.ok(!releasePass({ ...run, agents: { ...run.agents, grok: { ...run.agents.grok, results: { ...run.agents.grok.results, basic: { status: 'untested' } } } } }));
  assert.ok(!releasePass({ ...run, agents: { ...run.agents, grok: { ...run.agents.grok, version: '' } } }));
  run.agents.codex.fake = true;
  assert.ok(!releasePass(run));
  run.agents.codex.fake = false;
  const checkout = join(root, 'checkout');
  await mkdir(checkout);
  const git = (...args) => promisify(execFile)('git', args, { cwd: checkout });
  await git('init');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Contract test');
  await writeFile(join(checkout, '.gitignore'), 'runs/\n');
  await git('add', '.');
  await git('commit', '-m', 'test');
  run.revision = (await git('rev-parse', 'HEAD')).stdout.trim();
  await mkdir(join(checkout, 'runs'));
  await writeFile(join(checkout, 'runs', 'evidence'), 'ignored');
  assert.equal(await checkRelease(run, checkout), null);
  assert.match(await checkRelease({ ...run, revision: 'stale' }, checkout), /revision.*HEAD/i);
  await writeFile(join(checkout, '.gitignore'), 'modified');
  assert.match(await checkRelease(run, checkout), /dirty/i);
  run.agents.codex.fake = true;
  await writeFile(join(root, 'verdict.json'), JSON.stringify(run));
  await assert.rejects(promisify(execFile)(process.execPath, [join(here, 'contract.mjs'), '--check', root]), (error) => {
    assert.match(error.stdout, /accepted limitation.*grok basic:.*2026-11-10/i);
    assert.match(error.stdout, /accepted limitation.*grok permission:.*agent-polish 04/i);
    return true;
  });
  console.log('PASS: fake scenarios, verdict dispositions, fallback, and fake release rejection');
} finally { await rm(root, { recursive: true, force: true }); }
