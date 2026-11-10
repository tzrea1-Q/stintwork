import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { agents, checkRelease, releasePass, verdict } from './contract.mjs';
import { runProbe } from './probe.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'acp-contract-'));
try {
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
  assert.equal(verdict({ agent: 'grok', scenarios: [{ scenario: 'permission', status: 'fail', facts: { allow: { requests: [] }, reject: { requests: [] } } }] }, true).permission.status, 'untested');
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
  await assert.rejects(promisify(execFile)(process.execPath, [join(here, 'contract.mjs'), '--check', root]));
  console.log('PASS: fake scenarios, verdict dispositions, fallback, and fake release rejection');
} finally { await rm(root, { recursive: true, force: true }); }
