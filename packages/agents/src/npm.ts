// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { access, realpath } from "node:fs/promises";
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
  timeout: number;
};

export async function runNpm(args: string[], options: NpmOptions): Promise<void> {
  const entry = await npmEntry(options.env);
  // Never relay npm output: a registry error can contain private configuration or credentials.
  try {
    await promisify(execFile)(process.execPath, [entry, ...args], {
      ...options,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    options.signal?.throwIfAborted();
    const code = (error as NodeJS.ErrnoException).code;
    throw new Error(
      `Frozen npm preparation failed (${code ?? "timeout or process failure"}). Check network and disk space, then retry with the same released pins.`,
    );
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
