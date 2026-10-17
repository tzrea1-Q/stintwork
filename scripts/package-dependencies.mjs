// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir, realpath } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function checkInstalledDependencies(nodeModules) {
  const visited = new Set();
  async function checkNativeModules(directory) {
    const canonical = await realpath(directory);
    if (visited.has(canonical)) return;
    visited.add(canonical);
    const manifestPath = join(directory, "package.json");
    const parent = dirname(directory);
    const installed =
      basename(parent) === "node_modules" ||
      (basename(parent).startsWith("@") && basename(dirname(parent)) === "node_modules");
    if (installed && existsSync(manifestPath)) {
      const dependency = JSON.parse(await readFile(manifestPath, "utf8"));
      assert(
        !/(?:claude-agent-(?:acp|sdk)|codex(?:-acp)?)(?:$|-)/.test(dependency.name ?? ""),
        `Eager agent dependency: ${dependency.name}`,
      );
      assert(!dependency.gypfile, `Native build dependency: ${dependency.name}`);
      for (const hook of ["preinstall", "install", "postinstall"])
        assert(!dependency.scripts?.[hook], `Install hook in ${dependency.name}: ${hook}`);
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert(
        !/(?:\.node$|^binding\.gyp$)/.test(entry.name),
        `Native module: ${join(directory, entry.name)}`,
      );
      if (entry.isDirectory()) await checkNativeModules(join(directory, entry.name));
    }
  }
  await checkNativeModules(nodeModules);
}
