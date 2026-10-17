// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import {
  argumentsFor,
  boardResult,
  budgetFailures,
  cleanEnvironment,
  comparableBaseline,
  compareResults,
  emptyDirectory,
  environment,
  failedRun,
  fileHash,
  isolatedNpm,
  npmCommand,
  readJson,
  sampleProject,
  saveJson,
  startProxy,
} from "./measurement.mjs";

const args = argumentsFor([
  "subject",
  "runs",
  "out",
  "registry",
  "baseline",
  "conditions",
  "compare",
]);
if (args.compare) {
  try {
    assert(args.baseline, "--compare requires --baseline <results.json>");
    const comparison = compareResults(await readJson(args.compare), await readJson(args.baseline));
    const reference = comparison.baselineSummary;
    const lines = [
      `Baseline: ${reference.completedRuns} completed, ${reference.failedRuns} failed; reference ${reference.budgetBytes} bytes`,
      ...comparison.runs.map(
        (run, index) =>
          `Run ${run.index ?? index + 1}: ${run.failures.length ? "FAIL" : "PASS"}${run.failures.length ? ` — ${run.failures.join("; ")}` : ""}`,
      ),
      `Overall: ${comparison.passed ? "PASS" : "FAIL"} (${comparison.runs.length}/${comparison.requestedRuns} runs recorded)`,
    ];
    await new Promise((done) => process.stdout.write(`${lines.join("\n")}\n`, done));
    process.exit(comparison.passed ? 0 : 1);
  } catch (error) {
    console.error(`Comparison FAIL: ${error.message}`);
    process.exit(1);
  }
}
assert(
  args.subject && args.out,
  "Usage: node scripts/measure-first-run.mjs --subject <npm spec|file.tgz> --runs 3 --out <new-dir> [--registry URL] [--baseline results.json] [--conditions text]",
);
const runs = Number(args.runs ?? 3);
assert(Number.isSafeInteger(runs) && runs > 0, "--runs must be a positive integer");
const local = args.subject.endsWith(".tgz") && !/^https?:/.test(args.subject);
const subject = local ? resolve(args.subject) : args.subject;
assert(!subject.startsWith("-"), "Subject cannot be an option");
const out = resolve(args.out);
await mkdir(out); // Never overwrite earlier evidence or reuse a cache.
const env = cleanEnvironment();
const npm = await npmCommand(env);
const versionEnv = await isolatedNpm(join(out, "tooling"), env);
const report = {
  schemaVersion: 1,
  kind: "first-run",
  subject,
  requestedRuns: runs,
  registry: args.registry ?? "https://registry.npmjs.org",
  conditions:
    args.conditions ?? "unspecified; coordinator must record actual network/load conditions",
  transport:
    "local HTTP forward proxy with ephemeral process-only TLS trust; exact upstream response bodies and separate CONNECT TLS bytes",
  environment: environment((await npm(["--version"], { cwd: out, env: versionEnv })).stdout),
  startedAt: new Date().toISOString(),
  baseline: args.baseline ? resolve(args.baseline) : null,
  installPolicy:
    "npm install --ignore-scripts --no-audit --no-fund; empty local/global npm configuration; no optional-dependency omission",
  runs: [],
};
const reference = args.baseline
  ? comparableBaseline(await readJson(args.baseline), report)
  : undefined;
const baselineBytes = reference?.budgetBytes;
report.baselineSummary = reference ?? null;
report.baselineBudgetBytes = baselineBytes ?? null;
if (reference)
  console.log(
    `Baseline: ${reference.completedRuns} completed, ${reference.failedRuns} failed; reference ${reference.budgetBytes} bytes`,
  );
const require = createRequire(new URL("../packages/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
// Launch before the clock, as in the research's already-running-browser procedure.
const browser = await chromium
  .launch({
    channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || undefined,
  })
  .catch(async (error) => {
    report.setupError = error.message;
    await saveJson(join(out, "results.json"), report);
    throw error;
  });
try {
  for (let index = 1; index <= runs; index++) {
    console.log(`Cold run ${index}/${runs}: ${subject}`);
    const directory = join(out, `run-${index}`);
    await mkdir(directory);
    const consumer = join(directory, "consumer");
    const project = join(directory, "project");
    const cache = join(directory, "agent-cache");
    await mkdir(consumer);
    await mkdir(cache, { mode: 0o700 });
    const npmEnv = await isolatedNpm(directory, env);
    const gitEnv = await sampleProject(project, npmEnv);
    const proof = {
      consumerEmpty: await emptyDirectory(consumer),
      npmCacheEmpty: await emptyDirectory(npmEnv.npm_config_cache),
      agentCacheEmpty: await emptyDirectory(cache),
    };
    assert(Object.values(proof).every(Boolean), "Run directories were not empty");
    await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true }));
    let localTarball;
    if (local) {
      const started = performance.now();
      localTarball = {
        path: subject,
        bytes: (await stat(subject)).size,
        sha256: await fileHash(subject),
        inspectionMs: performance.now() - started,
        transferMs: null,
        exclusion:
          "Root tarball was already local: transfer time is unmeasured/excluded; its bytes are added to the board budget. Hash/inspection precedes install.",
      };
    }
    let proxy;
    let child;
    let closed;
    let context;
    let output = "";
    let started;
    let stage = "setup";
    let run = {
      index,
      directory,
      consumer,
      project,
      agentCache: cache,
      emptyBefore: proof,
      localTarball,
      startedAt: new Date().toISOString(),
      status: "running",
    };
    try {
      proxy = await startProxy(join(directory, "proxy"), report.registry);
      const measuredEnv = {
        ...gitEnv,
        ...proxy.env,
        STINTWORK_AGENT_CACHE: cache,
        npm_config_registry: report.registry,
      };
      context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: "en-US",
      });
      await context.addInitScript(() => localStorage.setItem("stintwork.language", "en"));
      const page = await context.newPage();
      page.setDefaultTimeout(120_000);
      started = performance.now();
      stage = "install";
      const installed = await npm(
        ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=http", subject],
        { cwd: consumer, env: measuredEnv },
      );
      const installMs = performance.now() - started;
      run.installMs = installMs;
      stage = "board";
      await writeFile(join(directory, "install-http.log"), installed.stderr);
      const packageDirectory = join(consumer, "node_modules/stintwork");
      const manifest = await readJson(join(packageDirectory, "package.json"));
      assert.equal(manifest.name, "stintwork");
      const processStartedMs = performance.now() - started;
      child = spawn(
        process.execPath,
        [
          join(
            packageDirectory,
            typeof manifest.bin === "string" ? manifest.bin : manifest.bin.stintwork,
          ),
          "--no-open",
        ],
        { cwd: project, env: measuredEnv, stdio: ["ignore", "pipe", "pipe"] },
      );
      closed = new Promise((done) => child.once("close", done));
      const url = await new Promise((done, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Board startup timed out: ${output}`)),
          120_000,
        );
        function receive(chunk) {
          output += chunk;
          const match = /Stintwork: (http:\/\/localhost:\d+)/.exec(output);
          if (match) {
            clearTimeout(timer);
            done(match[1]);
          }
        }
        child.stdout.on("data", receive);
        child.stderr.on("data", receive);
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          reject(new Error(`CLI exited (${code}): ${output}`));
        });
      });
      await page.goto(url, { timeout: 120_000 });
      // Role/title work for the public 0.1.1 board as well as the current board.
      const card = page.getByRole("button", { name: /First run sample/ }).first();
      await card.waitFor({ state: "visible" });
      await card.click();
      await page
        .getByRole("dialog", { name: "First run sample", exact: true })
        .waitFor({ state: "visible" });
      await page
        .getByRole("dialog", { name: "First run sample", exact: true })
        .getByText("Open this work item's detail to verify the board.", { exact: true })
        .waitFor({ state: "visible" });
      const readyMs = performance.now() - started;
      const network = proxy.snapshot();
      const agentCacheEmpty = await emptyDirectory(cache);
      const screenshot = join(directory, "usable-board.png");
      await page.screenshot({ path: screenshot, fullPage: true });
      run = {
        ...run,
        version: manifest.version,
        ...boardResult({
          installMs,
          processStartedMs,
          readyMs,
          network,
          localTarballBytes: localTarball?.bytes,
          agentCacheEmpty,
          screenshot,
        }),
      };
      run.failures = budgetFailures(run, baselineBytes);
      // Identity inspection is outside both clocks and the board's proxy snapshot.
      const identityDirectory = join(directory, "identity");
      await mkdir(identityDirectory);
      const identityStarted = performance.now();
      stage = "inspection";
      const packed = await npm(
        [
          "pack",
          "--ignore-scripts",
          "--json",
          "--pack-destination",
          identityDirectory,
          local ? subject : `stintwork@${manifest.version}`,
        ],
        { cwd: identityDirectory, env: measuredEnv },
      );
      const [details] = JSON.parse(packed.stdout);
      const tarball = join(identityDirectory, details.filename);
      const lock = await readJson(join(consumer, "package-lock.json"));
      const installedIdentity = lock.packages["node_modules/stintwork"];
      assert.equal(
        installedIdentity.integrity,
        `sha512-${await fileHash(tarball, "sha512", "base64")}`,
        "Inspected tarball does not match installed lock integrity",
      );
      if (local)
        assert.equal(
          await fileHash(tarball),
          localTarball.sha256,
          "Local tarball changed/repacked",
        );
      run.package = {
        version: details.version,
        sha256: await fileHash(tarball),
        packedBytes: details.size,
        unpackedBytes: details.unpackedSize,
        fileCount: details.entryCount,
        files: details.files,
        dependencies: manifest.dependencies,
        optionalDependencies: manifest.optionalDependencies ?? {},
        installedIdentity,
        dependencyIdentities: lock.packages,
        inspectionMs: performance.now() - identityStarted,
        inspectionExcludedFromBoard: true,
        tarball,
      };
      run.status = "completed";
    } catch (error) {
      run = failedRun(
        run,
        error,
        proxy?.snapshot(),
        started === undefined ? null : performance.now() - started,
        stage,
      );
      if (stage === "install" && error.stderr)
        await writeFile(join(directory, "install-http.log"), error.stderr);
      console.error(`Run ${index} failed: ${error.message}`);
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
        await closed;
        clearTimeout(timer);
      }
      await context?.close();
      await proxy?.close();
      await rm(join(directory, "proxy"), { recursive: true, force: true });
      await writeFile(join(directory, "board.log"), output);
      report.runs.push(run);
      await saveJson(join(out, "results.json"), report);
    }
  }
} finally {
  await browser.close();
}
report.finishedAt = new Date().toISOString();
report.passed =
  report.runs.length === runs && report.runs.every((run) => run.failures.length === 0);
await saveJson(join(out, "results.json"), report);
console.log(`${join(out, "results.json")}: ${report.passed ? "PASS" : "FAIL"}`);
process.exitCode = report.passed ? 0 : 1;
