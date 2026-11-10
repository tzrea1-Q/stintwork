import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { agents, releasePass, verdict } from './contract.mjs';
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
  const unsupported = verdict({ agent: 'grok', scenarios: [{ scenario: 'resume', status: 'unsupported', facts: {} }] }, true)['acp-recovery'];
  assert.equal(unsupported.status, 'unsupported-accepted');
  run.agents.grok.results['acp-recovery'] = unsupported;
  assert.ok(releasePass(run));
  assert.equal(verdict({ agent: 'grok', scenarios: [{ scenario: 'permission', status: 'fail', facts: { allow: { requests: [] }, reject: { requests: [] } } }] }, true).permission.status, 'untested');
  run.agents.codex.fake = true;
  assert.ok(!releasePass(run));
  await writeFile(join(root, 'verdict.json'), JSON.stringify(run));
  await assert.rejects(promisify(execFile)(process.execPath, [join(here, 'contract.mjs'), '--check', root]));
  console.log('PASS: fake scenarios, verdict dispositions, fallback, and fake release rejection');
} finally { await rm(root, { recursive: true, force: true }); }
