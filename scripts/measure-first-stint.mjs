// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  argumentsFor,
  cleanEnvironment,
  emptyDirectory,
  environment,
  isolatedNpm,
  npmCommand,
  npmProxyEnvironment,
  preparationFailures,
  preparationResult,
  readJson,
  sampleProject,
  saveJson,
  startProxy,
} from "./measurement.mjs";

const args = argumentsFor(["package-dir", "agent", "source", "out", "registry", "conditions"]);
assert(
  args["package-dir"] &&
    args.out &&
    ["claude", "codex"].includes(args.agent) &&
    ["auto", "bundled"].includes(args.source),
  "Usage: node scripts/measure-first-stint.mjs --package-dir <installed node_modules/stintwork> --agent claude|codex --source auto|bundled --out <new-dir> [--registry URL] [--conditions text]",
);
const out = resolve(args.out);
const packageDirectory = resolve(args["package-dir"]);
const entry = join(packageDirectory, "dist/prepare-agent.js");
await mkdir(out);
const env = cleanEnvironment();
const npm = await npmCommand(env);
const toolingEnv = await isolatedNpm(join(out, "tooling"), env);
const cache = join(out, "agent-cache");
await mkdir(cache, { mode: 0o700 });
const report = {
  schemaVersion: 1,
  kind: "first-stint-preparation",
  agent: args.agent,
  requestedSource: args.source,
  packageDirectory,
  version: (await readJson(join(packageDirectory, "package.json"))).version,
  registry: args.registry ?? "https://registry.npmjs.org",
  conditions: args.conditions ?? "unspecified",
  environment: environment((await npm(["--version"], { cwd: out, env: toolingEnv })).stdout),
  agentCache: cache,
  coldCacheEmpty: await emptyDirectory(cache),
  note: "Preparation and prompt-free installed-CLI handshake only. No prompt, real stint or first structured provider event is measured. Warm run uses a second project and the same agent cache. Only npm receives proxy settings. Non-registry agent traffic reaching the proxy is forwarded separately and excluded from download budgets. Frozen released locks determine artifact URLs; --registry selects registry accounting, not the released locks.",
  runs: [],
};
assert(report.coldCacheEmpty);
const worker = join(out, "prepare.mjs");
await writeFile(
  worker,
  `import { prepareAgentForStint } from ${JSON.stringify(pathToFileURL(entry).href)};
const started = performance.now();
try {
  const prepared = await prepareAgentForStint({ agent: ${JSON.stringify(args.agent)}, cwd: process.cwd(), env: process.env,
    onProgress: event => console.log(JSON.stringify({ progress: { ...event, sinceStartMs: performance.now() - started } })) });
  console.log(JSON.stringify({ prepared, preparationMs: performance.now() - started }));
} catch (error) {
  console.log(JSON.stringify({ error: error.message, preparationMs: performance.now() - started }));
  process.exitCode = 1;
}
`,
);
for (const temperature of ["cold", "warm"]) {
  const directory = join(out, temperature);
  await mkdir(directory);
  const gitEnv = await sampleProject(join(directory, "project"), env);
  let proxy;
  let run = { temperature, startedAt: new Date().toISOString() };
  try {
    proxy = await startProxy(join(directory, "proxy"), report.registry);
    const childEnv = await npmProxyEnvironment(
      join(directory, "npm-proxy"),
      { ...gitEnv, STINTWORK_AGENT_CACHE: cache },
      proxy.env,
    );
    if (args.source === "bundled")
      childEnv[args.agent === "claude" ? "CLAUDE_CODE_EXECUTABLE" : "CODEX_PATH"] = join(
        out,
        "deliberately-missing-cli",
      );
    const started = performance.now();
    const result = await new Promise((done) => {
      execFile(
        process.execPath,
        [worker],
        {
          cwd: join(directory, "project"),
          env: childEnv,
          timeout: 900_000,
          killSignal: "SIGKILL",
          maxBuffer: 8 * 1024 * 1024,
        },
        (error, stdout) => done({ error, stdout }),
      );
    });
    run.processMs = performance.now() - started;
    run = { ...run, ...preparationResult(result.stdout) };
    if (result.error && !run.error)
      run.error = `Preparation process failed (${result.error.code ?? "signal/timeout"})`;
    run.network = proxy.snapshot();
    run.failures = preparationFailures(run, args.agent, args.source, report.registry);
    console.log(
      `${temperature}: ${run.preparationMs ?? run.processMs} ms, ${run.network.responseBodyBytes} bytes, ${run.prepared?.source ?? "failed"}`,
    );
  } catch (error) {
    run.error = error.message;
    run.failures = [error.message];
  } finally {
    await proxy?.close();
    await rm(join(directory, "proxy"), { recursive: true, force: true });
    report.runs.push(run);
    await saveJson(join(out, "results.json"), report);
  }
  if (run.error) break; // A failed cold preparation is not a warm-cache measurement.
}
report.passed = report.runs.length === 2 && report.runs.every((run) => run.failures.length === 0);
await saveJson(join(out, "results.json"), report);
process.exitCode = report.passed ? 0 : 1;
