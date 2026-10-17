// SPDX-License-Identifier: Apache-2.0
import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Writable } from "node:stream";
import { promisify } from "node:util";
import {
  adapterHost,
  adapterPins,
  adapterProfilesDirectory,
  nativePackage,
  profileManifest,
  profileName,
  type AdapterHost,
} from "./adapter-profiles.js";
import { findExecutable, selectAgentSource, type CachedAgent } from "./executable.js";
import { isolatedNpmArgs, isolatedNpmEnvironment, runNpm } from "./npm.js";
import { toAcpReadable } from "./stdio.js";

export type AgentSourceReason = ReturnType<typeof selectAgentSource>["reason"] | "handshake failed";
export type AgentPreparationEvent = {
  agent: CachedAgent;
  adapterVersion: string;
  phase: "selected" | "waiting" | "installing" | "verifying" | "smoke" | "ready";
  source: "installed" | "bundled";
  reason: AgentSourceReason;
  elapsedMs?: number;
  success?: boolean;
  executable?: { path: string; version?: string; identity?: string };
};
export type PreparedAgent = {
  agent: CachedAgent;
  source: "installed" | "bundled";
  reason: AgentSourceReason;
  executable: { path: string; version: string; identity: string };
  adapterEntry: string;
  adapterVersion: string;
  cacheKey: string;
  lockDigest: string;
};
export type AgentPreparationOptions = {
  agent: CachedAgent;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  cacheDirectory?: string;
  profilesDirectory?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (event: AgentPreparationEvent) => void;
  beforePrepare?: (event: AgentPreparationEvent, signal: AbortSignal) => Promise<void>;
};

export class InstalledAgentInitializationError extends Error {}

export function isHandshakeIncompatibility(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    // ACP authentication-required can carry a generic protocol message.
    !(error instanceof Error && "code" in error && error.code === -32000) &&
    !/auth|permission|denied|forbidden|provider|rate.limit|quota|network|connect|fetch|credential|login|sign.in|billing|usage.limit/i.test(
      message,
    ) &&
    /protocol|method.*(?:not found|unsupported)|invalid (?:request|params|response)|does not offer|exited before|transport closed|took longer/i.test(
      message,
    )
  );
}

function inside(directory: string, path: string): boolean {
  const offset = relative(directory, path);
  return (
    offset === "" || (!isAbsolute(offset) && offset !== ".." && !offset.startsWith(`..${sep}`))
  );
}
const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";
const executableIdentity = (path: string, stat: Awaited<ReturnType<typeof lstat>>) =>
  `${path}:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;

async function fileDigest(path: string, signal: AbortSignal): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, { signal })) hash.update(chunk);
  return hash.digest("hex");
}

async function owned(path: string) {
  const stat = await lstat(path);
  if (
    (process.getuid && stat.uid !== process.getuid()) ||
    (!stat.isSymbolicLink() && process.platform !== "win32" && stat.mode & 0o022)
  )
    throw new Error(`Unsafe adapter cache ownership or shared write permissions: ${path}`);
  return stat;
}

async function privateDirectory(path: string): Promise<string> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  if (!(await owned(path)).isDirectory())
    throw new Error(`Adapter cache must be a real directory: ${path}`);
  const canonical = await realpath(path);
  await windowsOwnership(canonical, false);
  // Canonical system aliases (e.g. /tmp on macOS) are fine; the owned directory itself cannot be a symlink.
  return canonical;
}

async function windowsOwnership(path: string, recursive: boolean): Promise<void> {
  if (process.platform !== "win32") return;
  // Node's uid/mode bits do not enforce Windows ACLs. Refuse unsafe ACLs or a missing checker.
  const command = `
$ErrorActionPreference = 'Stop'
$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$trusted = @($me, 'S-1-5-18', 'S-1-5-32-544')
$write = [System.Security.AccessControl.FileSystemRights]::Write -bor [System.Security.AccessControl.FileSystemRights]::Delete -bor [System.Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [System.Security.AccessControl.FileSystemRights]::ChangePermissions -bor [System.Security.AccessControl.FileSystemRights]::TakeOwnership
$items = @(Get-Item -LiteralPath $env:STINTWORK_OWNED_CACHE -Force)
if ($env:STINTWORK_CHECK_RECURSIVE -eq '1') { $items += @(Get-ChildItem -LiteralPath $env:STINTWORK_OWNED_CACHE -Recurse -Force) }
foreach ($item in $items) {
  $acl = Get-Acl -LiteralPath $item.FullName
  if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $me) { throw 'owner' }
  foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq 'Allow' -and ($rule.FileSystemRights -band $write) -ne 0 -and $trusted -notcontains $rule.IdentityReference.Value) { throw 'shared write' }
  }
}`;
  try {
    await promisify(execFile)(
      join(
        process.env.SystemRoot || "C:\\Windows",
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      ["-NoProfile", "-NonInteractive", "-Command", command],
      {
        env: {
          ...process.env,
          STINTWORK_OWNED_CACHE: path,
          STINTWORK_CHECK_RECURSIVE: recursive ? "1" : "0",
        },
        timeout: 60_000,
        killSignal: "SIGKILL",
        maxBuffer: 65536,
      },
    );
  } catch {
    throw new Error(
      "Cannot verify private Windows adapter-cache ownership/ACLs. Choose an empty user-owned cache without shared write access and ensure Windows PowerShell is available, then retry.",
    );
  }
}

async function cacheRoot(path: string, project: string): Promise<string> {
  let parent = path;
  while (
    !(await lstat(parent).catch((error) => {
      if (!missing(error)) throw error;
    }))
  )
    parent = dirname(parent);
  if (inside(project, resolve(await realpath(parent), relative(parent, path))))
    throw new Error("Adapter cache resolves inside the project.");
  const root = await privateDirectory(path);
  const marker = join(root, ".stintwork-agent-cache");
  if (
    !(await lstat(marker).catch((error) => {
      if (!missing(error)) throw error;
    }))
  ) {
    if (
      (await readdir(root)).some(
        (name) =>
          name !== ".stintwork-agent-cache" && !name.startsWith(".stintwork-agent-cache.owner-"),
      ) &&
      !(await lstat(marker).catch((error) => {
        if (!missing(error)) throw error;
      }))
    )
      throw new Error(
        "Refusing a nonempty directory without Stintwork cache ownership. Choose an empty STINTWORK_AGENT_CACHE directory.",
      );
    const staging = join(root, `.stintwork-agent-cache.owner-${randomUUID()}`);
    try {
      await writeFile(staging, "stintwork-agent-cache-v1\n", { mode: 0o600, flag: "wx" });
      await link(staging, marker).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      });
    } finally {
      await unlink(staging).catch((error) => {
        if (!missing(error)) throw error;
      });
    }
  }
  if (
    !(await owned(marker)).isFile() ||
    (await readFile(marker, "utf8")) !== "stintwork-agent-cache-v1\n"
  )
    throw new Error("Invalid Stintwork cache ownership marker.");
  return root;
}

export function agentCacheDirectory(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(
    env.STINTWORK_AGENT_CACHE ||
      join(
        process.platform === "darwin"
          ? join(homedir(), "Library/Caches")
          : process.platform === "win32"
            ? env.LOCALAPPDATA || join(homedir(), "AppData/Local")
            : env.XDG_CACHE_HOME || join(homedir(), ".cache"),
        "stintwork/agents",
      ),
  );
}

export async function inspectInstalledAgent(
  agent: CachedAgent,
  env: NodeJS.ProcessEnv = process.env,
  signal?: AbortSignal,
) {
  const command =
    agent === "claude" ? env.CLAUDE_CODE_EXECUTABLE || "claude" : env.CODEX_PATH || "codex";
  const path = findExecutable(command, env);
  if (!path) return undefined;
  const canonical = await realpath(path);
  const before = await lstat(canonical);
  const started = performance.now();
  let version: string | undefined;
  try {
    const { stdout } = await promisify(execFile)(canonical, ["--version"], {
      env,
      signal,
      timeout: 60_000,
      killSignal: "SIGKILL",
      maxBuffer: 65536,
    });
    version =
      agent === "claude"
        ? /^(\S+) \(Claude Code\)\s*$/.exec(stdout)?.[1]
        : /^codex-cli (\S+)\s*$/.exec(stdout)?.[1];
    version ??= "unparseable";
  } catch {
    signal?.throwIfAborted();
  }
  const after = await lstat(canonical);
  if (executableIdentity(canonical, before) !== executableIdentity(canonical, after))
    throw new Error("Installed CLI changed during inspection. Retry preparation.");
  return {
    path: canonical,
    version,
    identity: executableIdentity(canonical, after),
    elapsedMs: performance.now() - started,
  };
}

type LockPackage = {
  name?: string;
  version?: string;
  resolved?: string;
  integrity?: string;
  link?: boolean;
  optional?: boolean;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};
type ReleaseLock = { lockfileVersion: number; packages: Record<string, LockPackage> };

export async function releasedProfile(
  options: AgentPreparationOptions,
  source: "installed" | "bundled",
  host: AdapterHost,
) {
  const directory = join(
    options.profilesDirectory ?? adapterProfilesDirectory(),
    profileName(options.agent, source, host),
  );
  let manifestBytes: Buffer;
  let lockBytes: Buffer;
  try {
    [manifestBytes, lockBytes] = await Promise.all([
      readFile(join(directory, "package.json")),
      readFile(join(directory, "package-lock.json")),
    ]);
  } catch {
    throw new Error(
      `Missing released adapter profile/lock: ${directory}. Ask the coordinator to generate and ship the release locks; retry with the same pins.`,
    );
  }
  const manifest = JSON.parse(manifestBytes.toString());
  const expected = profileManifest(options.agent, source, host);
  if (JSON.stringify(manifest) !== JSON.stringify(expected))
    throw new Error(`Released manifest does not match pinned ${options.agent} ${source} profile.`);
  const lock = JSON.parse(lockBytes.toString()) as ReleaseLock;
  if (
    lock.lockfileVersion !== 3 ||
    !lock.packages?.[""] ||
    JSON.stringify(lock.packages[""].dependencies) !== JSON.stringify(expected.dependencies)
  )
    throw new Error("Released lock does not match the pinned profile manifest.");
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path) continue;
    const url = new URL(entry.resolved ?? "invalid:");
    if (
      !path.startsWith("node_modules/") ||
      path.split("/").some((part) => ["..", ".", ""].includes(part)) ||
      path.includes("\\") ||
      entry.link ||
      !/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/.test(entry.version ?? "") ||
      url.protocol !== "https:" ||
      url.hostname !== "registry.npmjs.org" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity ?? "")
    )
      throw new Error(`Missing or unsafe released version/artifact/SHA-512 integrity: ${path}`);
    const required = new Set([
      ...Object.keys(entry.dependencies ?? {}),
      ...Object.keys(entry.optionalDependencies ?? {}),
      ...Object.keys(entry.peerDependencies ?? {}).filter(
        (name) => !entry.peerDependenciesMeta?.[name]?.optional,
      ),
    ]);
    for (const name of required) {
      let parent = path;
      while (!lock.packages[`${parent}/node_modules/${name}`] && parent) {
        const boundary = parent.lastIndexOf("/node_modules/");
        parent = boundary < 0 ? "" : parent.slice(0, boundary);
      }
      if (!lock.packages[parent ? `${parent}/node_modules/${name}` : `node_modules/${name}`])
        throw new Error(`Released lock is missing the dependency closure: ${name}`);
    }
  }
  for (const [name, version] of Object.entries(expected.dependencies)) {
    const entry = lock.packages[`node_modules/${name}`];
    const actual = version.startsWith("npm:")
      ? version.slice(version.lastIndexOf("@") + 1)
      : version;
    if (!entry || entry.version !== actual || entry.optional)
      throw new Error(`Released lock has a missing/mismatched required pin: ${name}`);
  }
  return {
    manifestBytes,
    lockBytes,
    lock,
    lockDigest: digest(lockBytes),
    identity: digest(Buffer.concat([manifestBytes, lockBytes])),
  };
}

async function files(
  directory: string,
  signal: AbortSignal,
  root = directory,
): Promise<Record<string, string>> {
  if (root === directory) await windowsOwnership(root, true);
  const result: Record<string, string> = {};
  for (const name of (await readdir(directory)).sort()) {
    if (directory === root && name === "complete.json") continue;
    const path = join(directory, name);
    const stat = await owned(path);
    const key = relative(root, path);
    if (stat.isSymbolicLink()) {
      if (!inside(root, await realpath(path)))
        throw new Error(`Adapter cache symlink escapes entry: ${key}`);
      result[key] = `link:${await readlink(path)}`;
    } else if (stat.isDirectory()) Object.assign(result, await files(path, signal, root));
    else if (stat.isFile()) result[key] = `${stat.mode & 0o777}:${await fileDigest(path, signal)}`;
    else throw new Error(`Unsupported adapter cache file: ${key}`);
  }
  return result;
}

async function verifyPackages(
  directory: string,
  lock: ReleaseLock,
  agent: CachedAgent,
  source: "installed" | "bundled",
  host: AdapterHost,
) {
  const native = source === "bundled" ? nativePackage(agent, host).name : undefined;
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path) continue;
    const manifestPath = join(directory, path, "package.json");
    const present = await lstat(manifestPath).catch((error) => {
      if (!missing(error)) throw error;
    });
    if (!present && entry.optional) continue;
    if (!present || !inside(directory, await realpath(manifestPath)))
      throw new Error(`Required locked package missing/escaped: ${path}`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const name = path.slice(path.lastIndexOf("node_modules/") + 13);
    if (manifest.version !== entry.version || manifest.name !== (entry.name ?? name))
      throw new Error(`Installed package differs from released lock: ${path}`);
    if (/(?:claude-agent-sdk|codex)-(?:darwin|linux|win32)-/.test(name) && name !== native)
      throw new Error(`Unexpected native payload: ${name}`);
  }
  const pin = adapterPins[agent];
  const adapterEntry = join(directory, "node_modules", pin.adapter, "dist/index.js");
  if (!(await lstat(adapterEntry)).isFile())
    throw new Error("Pinned adapter entrypoint is missing.");
  if (!native) return { adapterEntry };
  let executable: string;
  if (agent === "claude")
    executable = join(
      directory,
      "node_modules",
      native,
      host.os === "win32" ? "claude.exe" : "claude",
    );
  else {
    const target = `${host.arch === "arm64" ? "aarch64" : "x86_64"}-${host.os === "darwin" ? "apple-darwin" : host.os === "win32" ? "pc-windows-msvc" : "unknown-linux-musl"}`;
    executable = join(
      directory,
      "node_modules",
      native,
      "vendor",
      target,
      "bin",
      host.os === "win32" ? "codex.exe" : "codex",
    );
  }
  if (!findExecutable(executable, {}) || !inside(directory, await realpath(executable)))
    throw new Error("Pinned bundled executable is missing or escapes its entry.");
  return { adapterEntry, executable };
}

async function acquireLock(root: string, key: string, signal: AbortSignal) {
  const token = randomUUID();
  const prefix = `${key}.lock-`;
  const path = join(root, `${prefix}${token}`);
  const writing = join(root, `${key}.writing-${token}`);
  type Owner = { pid: number; token: string; ticket: number | null };
  const owner: Owner = { pid: process.pid, token, ticket: null };
  let held = false;
  const remove = async (path: string) =>
    unlink(path).catch((error) => {
      if (!missing(error)) throw error;
    });
  async function contenders(): Promise<Owner[]> {
    const result: Owner[] = [];
    // shortcut: scan per-key contenders, use an OS lock if contention grows to thousands of processes.
    for (const name of (await readdir(root)).filter((name) => name.startsWith(prefix))) {
      const candidate = join(root, name);
      try {
        if (!(await owned(candidate)).isFile()) throw new Error("Unsafe adapter preparation lock.");
        const record = JSON.parse(await readFile(candidate, "utf8")) as Owner;
        if (
          !Number.isSafeInteger(record.pid) ||
          record.pid <= 0 ||
          name !== `${prefix}${record.token}` ||
          !/^[\da-f-]{36}$/.test(record.token) ||
          (record.ticket !== null && (!Number.isSafeInteger(record.ticket) || record.ticket < 1))
        )
          throw new Error(
            "Invalid adapter preparation owner; inspect the owned cache lock before retrying.",
          );
        try {
          process.kill(record.pid, 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") {
            // Each dead owner's unique filename is never reused by a new contender.
            await remove(candidate);
            continue;
          }
          if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
        }
        result.push(record);
      } catch (error) {
        if (!missing(error)) throw error;
      }
    }
    return result;
  }
  try {
    // Lamport's bakery: publish choosing before reading tickets, then atomically publish our ticket.
    await writeFile(writing, JSON.stringify(owner), { mode: 0o600, flag: "wx" });
    await link(writing, path);
    await remove(writing);
    const ticket = 1 + Math.max(0, ...(await contenders()).map((record) => record.ticket ?? 0));
    if (!Number.isSafeInteger(ticket))
      throw new Error("Adapter preparation lock ticket overflow. Retry with a fresh owned cache.");
    owner.ticket = ticket;
    await writeFile(writing, JSON.stringify(owner), { mode: 0o600, flag: "wx" });
    await rename(writing, path);
    while (true) {
      signal.throwIfAborted();
      const waiting = (await contenders()).some(
        (record) =>
          record.token !== token &&
          (record.ticket === null ||
            record.ticket < ticket ||
            (record.ticket === ticket && record.token < token)),
      );
      if (!waiting) {
        held = true;
        return () => remove(path);
      }
      await delay(50, undefined, { signal });
    }
  } finally {
    await remove(writing);
    if (!held) await remove(path);
  }
}

export function preparedAgentEnvironment(
  prepared: { agent: CachedAgent; executable: { path: string } },
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...env,
    [prepared.agent === "claude" ? "CLAUDE_CODE_EXECUTABLE" : "CODEX_PATH"]:
      prepared.executable.path,
  };
}

async function smokeAdapter(
  entry: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
  signal: AbortSignal,
): Promise<void> {
  const { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } = await import(
    "@agentclientprotocol/sdk"
  );
  signal.throwIfAborted();
  const child = spawn(process.execPath, [entry], {
    cwd,
    env,
    stdio: "pipe",
    signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    killSignal: "SIGKILL",
  });
  const closed = new Promise<void>((resolveClose) => child.once("close", () => resolveClose()));
  const failure = new Promise<never>((_resolve, reject) => {
    child.once("error", reject);
    child.once("exit", () =>
      reject(new Error("Adapter exited before ACP initialization completed.")),
    );
    child.stdin.on("error", reject);
    child.stdout.on("error", reject);
  });
  void failure.catch(() => {});
  child.stderr.resume();
  try {
    const acp = new ClientSideConnection(
      () => ({
        async sessionUpdate() {},
        async requestPermission() {
          return { outcome: { outcome: "cancelled" } };
        },
      }),
      ndJsonStream(Writable.toWeb(child.stdin), toAcpReadable(child.stdout)),
    );
    const initialized = await Promise.race([
      acp.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      }),
      failure,
      acp.closed.then(() => {
        throw new Error("Adapter closed before ACP initialization completed.");
      }),
    ]);
    if (initialized.protocolVersion !== PROTOCOL_VERSION)
      throw new Error("Adapter returned an incompatible ACP protocol version.");
  } finally {
    child.stdin.end();
    child.kill("SIGTERM");
    const killTimer = setTimeout(() => child.kill("SIGKILL"), 300);
    killTimer.unref();
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
    await closed;
    clearTimeout(killTimer);
  }
}

// Explicit first use only. Detection and board inspection must not call this function.
export async function prepareAgent(
  options: AgentPreparationOptions,
  sourceOverride?: { reason: "handshake failed" },
): Promise<PreparedAgent> {
  const { agent, cwd, onProgress } = options;
  if (agent !== "claude" && agent !== "codex")
    throw new Error(
      "Only Claude Code and Codex use the adapter cache; Grok keeps its native launch.",
    );
  const env = options.env ?? process.env;
  const signal = AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    AbortSignal.timeout(options.timeoutMs ?? 300_000),
  ]);
  signal.throwIfAborted();
  const started = performance.now();
  const detected = sourceOverride ? undefined : await inspectInstalledAgent(agent, env, signal);
  const selection = sourceOverride
    ? { source: "bundled" as const, reason: sourceOverride.reason }
    : selectAgentSource(agent, detected);
  const { source, reason } = selection;
  const progress = (phase: AgentPreparationEvent["phase"], details = {}) =>
    onProgress?.({
      agent,
      adapterVersion: adapterPins[agent].version,
      source,
      reason,
      phase,
      ...details,
    });
  const proposedExecutable =
    source === "installed" ? detected : { path: "", version: adapterPins[agent].cliVersion };
  progress("selected", {
    executable: proposedExecutable,
    ...(detected ? { elapsedMs: detected.elapsedMs, success: !!detected.version } : {}),
  });
  await options.beforePrepare?.(
    {
      agent,
      adapterVersion: adapterPins[agent].version,
      source,
      reason,
      phase: "selected",
      executable: proposedExecutable,
    },
    signal,
  );
  signal.throwIfAborted();
  const host = adapterHost();
  const profile = await releasedProfile(options, source, host);
  const cacheKey = digest(
    JSON.stringify({
      agent,
      adapter: adapterPins[agent].version,
      release: profile.identity,
      source,
      ...host,
    }),
  );
  const rootPath = resolve(options.cacheDirectory ?? agentCacheDirectory(env));
  const project = await realpath(cwd);
  if (inside(project, rootPath))
    throw new Error("Adapter cache must be outside the project and its node_modules.");
  const root = await cacheRoot(rootPath, project);
  const entries = await privateDirectory(join(root, "entries"));
  const locks = await privateDirectory(join(root, "locks"));
  const entry = join(entries, cacheKey);
  progress("waiting");
  const unlock = await acquireLock(locks, cacheKey, signal);
  let staging: string | undefined;
  let installedFiles: Record<string, string> | undefined;
  try {
    const existing = await lstat(entry).catch((error) => {
      if (!missing(error)) throw error;
    });
    if (existing) {
      if (!(await owned(entry)).isDirectory()) throw new Error("Unsafe adapter cache entry.");
      const completion = join(entry, "complete.json");
      if (!(await owned(completion)).isFile())
        throw new Error("Unsafe adapter cache completion record.");
      const recorded = JSON.parse(await readFile(completion, "utf8"));
      installedFiles = await files(entry, signal);
      if (
        recorded.cacheKey !== cacheKey ||
        JSON.stringify(recorded.files) !== JSON.stringify(installedFiles)
      )
        throw new Error(
          "Adapter cache integrity mismatch. Retain this entry for inspection; retry using a fresh STINTWORK_AGENT_CACHE directory.",
        );
    } else {
      staging = await mkdtemp(join(entries, `${cacheKey}.staging-`));
      await writeFile(join(staging, "package.json"), profile.manifestBytes, { mode: 0o600 });
      await writeFile(join(staging, "package-lock.json"), profile.lockBytes, { mode: 0o600 });
      await writeFile(join(staging, ".npmrc"), "", { mode: 0o600 });
      await writeFile(join(staging, ".global-npmrc"), "", { mode: 0o600 });
      const npmCache = await privateDirectory(join(root, "npm-cache"));
      progress("installing");
      await runNpm(["ci", ...isolatedNpmArgs(staging, npmCache)], {
        cwd: staging,
        env: isolatedNpmEnvironment(env),
        signal,
        timeout: options.timeoutMs ?? 300_000,
      });
      progress("verifying");
      if (
        !profile.manifestBytes.equals(await readFile(join(staging, "package.json"))) ||
        !profile.lockBytes.equals(await readFile(join(staging, "package-lock.json")))
      )
        throw new Error("npm modified the released profile/lock; refusing publication.");
    }
    const directory = staging ?? entry;
    const verified = await verifyPackages(directory, profile.lock, agent, source, host);
    installedFiles ??= await files(directory, signal);
    const versionStart = performance.now();
    let executable: Awaited<ReturnType<typeof inspectInstalledAgent>>;
    try {
      executable =
        source === "installed"
          ? await inspectInstalledAgent(agent, env, signal)
          : await inspectInstalledAgent(
              agent,
              {
                ...env,
                [agent === "claude" ? "CLAUDE_CODE_EXECUTABLE" : "CODEX_PATH"]: verified.executable,
              },
              signal,
            );
      if (
        !executable?.version ||
        (source === "installed"
          ? executable.identity !== detected?.identity || executable.version !== detected.version
          : executable.version !== adapterPins[agent].cliVersion)
      )
        throw new Error(
          "Selected executable identity/version changed or does not match its pinned profile. Retry preparation.",
        );
      await smokeAdapter(
        verified.adapterEntry,
        preparedAgentEnvironment({ agent, executable }, env),
        directory,
        signal,
      ).catch((error) => {
        signal.throwIfAborted();
        if (source === "installed" && isHandshakeIncompatibility(error))
          throw new InstalledAgentInitializationError(
            "Installed CLI rejected ACP initialization.",
            { cause: error },
          );
        throw error;
      });
      progress("smoke", { elapsedMs: performance.now() - versionStart, success: true });
    } catch (error) {
      progress("smoke", { elapsedMs: performance.now() - versionStart, success: false });
      throw error;
    }
    signal.throwIfAborted();
    if (staging) {
      if (JSON.stringify(installedFiles) !== JSON.stringify(await files(staging, signal)))
        throw new Error(
          "Adapter smoke check modified the verified installation; refusing publication.",
        );
      await writeFile(
        join(staging, "complete.json"),
        JSON.stringify({ cacheKey, files: installedFiles }),
        { mode: 0o600, flag: "wx" },
      );
      await rename(staging, entry);
      staging = undefined;
    }
    const offset = source === "bundled" ? relative(directory, executable.path) : undefined;
    const version = executable.version;
    if (!version) throw new Error("Selected executable has no verified version.");
    const selectedExecutable = {
      version,
      path: offset ? join(entry, offset) : executable.path,
      identity: executable.identity,
    };
    if (offset)
      selectedExecutable.identity = executableIdentity(
        selectedExecutable.path,
        await lstat(selectedExecutable.path),
      );
    progress("ready", { elapsedMs: performance.now() - started, executable: selectedExecutable });
    return {
      agent,
      source,
      reason,
      executable: selectedExecutable,
      adapterEntry: join(entry, relative(directory, verified.adapterEntry)),
      adapterVersion: adapterPins[agent].version,
      cacheKey,
      lockDigest: profile.lockDigest,
    };
  } finally {
    try {
      if (staging) await rm(staging, { recursive: true, force: true });
    } finally {
      await unlock();
    }
  }
}
