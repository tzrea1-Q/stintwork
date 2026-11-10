import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runProbe, SCENARIOS } from './probe.mjs';

const execute = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
export const agents = ['claude', 'codex', 'grok', 'antigravity'];
const accepted = new Set(['pass', 'unsupported-accepted']);

export function verdict(summary, fallback) {
  const results = {};
  for (const scenario of SCENARIOS) {
    const item = summary.scenarios?.find((entry) => entry.scenario === scenario);
    let status = item?.status ?? 'untested';
    let reason = item?.facts?.reason ?? item?.error?.message ?? '';
    if (status === 'error') status = 'fail';
    if (status === 'unsupported') status = 'unsupported-unexplained';
    if (scenario === 'permission' && summary.agent === 'grok' && item?.facts?.allow?.requests?.length === 0 && item?.facts?.reject?.requests?.length === 0) {
      status = 'untested';
      reason = 'blocked: untested required behaviour; no permission requests observed (always-approve is one possible cause)';
    }
    if (scenario === 'resume' && ['grok', 'antigravity'].includes(summary.agent) && status === 'unsupported-unexplained') {
      const observations = item.connections?.slice(0, 2).map((connection) => connection.initialization);
      if (observations?.length === 2 && observations.every((initialization) => initialization && !initialization.agentCapabilities?.loadSession && initialization.agentCapabilities?.sessionCapabilities?.resume == null) && !item.facts?.listError && !Object.keys(item.facts?.restoreAttempts ?? {}).length) {
        status = 'unsupported-accepted';
        reason = 'ACP recovery is not used by the product: ADR 0012 and more-agents 04/07; checkpoint fallback is checked separately';
      } else {
        status = 'fail';
        reason = 'Recovery unsupported by both processes was not established, or an attempt failed';
      }
    }
    if (scenario === 'resume' && ['claude', 'codex'].includes(summary.agent) && status === 'pass' && !item.facts?.restoreAttempts?.loadSession?.heronReturned) {
      status = 'fail';
      reason = 'ADR 0012 requires session/load in a fresh process';
    }
    results[scenario === 'resume' ? 'acp-recovery' : scenario] = { status, reason };
  }
  if (['grok', 'antigravity'].includes(summary.agent)) results['checkpoint-fallback'] = {
    status: fallback === true ? 'pass' : fallback === false ? 'fail' : 'untested',
    reason: 'Server startup fallback test: packages/server/src/stint-history.test.ts',
  };
  return results;
}

export function releasePass(run) {
  return run?.revision && run.clean === true && run.fake === false && agents.every((agent) => {
    const entry = run.agents?.[agent];
    const names = [...SCENARIOS.map((name) => name === 'resume' ? 'acp-recovery' : name), ...(['grok', 'antigravity'].includes(agent) ? ['checkpoint-fallback'] : [])];
    return entry?.source && entry?.version && entry?.fake === false && names.every((name) => {
      const result = entry.results?.[name];
      return accepted.has(result?.status) && (result.status !== 'unsupported-accepted' || (name === 'acp-recovery' && ['grok', 'antigravity'].includes(agent) && result.reason?.includes('ADR 0012')));
    });
  });
}

export async function checkRelease(run, cwd = repo) {
  const git = async (...args) => (await execute('git', args, { cwd })).stdout.trim();
  if (run?.revision !== await git('rev-parse', 'HEAD')) return 'Recorded revision does not match current HEAD';
  if (await git('status', '--porcelain')) return 'Current working tree is dirty';
  return releasePass(run) ? null : 'Release contract blocked';
}

async function main() {
  if (process.argv[2] === '--check' && process.argv.length === 4) {
    const run = JSON.parse(await readFile(join(resolve(process.argv[3]), 'verdict.json'), 'utf8'));
    const failure = await checkRelease(run);
    console.log(failure ?? 'Release contract passed');
    if (failure) process.exitCode = 1;
    return;
  }
  if (process.argv.length !== 3 || process.argv[2] !== '--run') throw new Error('Usage: node --conditions=development --import tsx spikes/acp-probe/contract.mjs --run | --check RUN_DIR');
  const { prepareAgentForStint } = await import('../../packages/agents/src/prepare-agent.ts');
  const { createGrokAgent } = await import('../../packages/agents/src/grok.ts');
  const { createAntigravityAgent } = await import('../../packages/agents/src/antigravity.ts');
  const git = async (...args) => (await execute('git', args, { cwd: repo })).stdout.trim();
  const revision = await git('rev-parse', 'HEAD');
  const clean = !(await git('status', '--porcelain'));
  const dir = join(here, 'runs', `contract-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await mkdir(dir, { recursive: true });
  const run = { revision, clean, os: `${process.platform}-${process.arch}`, node: process.version, fake: false, agents: {} };
  const save = () => writeFile(join(dir, 'verdict.json'), `${JSON.stringify(run, null, 2)}\n`);
  await save();
  let fallback = false;
  try {
    await execute('pnpm', ['exec', 'vitest', 'run', 'packages/server/src/stint-history.test.ts', '-t', 'startup eligibility'], { cwd: repo, timeout: 180000, maxBuffer: 1024 * 1024 });
    fallback = true;
  } catch (error) { run.fallbackError = error.message; }
  for (const agent of agents) {
    try {
      const prepared = agent === 'claude' || agent === 'codex'
        ? await prepareAgentForStint({ agent, cwd: repo })
        : await (agent === 'grok' ? createGrokAgent() : createAntigravityAgent()).prepare({ cwd: repo });
      const summary = await runProbe({ agent, root: dir, timeoutSec: 180, prepared });
      run.agents[agent] = { source: prepared.source, version: prepared.executable.version, prepared, fake: summary.runtime.testOverride, summary: summary.runDir, results: verdict(summary, fallback) };
    } catch (error) {
      run.agents[agent] = { fake: false, error: error.message, results: verdict({ agent, scenarios: [] }, fallback) };
    }
    await save();
  }
  const finalRevision = await git('rev-parse', 'HEAD');
  run.clean = clean && finalRevision === revision && !(await git('status', '--porcelain'));
  await save();
  console.log(`Verdict: ${dir}`);
  if (!releasePass(run)) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
