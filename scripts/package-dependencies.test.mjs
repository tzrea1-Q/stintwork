// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkInstalledDependencies } from "./package-dependencies.mjs";

test("shipped unresolved profile manifests are assets; installed dependencies are checked", async () => {
  const root = await mkdtemp(join(tmpdir(), "stintwork-dependency-scan-"));
  const modules = join(root, "node_modules");
  const packageRoot = join(modules, "stintwork");
  const profile = join(packageRoot, "dist/agent-profiles/codex/bundled-darwin-arm64");
  try {
    await mkdir(profile, { recursive: true });
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "stintwork" }));
    await writeFile(
      join(profile, "package.json"),
      JSON.stringify({ name: "stintwork-codex-bundled-darwin-arm64" }),
    );
    await checkInstalledDependencies(modules);
    const nested = join(packageRoot, "node_modules/@agentclientprotocol/codex-acp");
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(nested, "package.json"),
      JSON.stringify({ name: "@agentclientprotocol/codex-acp" }),
    );
    await assert.rejects(checkInstalledDependencies(modules), /Eager agent dependency/);
    await writeFile(
      join(nested, "package.json"),
      JSON.stringify({ name: "other", scripts: { install: "node install.js" } }),
    );
    await assert.rejects(checkInstalledDependencies(modules), /Install hook/);
    await writeFile(join(nested, "package.json"), JSON.stringify({ name: "other" }));
    await writeFile(join(nested, "native.node"), "fixture");
    await assert.rejects(checkInstalledDependencies(modules), /Native module/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
