// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  lstat,
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
  adapterProfilesDirectory,
  adapterPins,
  nativePackage,
  profileManifest,
  profileName,
} from "./adapter-profiles.js";
import {
  prepareAgent,
  releasedProfile,
  type AgentPreparationEvent,
  type AgentPreparationOptions,
} from "./adapter-cache.js";
import {
  prepareAgentForStint,
  createCodexAgent,
  createClaudeCodeAgent,
  startAgentStint,
  AgentAuthenticationError,
  type AgentLauncher,
} from "./index.js";
import { codexProfile } from "./profiles.js";
import { npmEntry } from "./npm.js";
import { sourceNodeArgs } from "./source-node-args.js";
import { findExecutable } from "./executable.js";

// Real npm/CLI/ACP child startup must tolerate a loaded coordinator machine.
vi.setConfig({ testTimeout: 60_000 });

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
  if (process.env.TEST_ACP_TRACE) fs.appendFileSync(process.env.TEST_ACP_TRACE, JSON.stringify({pid:process.pid,method:request.method,claude:process.env.CLAUDE_CODE_EXECUTABLE,codex:process.env.CODEX_PATH})+'\\n');
  if (!('id' in request)) continue;
  if (request.method === 'initialize' && process.env.TEST_SELECTED_AGENT) {
    const {execFileSync} = await import('node:child_process');
    execFileSync(process.env[process.env.TEST_SELECTED_AGENT === 'claude' ? 'CLAUDE_CODE_EXECUTABLE' : 'CODEX_PATH'], ['--version']);
  }
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
  const home = join(root, "home");
  await mkdir(home);
  await writeFile(join(home, ".npmrc"), "developer-config-must-survive");
  await writeFile(join(home, "credentials"), "fixture-login-secret");
  const npm = join(root, "npm-cli.js");
  await script(
    npm,
    `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const cache = args[args.indexOf('--cache')+1];
fs.mkdirSync(cache,{recursive:true});
fs.writeFileSync(path.join(cache,'download.tgz'),'fixture tarball');
const lock = JSON.parse(fs.readFileSync('package-lock.json'));
const packages = Object.keys(lock.packages).filter(key=>key && !lock.packages[key].optional);
fs.appendFileSync(${JSON.stringify(join(root, "npm-calls.jsonl"))},JSON.stringify({pid:process.pid,args,cache,packages,lock,configs:['--userconfig','--globalconfig'].map(flag=>fs.readFileSync(args[args.indexOf(flag)+1],'utf8')),npmConfigKeys:Object.keys(process.env).filter(k=>/^npm_config_/i.test(k))})+'\\n');
if (['fail','offline','integrity','disk-full'].includes(process.env.TEST_NPM)) { console.error(process.env.TEST_NPM === 'integrity' ? 'EINTEGRITY' : process.env.TEST_NPM === 'disk-full' ? 'ENOSPC' : 'ENETUNREACH'); console.error('private-registry-token'); process.exit(1); }
if (process.env.TEST_NPM === 'hang') { setInterval(()=>{},1000); }
else {
  for (const [key,value] of Object.entries(lock.packages)) {
    if (!key || value.optional || (process.env.TEST_NPM === 'missing-native' && key === 'node_modules/${nativePackage(agent, host).name}')) continue;
    fs.mkdirSync(key,{recursive:true});
    const name = value.name || key.slice(key.lastIndexOf('node_modules/')+13);
    fs.writeFileSync(path.join(key,'package.json'),JSON.stringify({name,version:value.version,type:'module'}));
  }
  if (process.env.TEST_NPM === 'modify-lock') fs.writeFileSync('package-lock.json','{}');
  if (process.env.TEST_NPM === 'wrong-version') fs.writeFileSync('node_modules/fixture-peer/package.json',JSON.stringify({name:'fixture-peer',version:'9.0.0'}));
  if (process.env.TEST_NPM === 'escape') fs.symlinkSync(process.env.TEST_ESCAPE,'escaped');
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
      HOME: home,
      USERPROFILE: home,
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
      // ACP initialize and child close are the readiness signals; allow slow OS scheduling.
      stallTimeoutMs: 60_000,
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
  const confirmed: string[] = [];
  const prepared = await prepareAgentForStint({
    ...options,
    beforePrepare: async (event) => {
      confirmed.push(event.source);
      if (event.source === "bundled") expect(await calls()).toHaveLength(1);
    },
    env: { ...options.env, TEST_HANDSHAKE: "fail" },
  });
  expect(prepared).toMatchObject({ source: "bundled", reason: "handshake failed" });
  expect(confirmed).toEqual(["installed", "bundled"]);
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
  let cancelAfterStartup: Promise<void> | undefined;
  const cancelled = prepareAgent({
    ...options,
    env: { ...options.env, TEST_NPM: "hang" },
    signal: controller.signal,
    onProgress(event) {
      if (event.phase === "installing")
        cancelAfterStartup = expect
          .poll(calls, { timeout: 30_000 })
          .toHaveLength(2)
          .then(() => controller.abort());
    },
  });
  await expect(cancelled).rejects.toThrow();
  await cancelAfterStartup;
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

test("source confirmation precedes cache writes/downloads and can cancel before preparation", async () => {
  const { options, calls } = await fixture();
  const controller = new AbortController();
  let confirmed = false;
  await expect(
    prepareAgent({
      ...options,
      signal: controller.signal,
      beforePrepare: async (event, signal) => {
        expect(event).toMatchObject({
          source: "installed",
          reason: "compatible",
          executable: { version: "0.163.0" },
        });
        await expect(calls()).rejects.toMatchObject({ code: "ENOENT" });
        confirmed = true;
        controller.abort();
        signal.throwIfAborted();
      },
    }),
  ).rejects.toThrow();
  expect(confirmed).toBe(true);
  await expect(calls()).rejects.toMatchObject({ code: "ENOENT" });
});

test("every shipped bundled download estimate matches its exact host-profile lock", async () => {
  const directory = adapterProfilesDirectory();
  const estimates = JSON.parse(await readFile(join(directory, "download-sizes.json"), "utf8"));
  expect(Object.keys(estimates)).toHaveLength(14);
  for (const [name, estimate] of Object.entries(estimates) as [
    string,
    { lockDigest: string; downloadBytes: number },
  ][]) {
    const lockBytes = await readFile(join(directory, name, "package-lock.json"));
    expect(estimate.lockDigest).toBe(createHash("sha256").update(lockBytes).digest("hex"));
    expect(estimate.downloadBytes).toBeGreaterThan(100_000_000);
  }
  expect(estimates["codex/bundled-darwin-arm64"].downloadBytes).toBe(136113744);
});

test("bundled confirmation carries the selected lock's download size before npm; stale metadata fails closed", async () => {
  const { options } = await fixture();
  const host = adapterHost();
  const name = profileName("codex", "bundled", host);
  const profile = await releasedProfile(options, "bundled", host);
  const estimatesPath = join(options.profilesDirectory as string, "download-sizes.json");
  const estimate = { lockDigest: profile.lockDigest, downloadBytes: 136113744 };
  await writeFile(estimatesPath, JSON.stringify({ [name]: estimate }));
  const events: AgentPreparationEvent[] = [];
  const stop = new AbortController();
  await expect(
    prepareAgent(
      {
        ...options,
        signal: stop.signal,
        onProgress: (event) => events.push(event),
        beforePrepare: async (event) => {
          expect(event.downloadBytes).toBe(136113744);
          stop.abort();
        },
      },
      { reason: "handshake failed" },
    ),
  ).rejects.toThrow();
  expect(events[0]).toMatchObject({
    source: "bundled",
    phase: "selected",
    downloadBytes: 136113744,
  });
  await expect(readFile(join(options.cwd, "../npm-calls.jsonl"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  await writeFile(estimatesPath, JSON.stringify({ [name]: { ...estimate, lockDigest: "stale" } }));
  await expect(prepareAgent(options, { reason: "handshake failed" })).rejects.toMatchObject({
    coreText: { code: "agent.downloadSizeUnavailable" },
  });
});

async function assertPrivateState(root: string, installed: string, originalCli: Buffer) {
  expect(await readFile(installed)).toEqual(originalCli);
  expect(await readdir(join(root, "project"))).toEqual([]);
  expect(await readFile(join(root, "home/.npmrc"), "utf8")).toBe("developer-config-must-survive");
  expect(await readFile(join(root, "home/credentials"), "utf8")).toBe("fixture-login-secret");
  async function inspect(directory: string): Promise<void> {
    for (const name of await readdir(directory)) {
      const path = join(directory, name);
      const stat = await lstat(path);
      if (stat.isDirectory()) await inspect(path);
      else if (stat.isFile())
        expect(await readFile(path, "utf8")).not.toMatch(
          /fixture-login-secret|private-registry-token/,
        );
    }
  }
  await inspect(join(root, "cache"));
}

test.each(["claude", "codex"] as const)(
  "%s: offline installed/bundled warm reuse crosses projects and root versions without npm",
  async (agent) => {
    const { root, options, calls, installed } = await fixture(agent);
    const originalCli = await readFile(installed);
    const installedEntry = await prepareAgent(options);
    const bundledOptions = {
      ...options,
      env: { ...options.env, CLAUDE_CODE_EXECUTABLE: "/absent", CODEX_PATH: "/absent" },
    };
    const bundledEntry = await prepareAgent(bundledOptions);
    const otherProject = join(root, "other-project");
    await mkdir(otherProject);
    await writeFile(
      join(otherProject, "package.json"),
      '{"name":"different-root","version":"99.0.0"}',
    );
    for (const [selected, prepared] of [
      [options, installedEntry],
      [bundledOptions, bundledEntry],
    ] as const) {
      const reused = await prepareAgent({
        ...selected,
        cwd: otherProject,
        env: { ...selected.env, TEST_NPM: "offline" },
      });
      expect(reused).toEqual(prepared);
    }
    const requests = await calls();
    expect(requests).toHaveLength(2);
    const hostNative = `node_modules/${nativePackage(agent, adapterHost()).name}`;
    expect(
      requests[0].packages.filter((name: string) => /-(darwin|linux|win32)-/.test(name)),
    ).toEqual([]);
    expect(
      requests[1].packages.filter((name: string) => /-(darwin|linux|win32)-/.test(name)),
    ).toEqual([hostNative]);
    for (const request of requests) {
      expect(request.args[0]).toBe("ci");
      expect(request.args).toEqual(
        expect.arrayContaining([
          "--ignore-scripts",
          "--omit=optional",
          "--global=false",
          "--registry=https://registry.npmjs.org",
          "--logs-max=0",
        ]),
      );
      expect(request.configs).toEqual(["", ""]);
      expect(request.cache).toBe(
        join(
          root,
          "cache/npm-cache",
          request === requests[0] ? installedEntry.cacheKey : bundledEntry.cacheKey,
        ),
      );
      expect(request.npmConfigKeys).toEqual([]);
      expect(request.packages).toEqual(Object.keys(request.lock.packages).filter(Boolean));
      await expect(lstat(request.cache)).rejects.toMatchObject({ code: "ENOENT" });
    }
    await assertPrivateState(root, installed, originalCli);
    const launch = agent === "claude" ? createClaudeCodeAgent(options.env).launch : startAgentStint;
    await launch({
      agent,
      cwd: otherProject,
      preparedAgent: bundledEntry,
      env: options.env,
      prompt: "Fixture work",
      onEvent: () => {},
    }).done;
    expect(JSON.parse(await readFile(join(otherProject, "selected.json"), "utf8"))[agent]).toBe(
      bundledEntry.executable.path,
    );
  },
);

test.each(["installed", "bundled"] as const)(
  "offline cold %s miss fails honestly and retries the identical closure",
  async (source) => {
    const { root, options, calls, installed, events } = await fixture();
    const originalCli = await readFile(installed);
    const env = { ...options.env, ...(source === "bundled" ? { CODEX_PATH: "/absent" } : {}) };
    await expect(
      prepareAgent({ ...options, env: { ...env, TEST_NPM: "offline" } }),
    ).rejects.toThrow("retry with the same released pins");
    expect(events.some((event) => event.phase === "ready")).toBe(false);
    expect(await readdir(join(root, "cache/entries"))).toEqual([]);
    expect(await readdir(join(root, "cache/locks"))).toEqual([]);
    const [failed] = await calls();
    expect(await readFile(join(failed.cache, "download.tgz"), "utf8")).toBe("fixture tarball");
    const prepared = await prepareAgent({ ...options, env });
    const requests = await calls();
    expect(prepared.source).toBe(source);
    expect(requests[1].lock).toEqual(failed.lock);
    expect(requests[1].cache).toBe(failed.cache);
    await expect(lstat(failed.cache)).rejects.toMatchObject({ code: "ENOENT" });
    await assertPrivateState(root, installed, originalCli);
  },
);

test.each(["claude", "codex"] as const)(
  "%s: an installed-only cached adapter cannot satisfy an offline native fallback",
  async (agent) => {
    const { root, options, calls, events } = await fixture(agent);
    const good = await prepareAgent(options);
    events.length = 0;
    const fallback = {
      ...options,
      env: { ...options.env, TEST_INITIALIZE: "incompatible", TEST_NPM: "offline" },
    };
    await expect(prepareAgentForStint(fallback)).rejects.toThrow("Check network and disk space");
    expect(events).toContainEqual(
      expect.objectContaining({
        source: "bundled",
        reason: "handshake failed",
        phase: "installing",
      }),
    );
    expect(events.some((event) => event.source === "bundled" && event.phase === "ready")).toBe(
      false,
    );
    expect(await readdir(join(root, "cache/entries"))).toEqual([good.cacheKey]);
    const requests = await calls();
    expect(requests).toHaveLength(2);
    expect(requests[1].packages).toContain(
      `node_modules/${nativePackage(agent, adapterHost()).name}`,
    );
    const retry = await prepareAgentForStint({
      ...fallback,
      env: { ...fallback.env, TEST_NPM: undefined },
    });
    expect(retry).toMatchObject({ source: "bundled", reason: "handshake failed" });
    expect((await calls())[2].lock).toEqual(requests[1].lock);
  },
);

test.each([
  ["0.148.0", "below-tested-range"],
  ["1.0.0", "incompatible"],
  ["0.163.0-beta.1", "unparseable"],
] as const)("CLI %s selects exactly one pinned native payload (%s)", async (version, reason) => {
  const { options, installed, calls } = await fixture();
  await script(installed, `console.log('codex-cli ${version}')`);
  const prepared = await prepareAgent(options);
  expect(prepared).toMatchObject({ source: "bundled", reason });
  const requests = await calls();
  expect(requests).toHaveLength(1);
  expect(
    requests[0].packages.filter((name: string) => /-(darwin|linux|win32)-/.test(name)),
  ).toEqual([`node_modules/${nativePackage("codex", adapterHost()).name}`]);
});

test.each([
  ["integrity", "Frozen npm preparation failed"],
  ["disk-full", "Check network and disk space"],
  ["modify-lock", "npm modified the released profile/lock"],
  ["wrong-version", "Installed package differs"],
  ["missing-native", "Required locked package missing/escaped"],
  ["escape", "symlink escapes entry"],
] as const)(
  "%s removes only failed staging, keeps prior good entries and retry downloads",
  async (failure, message) => {
    const { root, options, calls, installed, events } = await fixture();
    const originalCli = await readFile(installed);
    const good = await prepareAgent(options);
    const goodCompletion = await readFile(
      join(root, "cache/entries", good.cacheKey, "complete.json"),
    );
    const abandoned = join(root, "cache/entries/unrelated.staging-abandoned");
    await mkdir(abandoned);
    await writeFile(join(abandoned, "keep"), "preserve");
    events.length = 0;
    await expect(
      prepareAgent({
        ...options,
        env: { ...options.env, CODEX_PATH: "/absent", TEST_NPM: failure, TEST_ESCAPE: installed },
      }),
    ).rejects.toThrow(message);
    expect(events.some((event) => event.phase === "ready")).toBe(false);
    expect(await readdir(join(root, "cache/entries"))).toEqual(
      [good.cacheKey, "unrelated.staging-abandoned"].sort(),
    );
    expect(await readFile(join(root, "cache/entries", good.cacheKey, "complete.json"))).toEqual(
      goodCompletion,
    );
    expect(await readFile(join(abandoned, "keep"), "utf8")).toBe("preserve");
    expect(await readdir(join(root, "cache/locks"))).toEqual([]);
    const failed = (await calls())[1];
    expect(await readFile(join(failed.cache, "download.tgz"), "utf8")).toBe("fixture tarball");
    await prepareAgent({ ...options, env: { ...options.env, CODEX_PATH: "/absent" } });
    expect((await calls())[2].lock).toEqual(failed.lock);
    await expect(lstat(failed.cache)).rejects.toMatchObject({ code: "ENOENT" });
    await assertPrivateState(root, installed, originalCli);
  },
);

test("publication clears only its own npm downloads, preserving a different key's retry and the developer cache", async () => {
  const { root, options, calls } = await fixture();
  const developerCache = join(root, "developer-npm-cache");
  await mkdir(developerCache);
  await writeFile(join(developerCache, "keep"), "developer tarball");
  await expect(
    prepareAgent({
      ...options,
      env: { ...options.env, TEST_NPM: "offline", npm_config_cache: developerCache },
    }),
  ).rejects.toThrow();
  const [failed] = await calls();
  await prepareAgent({
    ...options,
    env: { ...options.env, CODEX_PATH: "/absent", npm_config_cache: developerCache },
  });
  expect(await readFile(join(failed.cache, "download.tgz"), "utf8")).toBe("fixture tarball");
  expect(await readFile(join(developerCache, "keep"), "utf8")).toBe("developer tarball");
  await prepareAgent(options);
  expect(await readdir(join(root, "cache/npm-cache"))).toEqual([]);
});

test("timeout after explicit npm startup releases the lock and staging without destroying retry downloads", async () => {
  const { root, options, calls } = await fixture();
  const clock = vi.spyOn(performance, "now");
  const pending = prepareAgent({ ...options, env: { ...options.env, TEST_NPM: "hang" } });
  const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
  try {
    await expect.poll(calls, { timeout: 30_000 }).toHaveLength(1);
    // Let the first sample see npm's startup writes, then advance only the monotonic clock.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const now = performance.now();
    clock.mockReturnValue(now + 61_000);
    await rejected;
  } finally {
    clock.mockRestore();
  }
  expect(await readdir(join(root, "cache/entries"))).toEqual([]);
  expect(await readdir(join(root, "cache/locks"))).toEqual([]);
  const prepared = await prepareAgent(options);
  expect((await calls())[1].cache).toBe(join(root, "cache/npm-cache", prepared.cacheKey));
});

test("a living old owner is never stolen and an incomplete published entry never executes", async () => {
  const { root, options, calls, events } = await fixture();
  const good = await prepareAgent(options);
  const token = "00000000-0000-0000-0000-000000000000";
  const ownerPath = join(root, "cache/locks", `${good.cacheKey}.lock-${token}`);
  const owner = JSON.stringify({ pid: process.pid, token, ticket: 1 });
  await writeFile(ownerPath, owner, { mode: 0o600 });
  const controller = new AbortController();
  const waiting = prepareAgent({ ...options, signal: controller.signal });
  const rejected = expect(waiting).rejects.toThrow();
  await expect
    .poll(async () => readdir(join(root, "cache/locks")), { timeout: 30_000 })
    .toHaveLength(2);
  controller.abort();
  await rejected;
  expect(await readFile(ownerPath, "utf8")).toBe(owner);
  await rm(ownerPath);
  await rm(join(root, "cache/entries", good.cacheKey, "complete.json"));
  events.length = 0;
  await expect(prepareAgent(options)).rejects.toMatchObject({ code: "ENOENT" });
  expect(events.some((event) => ["smoke", "ready"].includes(event.phase))).toBe(false);
  expect(await calls()).toHaveLength(1);
});

test("unsafe ownership and symlinked npm cache are refused without deleting their targets", async () => {
  const { root, options } = await fixture();
  await prepareAgent(options);
  const originalUid = process.getuid?.();
  if (originalUid !== undefined) {
    const uid = vi.spyOn(process, "getuid").mockReturnValue(originalUid + 1);
    try {
      await expect(prepareAgent(options)).rejects.toThrow("Unsafe adapter cache ownership");
    } finally {
      uid.mockRestore();
    }
  }
  await rm(join(root, "cache/npm-cache"), { recursive: true });
  const target = join(root, "developer-npm-cache");
  await mkdir(target);
  await writeFile(join(target, "keep"), "preserve");
  await symlink(target, join(root, "cache/npm-cache"));
  await expect(
    prepareAgent({ ...options, env: { ...options.env, CODEX_PATH: "/absent" } }),
  ).rejects.toThrow("real directory");
  expect(await readFile(join(target, "keep"), "utf8")).toBe("preserve");
});

test("killing a preparing process leaves ignored staging; a retry reclaims its dead lock and publishes once", async () => {
  const { root, options, calls } = await fixture();
  const module = new URL("./adapter-cache.ts", import.meta.url).href;
  const childOptions = {
    ...options,
    env: { ...options.env, TEST_NPM: "hang" },
    onProgress: undefined,
  };
  const code = `const {prepareAgent}=await import(${JSON.stringify(module)}); await prepareAgent(${JSON.stringify(childOptions)});`;
  const child = spawn(process.execPath, sourceNodeArgs("--input-type=module", "-e", code), {
    stdio: "ignore",
  });
  const exited = once(child, "exit");
  let npmPid: number | undefined;
  try {
    await expect.poll(calls, { timeout: 30_000 }).toHaveLength(1);
    npmPid = (await calls())[0].pid;
    const [staging] = await readdir(join(root, "cache/entries"));
    expect(staging).toContain(".staging-");
    expect(await readdir(join(root, "cache/locks"))).toHaveLength(1);
    child.kill("SIGKILL");
    expect(await exited).toEqual([null, "SIGKILL"]);
    // The killed parent's npm child is ours too; never leave an orphan fixture process behind.
    if (npmPid) process.kill(npmPid, "SIGKILL");
    npmPid = undefined;
    await writeFile(join(root, "cache/entries", staging, "abandoned"), "never execute");
    const prepared = await prepareAgent(options);
    expect(await readdir(join(root, "cache/entries"))).toEqual([prepared.cacheKey, staging].sort());
    expect(await readdir(join(root, "cache/locks"))).toEqual([]);
    expect(await readFile(join(root, "cache/entries", staging, "abandoned"), "utf8")).toBe(
      "never execute",
    );
    expect((await calls())[1].lock).toEqual((await calls())[0].lock);
    await prepareAgent({ ...options, env: { ...options.env, TEST_NPM: "offline" } });
    expect(await calls()).toHaveLength(2);
  } finally {
    child.kill("SIGKILL");
    if (npmPid) process.kill(npmPid, "SIGKILL");
    await exited;
  }
});

test.each(["manifest", "lock-root", "pin", "artifact"])(
  "mismatched released %s fails before npm/cache mutation",
  async (part) => {
    const { root, options, calls } = await fixture();
    const directory = join(options.profilesDirectory as string, "codex/installed");
    if (part === "manifest") {
      const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
      manifest.dependencies["@openai/codex"] = "99.0.0";
      await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
    } else {
      const path = join(directory, "package-lock.json");
      const lock = JSON.parse(await readFile(path, "utf8"));
      if (part === "lock-root") lock.packages[""].dependencies = {};
      if (part === "pin") lock.packages["node_modules/@openai/codex"].version = "99.0.0";
      if (part === "artifact")
        lock.packages["node_modules/@openai/codex"].resolved =
          "https://unreviewed.invalid/package.tgz";
      await writeFile(path, JSON.stringify(lock));
    }
    await expect(prepareAgent(options)).rejects.toThrow(/pinned|pin|unsafe released/);
    await expect(calls()).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(join(root, "cache"))).rejects.toMatchObject({ code: "ENOENT" });
  },
);

test.each(["claude", "codex"] as const)(
  "%s: bundled smoke and cold/warm stint launches override inherited bogus executables",
  async (agent) => {
    const { root, options, calls } = await fixture(agent);
    const tracePath = join(root, "selected-launches.jsonl");
    const env = {
      ...options.env,
      CLAUDE_CODE_EXECUTABLE: "/nonexistent/claude",
      CODEX_PATH: "/nonexistent/codex",
      TEST_ACP_TRACE: tracePath,
      TEST_SELECTED_AGENT: agent,
    };
    const launch =
      agent === "claude" ? createClaudeCodeAgent(env).launch : createCodexAgent({ env }).launch;
    for (let attempt = 0; attempt < 2; attempt++) {
      const prepared = await prepareAgentForStint({ ...options, env });
      expect(prepared.source).toBe("bundled");
      const stint = launch({
        agent,
        cwd: options.cwd,
        preparedAgent: prepared,
        prompt: "Work",
        onEvent: () => {},
      });
      await stint.ready;
      await stint.done;
      expect(JSON.parse(await readFile(join(options.cwd, "selected.json"), "utf8"))[agent]).toBe(
        prepared.executable.path,
      );
    }
    const trace = (await readFile(tracePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(trace.filter(({ method }) => method === "initialize")).toHaveLength(4);
    for (const entry of trace) expect(entry[agent]).toContain("/entries/");
    expect(await calls()).toHaveLength(1);
  },
);

test.each(["claude", "codex"] as const)(
  "%s: stint-start handshake receives the explicit executable after inherited env changes",
  async (agent) => {
    const { options } = await fixture(agent);
    const override = agent === "claude" ? "CLAUDE_CODE_EXECUTABLE" : "CODEX_PATH";
    const launch = vi.fn<AgentLauncher>((stint) => {
      expect(stint.env?.[override]).toBe(stint.preparedAgent?.executable.path);
      return (agent === "claude" ? createClaudeCodeAgent().launch : startAgentStint)(stint);
    });
    await prepareAgentForStint(
      {
        ...options,
        onProgress(event) {
          if (event.phase === "ready" && options.env) options.env[override] = "/nonexistent/agent";
        },
      },
      launch,
    );
    expect(launch).toHaveBeenCalledOnce();
  },
);

test.each(["claude", "codex"] as const)(
  "%s: confirmation cannot exhaust a total deadline before cold or warm smoke",
  async (agent) => {
    const { options } = await fixture(agent);
    const originalTimeout = AbortSignal.timeout;
    const deadline = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation((ms) => (ms === 300_000 ? deadline.signal : originalTimeout(ms)));
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const prepared = await prepareAgent({
          ...options,
          env: {
            ...options.env,
            CLAUDE_CODE_EXECUTABLE: "/nonexistent/claude",
            CODEX_PATH: "/nonexistent/codex",
          },
          beforePrepare: async (_event, signal) => {
            deadline.abort(
              new DOMException(
                "Old total deadline expired while awaiting confirmation",
                "TimeoutError",
              ),
            );
            expect(signal.aborted).toBe(false);
          },
        });
        expect(prepared.source).toBe("bundled");
      }
    } finally {
      timeout.mockRestore();
    }
  },
);
