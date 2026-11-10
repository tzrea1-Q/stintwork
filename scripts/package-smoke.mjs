// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { checkInstalledDependencies } from "./package-dependencies.mjs";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, delimiter, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = await realpath(fileURLToPath(new URL("../", import.meta.url)));
assert(
  process.argv.slice(2).every((argument) => argument === "--offline"),
  "Use only --offline.",
);
const offline = process.argv.includes("--offline");
const temporary = await realpath(await mkdtemp(join(tmpdir(), "stintwork-package-smoke-")));
const outside = relative(root, temporary);
assert(outside.startsWith(".."), "The package smoke test must be outside the monorepo.");
const env = { ...process.env };
delete env.STINTWORK_SKIP_AGENT_DETECTION;
for (const key of Object.keys(env)) {
  if (["NODE_PATH", "NODE_OPTIONS", "INIT_CWD"].includes(key) || key.startsWith("GIT_"))
    delete env[key];
}
const options = { env, timeout: 300_000, maxBuffer: 8 * 1024 * 1024 };
let child;
let closed;
let output = "";

try {
  const consumer = join(temporary, "consumer");
  await mkdir(consumer);
  assert.deepEqual(await readdir(consumer), []);
  const packed = await execute(
    "pnpm",
    ["--config.verify-deps-before-run=false", "pack", "--pack-destination", temporary],
    { ...options, cwd: root },
  );
  process.stdout.write(packed.stdout);
  const tarballs = (await readdir(temporary)).filter((name) => name.endsWith(".tgz"));
  assert.equal(tarballs.length, 1);
  const tarball = join(temporary, tarballs[0]);
  const { stdout: listing } = await execute("tar", ["-tzf", tarball], options);
  const entries = listing
    .trim()
    .split("\n")
    .filter((name) => !name.endsWith("/"));
  for (const entry of entries) {
    assert(!entry.split("/").includes(".."), `Invalid tarball path: ${entry}`);
    assert(
      [
        "package/package.json",
        "package/README.md",
        "package/README.zh-CN.md",
        "package/LICENSE",
      ].includes(entry) || entry.startsWith("package/dist/"),
      `Unexpected tarball file: ${entry}`,
    );
    assert(
      !/(?:\.node$|binding\.gyp$|\/node_modules\/)/.test(entry),
      `Native or vendored file: ${entry}`,
    );
  }
  for (const entry of [
    "package/dist/bin.js",
    "package/dist/prepare-agent.js",
    "package/dist/web/index.html",
    "package/README.md",
    "package/README.zh-CN.md",
    "package/LICENSE",
  ])
    assert(entries.includes(entry), `Missing tarball file: ${entry}`);
  const { stdout: manifestText } = await execute(
    "tar",
    ["-xOzf", tarball, "package/package.json"],
    options,
  );
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.name, "stintwork");
  assert.equal(manifest.version, "0.2.0");
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.engines.node, ">=22.12.0");
  assert.equal(manifest.bin.stintwork, "dist/bin.js");
  assert(
    !/(?:workspace:|@stintwork\/)/.test(manifestText),
    "Workspace reference in packed manifest.",
  );
  for (const group of ["dependencies", "optionalDependencies"])
    assert(
      !Object.keys(manifest[group] ?? {}).some((name) => /claude-agent|codex/.test(name)),
      "Eager adapter/native dependency.",
    );
  const { stdout: bundle } = await execute(
    "tar",
    ["-xOzf", tarball, "package/dist/bin.js"],
    options,
  );
  assert(
    !/(?:from\s*|import\s*\(|require\s*\()\s*["']@stintwork\//.test(bundle),
    "Unbundled workspace import.",
  );

  await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true }));
  console.log(
    `Installing packed package${offline ? " from the local pnpm store" : " from npm"}...`,
  );
  const installed = await execute(
    offline ? "pnpm" : "npm",
    offline
      ? ["--config.verify-deps-before-run=false", "add", "--offline", "--ignore-scripts", tarball]
      : ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    { ...options, cwd: consumer },
  );
  process.stdout.write(installed.stdout);
  const packageRoot = await realpath(join(consumer, "node_modules/stintwork"));
  assert(
    !relative(temporary, packageRoot).startsWith(".."),
    "Package resolves into the workspace.",
  );
  await checkInstalledDependencies(join(consumer, "node_modules"));
  const require = createRequire(join(packageRoot, "dist/bin.js"));
  const preparation = await import(pathToFileURL(join(packageRoot, "dist/prepare-agent.js")).href);
  assert.equal(typeof preparation.prepareAgentForStint, "function");
  for (const adapter of ["claude-agent-acp", "codex-acp"])
    assert.throws(() => require.resolve(`@agentclientprotocol/${adapter}/dist/index.js`), {
      code: "MODULE_NOT_FOUND",
    });
  const profiles = new URL("../packages/agents/profiles/", import.meta.url);
  assert(entries.includes("package/dist/agent-profiles/download-sizes.json"));
  assert.equal(
    await readFile(join(packageRoot, "dist/agent-profiles/download-sizes.json"), "utf8"),
    await readFile(new URL("download-sizes.json", profiles), "utf8"),
  );
  for (const agent of ["claude", "codex"]) {
    for (const profile of await readdir(new URL(`${agent}/`, profiles))) {
      for (const file of ["package.json", "package-lock.json"]) {
        const path = `${agent}/${profile}/${file}`;
        assert(
          entries.includes(`package/dist/agent-profiles/${path}`),
          `Missing released profile: ${path}`,
        );
        assert(
          !existsSync(join(packageRoot, "dist/agent-profiles", agent, profile, "node_modules")),
          `Resolved shipped profile: ${path}`,
        );
        assert.equal(
          await readFile(join(packageRoot, "dist/agent-profiles", path), "utf8"),
          await readFile(new URL(path, profiles), "utf8"),
        );
      }
    }
  }
  for (const name of (
    await readdir(new URL("../packages/core/workflows/", import.meta.url))
  ).filter((name) => name.endsWith(".yaml"))) {
    assert(entries.includes(`package/dist/workflows/${name}`));
    assert.equal(
      await readFile(join(packageRoot, "dist/workflows", name), "utf8"),
      await readFile(new URL(`../packages/core/workflows/${name}`, import.meta.url), "utf8"),
    );
  }
  const executable = join(consumer, "node_modules/.bin/stintwork");
  const version = await execute(executable, ["--version"], { ...options, cwd: consumer });
  assert.equal(version.stdout, "0.2.0\n");
  assert.equal(version.stderr, "");
  const help = await execute(executable, ["--help"], { ...options, cwd: consumer });
  assert.equal(help.stderr, "");
  for (const text of ["Usage: stintwork", "--version", "--help", "--no-open"])
    assert(help.stdout.includes(text));

  const project = join(temporary, "project");
  const projectEnv = {
    ...env,
    HOME: join(temporary, "home"),
    XDG_CONFIG_HOME: join(temporary, "home/.config"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(temporary, "home/.gitconfig"),
  };
  await mkdir(project);
  await execute("git", ["init", "--quiet", "--initial-branch=smoke", project], {
    ...options,
    env: projectEnv,
  });
  await execute(
    "git",
    [
      "-c",
      "user.name=Package smoke",
      "-c",
      "user.email=smoke@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "Initial package smoke project",
    ],
    { ...options, cwd: project, env: projectEnv },
  );
  const browserDirectory = join(temporary, "browser-bin");
  const browserOpened = join(temporary, "browser-opened");
  await mkdir(browserDirectory);
  for (const name of ["open", "xdg-open"]) {
    const path = join(browserDirectory, name);
    await writeFile(
      path,
      `#!${process.execPath}\n// SPDX-License-Identifier: Apache-2.0\nrequire("node:fs").writeFileSync(${JSON.stringify(browserOpened)}, "opened");\n`,
    );
    await chmod(path, 0o755);
  }
  const agentLaunched = join(temporary, "agent-launched");
  for (const name of ["claude", "codex", "grok"]) {
    const path = join(browserDirectory, name);
    await writeFile(
      path,
      `#!${process.execPath}\nrequire("node:fs").writeFileSync(${JSON.stringify(agentLaunched)}, "launched"); process.exit(1);\n`,
    );
    await chmod(path, 0o755);
  }
  await writeFile(
    join(browserDirectory, "agy"),
    `#!${process.execPath}\nif (process.argv[2] === "--version") process.stdout.write("1.5.3\\n"); else require("node:fs").writeFileSync(${JSON.stringify(agentLaunched)}, "launched");\n`,
  );
  await chmod(join(browserDirectory, "agy"), 0o755);
  child = spawn(executable, ["--no-open"], {
    cwd: project,
    env: {
      ...projectEnv,
      STINTWORK_AGENT_CACHE: join(temporary, "agent-cache"),
      CLAUDE_CODE_EXECUTABLE: join(browserDirectory, "claude"),
      CODEX_PATH: join(browserDirectory, "codex"),
      PATH: `${browserDirectory}${delimiter}${env.PATH ?? ""}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  closed = new Promise((resolve) => child.once("close", resolve));
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Startup timed out:\n${output}`)), 30_000);
    function address() {
      const match = /Stintwork: (http:\/\/localhost:\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    }
    child.stdout.on("data", address);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`CLI exited (${code ?? signal}):\n${output}`));
    });
  });
  const health = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, repo: basename(project) });
  const snapshot = await fetch(`${url}/api/project`, { signal: AbortSignal.timeout(5000) });
  assert.equal(snapshot.status, 200);
  const state = await snapshot.json();
  assert.equal(state.name, basename(project));
  assert.equal(state.branch, "smoke");
  assert.deepEqual(state.workItems, []);
  assert.deepEqual(state.warnings, []);
  assert.deepEqual(Object.keys(state.workflows).sort(), ["bug", "feature", "quick"]);
  const page = await fetch(url, { signal: AbortSignal.timeout(5000) });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert(html.includes('<div id="root">'));
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)];
  assert(assets.length >= 2, "Missing built JS/CSS assets.");
  for (const [, asset] of assets) {
    const response = await fetch(`${url}${asset}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    assert((await response.arrayBuffer()).byteLength > 0);
  }
  const availability = await fetch(`${url}/api/agents?refresh=true`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(availability.status, 200);
  const agents = (await availability.json()).agents;
  assert.deepEqual(agents.map((agent) => agent.id).sort(), [
    "antigravity",
    "claude",
    "codex",
    "grok",
  ]);
  assert(
    agents.every(
      (agent) => !agent.availability.available && agent.availability.kind === "not-prepared",
    ),
  );
  assert(agents.every((agent) => agent.availability.canStart));
  assert.equal(
    agents.find((agent) => agent.id === "antigravity").availability.selection.reason,
    "native",
  );
  assert(!existsSync(agentLaunched), "Board/refresh launched an agent.");
  assert(!existsSync(join(temporary, "agent-cache")), "Board/refresh prepared an adapter.");
  assert(!existsSync(browserOpened), "--no-open launched a browser.");
  console.log(
    "Packed package smoke passed: version, help, health, project, web assets and no browser.",
  );
} catch (error) {
  if (output) console.error(output);
  throw error;
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    await closed;
    clearTimeout(timer);
  }
  await rm(temporary, { recursive: true, force: true });
}
