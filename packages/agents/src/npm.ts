// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { access, lstat, readdir, realpath } from "node:fs/promises";
import { basename, delimiter, dirname, join } from "node:path";
import { promisify } from "node:util";

export async function npmEntry(
  env: NodeJS.ProcessEnv,
  platform = process.platform,
): Promise<string> {
  const candidates: string[] = [];
  if (env.npm_execpath && basename(env.npm_execpath) === "npm-cli.js")
    candidates.push(env.npm_execpath);
  for (const directory of (env.PATH ?? env.Path ?? "").split(delimiter)) {
    try {
      const shim = await realpath(join(directory, platform === "win32" ? "npm.cmd" : "npm"));
      candidates.push(
        basename(shim) === "npm-cli.js"
          ? shim
          : join(dirname(shim), "node_modules/npm/bin/npm-cli.js"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  candidates.push(join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return await realpath(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("Cannot find npm-cli.js; put npm on PATH or set npm_execpath to its JS entry.");
}

export type NpmOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeout?: number;
  stallTimeoutMs?: number;
  progressDirectories?: string[];
};

export async function runNpm(args: string[], options: NpmOptions): Promise<void> {
  const entry = await npmEntry(options.env);
  const { stallTimeoutMs, progressDirectories = [options.cwd], ...execution } = options;
  const stalled = new AbortController();
  const signal = AbortSignal.any([stalled.signal, ...(options.signal ? [options.signal] : [])]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stallMs = stallTimeoutMs ?? 60_000;
  let monitoring = true;
  let previous = "";
  let lastProgress = performance.now();
  async function checkProgress() {
    const progress = [];
    // shortcut: scan the owned install trees once per second; use filesystem events if profiles grow substantially.
    for (const directory of progressDirectories) {
      let bytes = 0;
      let modified = 0;
      let count = 0;
      const files = await readdir(directory, { recursive: true, withFileTypes: true }).catch(
        (error) => {
          // npm can rename/remove an extraction directory between readdir calls.
          if (error.code !== "ENOENT") throw error;
          return [];
        },
      );
      for (const file of files) {
        if (!file.isFile() || file.parentPath.split(/[\\/]/).includes("_logs")) continue;
        const stat = await lstat(join(file.parentPath, file.name)).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
        if (stat) {
          bytes += stat.size;
          modified = Math.max(modified, stat.mtimeMs);
          count++;
        }
      }
      progress.push(`${count}:${bytes}:${modified}`);
    }
    const current = progress.join("|");
    if (current !== previous) {
      previous = current;
      lastProgress = performance.now();
    } else if (performance.now() - lastProgress >= stallMs) {
      stalled.abort(
        new DOMException(
          "Agent download/install stalled; check the connection and retry.",
          "TimeoutError",
        ),
      );
      return;
    }
    if (monitoring && !signal.aborted)
      timer = setTimeout(
        () => {
          void checkProgress().catch((error) => stalled.abort(error));
        },
        Math.min(1000, stallMs),
      );
  }
  // Never relay npm output: a registry error can contain private configuration or credentials.
  try {
    if (stallTimeoutMs !== undefined) await checkProgress();
    await promisify(execFile)(process.execPath, [entry, ...args], {
      ...execution,
      signal,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    signal.throwIfAborted();
    const code = (error as NodeJS.ErrnoException).code;
    throw new Error(
      `Frozen npm preparation failed (${code ?? "timeout or process failure"}). Check network and disk space, then retry with the same released pins.`,
    );
  } finally {
    monitoring = false;
    clearTimeout(timer);
  }
}

export function isolatedNpmEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !/^npm_config_/i.test(key)));
}

export function isolatedNpmArgs(directory: string, cache: string): string[] {
  return [
    "--ignore-scripts",
    "--omit=optional",
    "--no-audit",
    "--no-fund",
    "--workspaces=false",
    "--package-lock=true",
    "--global=false",
    "--logs-max=0",
    "--update-notifier=false",
    "--registry=https://registry.npmjs.org",
    "--cache",
    cache,
    "--userconfig",
    join(directory, ".npmrc"),
    "--globalconfig",
    join(directory, ".global-npmrc"),
  ];
}
