// SPDX-License-Identifier: Apache-2.0
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";
import { adapterEntry } from "./adapter-entry.js";
import { codexProfile, claudeProfile } from "./profiles.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("installation hints ask for the developer's CLI and login, not another adapter install", () => {
  for (const profile of [codexProfile, claudeProfile]) {
    expect(profile.installationHint).toMatch(/^Install (?:Codex|Claude Code) and sign in with /);
    expect(profile.installationHint).toContain("Stintwork includes @agentclientprotocol/");
  }
});

test.each(["hoisted", "nested"])(
  "ACP entry points resolve in a %s install without workspace bin shims",
  async (layout) => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), "stintwork-adapter-entry-")));
    directories.push(directory);
    const packageRoot = join(directory, "node_modules/stintwork");
    const dependencies =
      layout === "hoisted" ? join(directory, "node_modules") : join(packageRoot, "node_modules");
    for (const adapter of ["codex-acp", "claude-agent-acp"] as const) {
      const dependency = join(dependencies, "@agentclientprotocol", adapter);
      const entry = join(dependency, "dist/index.js");
      await mkdir(join(dependency, "dist"), { recursive: true });
      await writeFile(
        join(dependency, "package.json"),
        JSON.stringify({ name: `@agentclientprotocol/${adapter}`, exports: { "./*": "./*" } }),
      );
      await writeFile(entry, "// SPDX-License-Identifier: Apache-2.0\n");
      expect(adapterEntry(adapter, pathToFileURL(join(packageRoot, "dist/bin.js")).href)).toBe(
        entry,
      );
    }
  },
);
