// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { once } from "node:events";
import { afterEach, expect, test, vi } from "vitest";
import {
  adapterHost,
  adapterPins,
  nativePackage,
  profileManifest,
  profileName,
} from "./adapter-profiles.js";
import {
  prepareAgent,
  type AgentPreparationEvent,
  type AgentPreparationOptions,
} from "./adapter-cache.js";
import {
  prepareAgentForStint,
  createClaudeCodeAgent,
  startAgentStint,
  AgentAuthenticationError,
  type AgentLauncher,
} from "./index.js";
import { codexProfile } from "./profiles.js";
import { npmEntry } from "./npm.js";
import { sourceNodeArgs } from "./source-node-args.js";
import { findExecutable } from "./executable.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function script(path: string, source: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `#!${process.execPath}\n${source}`);
  await chmod(path, 0o700);
}

const fakeAdapter = `
const fs = await import('node:fs');
const readline = await import('node:readline');
let cwd;
for await (const line of readline.createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (process.env.TEST_ACP_TRACE) fs.appendFileSync(process.env.TEST_ACP_TRACE, JSON.stringify({pid:process.pid,method:request.method})+'\\n');
  if (!('id' in request)) continue;
  if (request.method === 'initialize' && process.env.TEST_INITIALIZE && !(process.env.CODEX_PATH || process.env.CLAUDE_CODE_EXECUTABLE).includes('/entries/')) {
    const failures = {
      incompatible: {code:-32601,message:'Method unsupported'},
      auth: {code:-32000,message:'Authentication required'},
      authGeneric: {code:-32000,message:'Invalid request'},
      permission: {code:-32001,message:'Permission denied'},
      provider: {code:-32603,message:'Provider protocol unavailable'},
    };
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:failures[process.env.TEST_INITIALIZE]})+'\\n');
    continue;
  }
  if (request.method === 'session/new' && process.env.TEST_HANDSHAKE === 'fail' && !(process.env.CODEX_PATH || process.env.CLAUDE_CODE_EXECUTABLE).includes('/entries/')) {
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Method unsupported'}})+'\\n');
    continue;
  }
  let result = {};
  if (request.method === 'initialize') result = { protocolVersion:1,agentCapabilities:{},authMethods:[] };
  if (request.method === 'session/new') {
    cwd = request.params.cwd;
    result = { sessionId:'fake-session', modes:{currentModeId:'agent',availableModes:['agent','workspace-write','read-only','default','acceptEdits'].map(id=>({id,name:id}))} };
  }
  if (request.method === 'session/prompt') {
    fs.writeFileSync(cwd+'/selected.json',JSON.stringify({claude:process.env.CLAUDE_CODE_EXECUTABLE,codex:process.env.CODEX_PATH}));
    result = {stopReason:'end_turn'};
  }
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');
}`;

async function fixture(agent: "claude" | "codex" = "codex") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "stintwork-cache-test-")));
  directories.push(root);
  const cwd = join(root, "project");
  await mkdir(cwd);
  const profilesDirectory = join(root, "profiles");
  const host = adapterHost();
  for (const source of ["installed", "bundled"] as const) {
    const manifest = profileManifest(agent, source, host);
    const packages: Record<string, object> = {
      "": { name: manifest.name, dependencies: manifest.dependencies },
    };
    for (const [name, version] of Object.entries(manifest.dependencies)) {
      const alias = version.startsWith("npm:");
      packages[`node_modules/${name}`] = {
        ...(alias ? { name: "@openai/codex" } : {}),
        version: alias ? version.slice(version.lastIndexOf("@") + 1) : version,
        resolved: `https://registry.npmjs.org/${name}/-/fixture.tgz`,
        integrity: `sha512-${Buffer.alloc(64, 1).toString("base64")}`,
      };
    }
    const pin = adapterPins[agent];
    Object.assign(packages[`node_modules/${pin.adapter}`], {
      dependencies: { [pin.dependency]: `^${pin.dependencyVersion}` },
    });
    Object.assign(packages[`node_modules/${pin.dependency}`], {
      peerDependencies: { "fixture-peer": "^1.0.0" },
    });
    packages["node_modules/fixture-peer"] = {
      version: "1.0.0",
      resolved: "https://registry.npmjs.org/fixture-peer/-/fixture-peer-1.0.0.tgz",
      integrity: `sha512-${Buffer.alloc(64, 2).toString("base64")}`,
    };
    const directory = join(profilesDirectory, profileName(agent, source, host));
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
    await writeFile(
      join(directory, "package-lock.json"),
      JSON.stringify({ lockfileVersion: 3, packages }),
    );
  }
  const installed = join(root, "installed agent");
  await script(
    installed,
    `console.log(${JSON.stringify(agent === "codex" ? "codex-cli 0.163.0" : "2.1.295 (Claude Code)")})`,
  );
  const npm = join(root, "npm-cli.js");
  await script(
    npm,
    `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(join(root, "npm-calls.jsonl"))},JSON.stringify({args,npmConfigKeys:Object.keys(process.env).filter(k=>/^npm_config_/i.test(k))})+'\\n');
if (process.env.TEST_NPM === 'fail') { console.error('private-registry-token'); process.exit(1); }
if (process.env.TEST_NPM === 'hang') { setInterval(()=>{},1000); }
else {
  const lock = JSON.parse(fs.readFileSync('package-lock.json'));
  for (const [key,value] of Object.entries(lock.packages)) {
    if (!key || value.optional) continue;
    fs.mkdirSync(key,{recursive:true});
    const name = value.name || key.slice(key.lastIndexOf('node_modules/')+13);
    fs.writeFileSync(path.join(key,'package.json'),JSON.stringify({name,version:value.version,type:'module'}));
  }
  const entry = 'node_modules/${adapterPins[agent].adapter}/dist/index.js';
  fs.mkdirSync(path.dirname(entry),{recursive:true});
  fs.writeFileSync(entry,${JSON.stringify(fakeAdapter)});
  const native = 'node_modules/${nativePackage(agent, host).name}';
  if (fs.existsSync(native)) {
    const target = '${host.arch === "arm64" ? "aarch64" : "x86_64"}-${host.os === "darwin" ? "apple-darwin" : host.os === "win32" ? "pc-windows-msvc" : "unknown-linux-musl"}';
    const binary = ${agent === "claude" ? `path.join(native,${JSON.stringify(host.os === "win32" ? "claude.exe" : "claude")})` : `path.join(native,'vendor',target,'bin',${JSON.stringify(host.os === "win32" ? "codex.exe" : "codex")})`};
    fs.mkdirSync(path.dirname(binary),{recursive:true});
    fs.writeFileSync(binary,${JSON.stringify(`#!${process.execPath}\nconsole.log(${JSON.stringify(agent === "codex" ? "codex-cli 0.159.3" : "2.1.293 (Claude Code)")})`)});
    fs.chmodSync(binary,0o700);
  }
}
`,
  );
  const events: AgentPreparationEvent[] = [];
  const options: AgentPreparationOptions = {
    agent,
    cwd,
    profilesDirectory,
    cacheDirectory: join(root, "cache"),
    env: {
      PATH: "",
      npm_execpath: npm,
      npm_config_userconfig: "must-not-read",
      npm_config_cache: "must-not-use",
      [agent === "claude" ? "CLAUDE_CODE_EXECUTABLE" : "CODEX_PATH"]: installed,
    },
    onProgress: (event) => events.push(event),
  };
  const calls = async () =>
    (await readFile(join(root, "npm-calls.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  return { root, options, installed, events, calls };
}

test.each(["claude", "codex"] as const)(
  "%s: preparation smoke initializes an ACP server that does not implement --help, then closes it",
  async (agent) => {
    const { root, options, events } = await fixture(agent);
    const tracePath = join(root, "smoke.jsonl");
    const prepared = await prepareAgent({
      ...options,
      timeoutMs: 3000,
      env: { ...options.env, TEST_ACP_TRACE: tracePath },
    });
    expect(prepared.source).toBe("installed");
    expect(events).toContainEqual(expect.objectContaining({ phase: "smoke", success: true }));
    const trace = (await readFile(tracePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(trace.map(({ method }) => method)).toEqual(["initialize"]);
    expect(() => process.kill(trace[0].pid, 0)).toThrow();
    await expect(readFile(join(options.cwd, "selected.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  },
);

test("aborting from ready never starts a stint handshake", async () => {
  const { options } = await fixture();
  const controller = new AbortController();
  const cancel = vi.fn(async () => {});
  const launch = vi.fn<AgentLauncher>(() => ({
    done: Promise.resolve({ stopReason: "end_turn" }),
    cancel,
  }));
  await expect(
    prepareAgentForStint(
      {
        ...options,
        timeoutMs: 3000,
        signal: controller.signal,
        onProgress(event) {
          if (event.phase === "ready") controller.abort();
        },
      },
      launch,
    ),
  ).rejects.toThrow();
  expect(launch).not.toHaveBeenCalled();
});

test.each(["claude", "codex"] as const)(
  "%s: installed preparation, handshake, cache-only launch and cross-project reuse",
  async (agent) => {
    const { root, options, calls, events } = await fixture(agent);
    const [first, second] = await Promise.all([
      prepareAgentForStint(options),
      prepareAgentForStint(options),
    ]);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      source: "installed",
      reason: "compatible",
      adapterVersion: adapterPins[agent].version,
    });
    const requests = await calls();
    expect(requests).toHaveLength(1);
    expect(requests[0].args).toEqual(
      expect.arrayContaining(["ci", "--ignore-scripts", "--omit=optional", "--global=false"]),
    );
    expect(requests[0].npmConfigKeys).toEqual([]);
    const manifest = JSON.parse(
      await readFile(join(root, "cache/entries", first.cacheKey, "package.json"), "utf8"),
    );
    expect(
      Object.keys(manifest.dependencies ?? {}).some((key) => key.includes(`-${adapterHost().os}-`)),
    ).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({ phase: "smoke", elapsedMs: expect.any(Number), success: true }),
    );
    const launch = agent === "claude" ? createClaudeCodeAgent(options.env).launch : startAgentStint;
    await launch({
      agent,
      cwd: options.cwd,
      preparedAgent: first,
      env: options.env,
      prompt: "Work",
      onEvent: () => {},
    }).done;
    const selection = JSON.parse(await readFile(join(options.cwd, "selected.json"), "utf8"));
    expect(selection[agent]).toBe(first.executable.path);
    const otherProject = join(root, "other-project");
    await mkdir(otherProject);
    await prepareAgent({
      ...options,
      cwd: otherProject,
      env: { ...options.env, TEST_NPM: "fail" },
    });
    expect(await calls()).toHaveLength(1);
  },
);

test.each(["claude", "codex"] as const)(
  "%s: missing CLI selects only pinned host-native fallback",
  async (agent) => {
    const { options, calls } = await fixture(agent);
    const prepared = await prepareAgent({
      ...options,
      env: { ...options.env, CLAUDE_CODE_EXECUTABLE: "absent", CODEX_PATH: "absent" },
    });
    expect(prepared).toMatchObject({
      source: "bundled",
      reason: "missing",
      executable: { version: adapterPins[agent].cliVersion },
    });
    expect(prepared.executable.path).toContain("/entries/");
    expect(await readFile(prepared.executable.path, "utf8")).toContain(
      adapterPins[agent].cliVersion,
    );
    expect(await calls()).toHaveLength(1);
    const closure = JSON.parse(
      await readFile(
        join(options.cacheDirectory as string, "entries", prepared.cacheKey, "package-lock.json"),
        "utf8",
      ),
    );
    expect(JSON.stringify(closure)).not.toContain(agent === "claude" ? "@openai" : "@anthropic-ai");
  },
);

test("CLI changes trigger reselection; Codex 0.148.0 falls below the approved range", async () => {
  const { options, installed, calls } = await fixture();
  const first = await prepareAgent(options);
  await script(installed, "console.log('codex-cli 0.148.0')");
  const next = await prepareAgent(options);
  expect(next).toMatchObject({ source: "bundled", reason: "below-tested-range" });
  expect(next.cacheKey).not.toBe(first.cacheKey);
  expect(await calls()).toHaveLength(2);
});

test("real fake-ACP handshake failure selects bundled with a visible reason", async () => {
  const { options, calls, events } = await fixture();
  const prepared = await prepareAgentForStint({
    ...options,
    env: { ...options.env, TEST_HANDSHAKE: "fail" },
  });
  expect(prepared).toMatchObject({ source: "bundled", reason: "handshake failed" });
  expect(events).toContainEqual(
    expect.objectContaining({ phase: "selected", source: "bundled", reason: "handshake failed" }),
  );
  expect(await calls()).toHaveLength(2);
});

test.each(["claude", "codex"] as const)(
  "%s: installed initialize rejection prepares bundled once with handshake failed reason",
  async (agent) => {
    const { options, calls, events } = await fixture(agent);
    const prepared = await prepareAgentForStint({
      ...options,
      env: { ...options.env, TEST_INITIALIZE: "incompatible" },
    });
    expect(prepared).toMatchObject({ source: "bundled", reason: "handshake failed" });
    expect(
      events.filter((event) => event.phase === "installing" && event.source === "bundled"),
    ).toEqual([expect.objectContaining({ reason: "handshake failed" })]);
    expect(await calls()).toHaveLength(2);
  },
);

test.each([
  ["auth", -32000, "Authentication required"],
  ["authGeneric", -32000, "Invalid request"],
  ["permission", -32001, "Permission denied"],
  ["provider", -32603, "Provider protocol unavailable"],
] as const)(
  "installed initialize %s errors propagate unchanged without bundled preparation",
  async (failure, code, message) => {
    const { options, calls, events } = await fixture();
    await expect(
      prepareAgentForStint({ ...options, env: { ...options.env, TEST_INITIALIZE: failure } }),
    ).rejects.toMatchObject({ code, message });
    expect(events.some((event) => event.source === "bundled")).toBe(false);
    expect(await calls()).toHaveLength(1);
  },
);

test("authentication, permission and provider errors never select a different source", async () => {
  const { options, calls } = await fixture();
  for (const error of [
    new AgentAuthenticationError(codexProfile),
    new Error("Permission denied"),
    new Error("Provider unavailable"),
    new Error("Insufficient balance"),
  ]) {
    const cancel = vi.fn(async () => {});
    const launch: AgentLauncher = () => ({ done: Promise.reject(error), cancel });
    await expect(prepareAgentForStint(options, launch)).rejects.toThrow(error);
    expect(cancel).toHaveBeenCalledOnce();
  }
  expect(await calls()).toHaveLength(1);
});

test("a signal aborted while starting the handshake cancels it even before the listener is attached", async () => {
  const { options } = await fixture();
  const controller = new AbortController();
  const cancel = vi.fn(async () => {});
  const launch: AgentLauncher = () => {
    controller.abort();
    return { done: Promise.resolve({ stopReason: "cancelled" }), cancel };
  };
  await expect(
    prepareAgentForStint({ ...options, signal: controller.signal }, launch),
  ).rejects.toThrow();
  expect(cancel).toHaveBeenCalledOnce();
});

test("corruption and unsafe entries fail closed before executing, preserving a good entry", async () => {
  const { options } = await fixture();
  const prepared = await prepareAgent(options);
  const good = await readFile(prepared.adapterEntry, "utf8");
  await writeFile(prepared.adapterEntry, `${good}\n// corrupted`);
  await expect(prepareAgent(options)).rejects.toThrow("integrity mismatch");
  await writeFile(prepared.adapterEntry, good);
  expect((await prepareAgent(options)).cacheKey).toBe(prepared.cacheKey);
  await chmod(prepared.adapterEntry, 0o666);
  await expect(prepareAgent(options)).rejects.toThrow("shared write permissions");
});

test("failed npm, missing locks, and cancellation leave no published/partial entry and retry unchanged pins", async () => {
  const { options, calls } = await fixture();
  await expect(
    prepareAgent({ ...options, env: { ...options.env, TEST_NPM: "fail" } }),
  ).rejects.toThrow("retry with the same released pins");
  expect(await readdir(join(options.cacheDirectory as string, "entries"))).toEqual([]);
  const controller = new AbortController();
  const cancelled = prepareAgent({
    ...options,
    env: { ...options.env, TEST_NPM: "hang" },
    signal: controller.signal,
    onProgress(event) {
      if (event.phase === "installing") setTimeout(() => controller.abort(), 50);
    },
  });
  await expect(cancelled).rejects.toThrow();
  expect(await readdir(join(options.cacheDirectory as string, "entries"))).toEqual([]);
  const prepared = await prepareAgent(options);
  expect(await calls()).toHaveLength(3);
  const lockPath = join(options.profilesDirectory as string, "codex/installed/package-lock.json");
  const released = await readFile(lockPath);
  const changed = JSON.parse(released.toString());
  changed.packages["node_modules/fixture-peer"].resolved =
    "https://registry.npmjs.org/fixture-peer/-/another-reviewed-artifact.tgz";
  await writeFile(lockPath, JSON.stringify(changed));
  await expect(
    prepareAgent({ ...options, env: { ...options.env, TEST_NPM: "fail" } }),
  ).rejects.toThrow("retry with the same released pins");
  expect(await readdir(join(options.cacheDirectory as string, "entries"))).toEqual([
    prepared.cacheKey,
  ]);
  await writeFile(lockPath, released);
  await expect(
    prepareAgent({ ...options, profilesDirectory: join(options.cwd, "missing-profiles") }),
  ).rejects.toThrow("Missing released adapter profile/lock");
  expect((await prepareAgent(options)).cacheKey).toBe(prepared.cacheKey);
});

test("a released lock without artifact integrity is rejected before npm", async () => {
  const { options } = await fixture();
  const lockPath = join(options.profilesDirectory as string, "codex/installed/package-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  delete lock.packages["node_modules/@openai/codex"].integrity;
  await writeFile(lockPath, JSON.stringify(lock));
  await expect(prepareAgent(options)).rejects.toThrow("SHA-512 integrity");
  lock.packages["node_modules/@openai/codex"].integrity =
    `sha512-${Buffer.alloc(64, 1).toString("base64")}`;
  delete lock.packages["node_modules/fixture-peer"];
  await writeFile(lockPath, JSON.stringify(lock));
  await expect(prepareAgent(options)).rejects.toThrow("dependency closure");
  delete lock.packages["node_modules/@openai/codex"].peerDependencies;
  lock.packages["node_modules/@openai/codex"].optionalDependencies = { "missing-native": "1.0.0" };
  await writeFile(lockPath, JSON.stringify(lock));
  await expect(prepareAgent(options)).rejects.toThrow("dependency closure");
});

test("cache roots cannot be project directories or symlinks", async () => {
  const { root, options } = await fixture();
  await expect(
    prepareAgent({ ...options, cacheDirectory: join(options.cwd, "cache") }),
  ).rejects.toThrow("outside the project");
  await mkdir(join(root, "actual"));
  await symlink(join(root, "actual"), join(root, "alias"));
  await expect(prepareAgent({ ...options, cacheDirectory: join(root, "alias") })).rejects.toThrow(
    "real directory",
  );
  await writeFile(join(root, "actual/unrelated"), "preserve");
  await expect(prepareAgent({ ...options, cacheDirectory: join(root, "actual") })).rejects.toThrow(
    "nonempty directory",
  );
  expect(await readdir(join(root, "actual"))).toEqual(["unrelated"]);
});

test("separate processes serialize the same identity and recover only a dead owner", async () => {
  const { root, options, calls } = await fixture();
  const module = new URL("./adapter-cache.ts", import.meta.url).href;
  const code = `const {prepareAgent}=await import(${JSON.stringify(module)}); await prepareAgent(${JSON.stringify({ ...options, onProgress: undefined })});`;
  const launch = () => {
    const child = spawn(process.execPath, sourceNodeArgs("--input-type=module", "-e", code), {
      stdio: "pipe",
    });
    child.stderr.resume();
    child.stdout.resume();
    return once(child, "exit");
  };
  expect(await Promise.all([launch(), launch()])).toEqual([
    [0, null],
    [0, null],
  ]);
  expect(await calls()).toHaveLength(1);
  const first = await prepareAgent(options);
  const owner = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  const pid = owner.pid;
  await once(owner, "exit");
  await writeFile(
    join(root, "cache/locks", `${first.cacheKey}.lock-00000000-0000-0000-0000-000000000000`),
    JSON.stringify({ pid, token: "00000000-0000-0000-0000-000000000000", ticket: 1 }),
    { mode: 0o600 },
  );
  expect((await prepareAgent(options)).cacheKey).toBe(first.cacheKey);
  expect(await calls()).toHaveLength(1);
  expect(await readdir(join(root, "cache/locks"))).toEqual([]);
});

test("npm JS entry lookup supports the Windows npm.cmd layout without a shell", async () => {
  const { root } = await fixture();
  await writeFile(join(root, "npm.cmd"), "unused shim");
  const expected = join(root, "node_modules/npm/bin/npm-cli.js");
  await script(expected, "");
  expect(await npmEntry({ Path: root }, "win32")).toBe(expected);
  await script(join(root, "codex.exe"), "");
  expect(findExecutable("codex", { Path: root }, "win32")).toBe(join(root, "codex.exe"));
});
