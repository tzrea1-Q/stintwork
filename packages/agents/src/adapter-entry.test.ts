// SPDX-License-Identifier: Apache-2.0
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";
import { adapterEntry } from "./adapter-entry.js";
import { codexProfile, claudeProfile } from "./profiles.js";
import { installedCliPairs, selectAgentSource, type InstalledCliPair } from "./executable.js";

const directories: string[] = [];

test("installed CLI selection uses the lowest proven point through the next major", () => {
  expect(installedCliPairs.every((pair) => pair.evidence.trim())).toBe(true);
  for (const agent of ["claude", "codex"] as const) {
    expect(selectAgentSource(agent, undefined)).toEqual({ source: "bundled", reason: "missing" });
    expect(selectAgentSource(agent, { path: "" })).toEqual({
      source: "bundled",
      reason: "missing",
    });
    expect(selectAgentSource(agent, { path: "/cli" })).toEqual({
      source: "bundled",
      reason: "missing",
    });
    expect(selectAgentSource(agent, { path: "/cli", version: "" })).toEqual({
      source: "bundled",
      reason: "missing",
    });
  }
  for (const [agent, versions] of [
    ["claude", ["2.1.293", "2.1.295", "2.1.296", "2.10.0", "2.999.999", "2.1.293+build.1"]],
    ["codex", ["0.159.3", "0.163.0", "0.164.0", "0.1000.0", "0.9999.999", "0.163.0+build.1"]],
  ] as const) {
    for (const version of versions) {
      expect(selectAgentSource(agent, { path: "/cli", version })).toEqual({
        source: "installed",
        reason: "compatible",
      });
    }
  }
  for (const [agent, versions] of [
    ["claude", ["1.99.999", "2.0.999", "2.1.292"]],
    ["codex", ["0.148.0", "0.159.2"]],
  ] as const) {
    for (const version of versions) {
      expect(selectAgentSource(agent, { path: "/cli", version })).toEqual({
        source: "bundled",
        reason: "below-tested-range",
      });
    }
  }
  for (const [agent, version] of [
    ["claude", "3.0.0"],
    ["claude", "10.0.0"],
    ["codex", "1.0.0"],
  ] as const) {
    expect(selectAgentSource(agent, { path: "/cli", version })).toEqual({
      source: "bundled",
      reason: "incompatible",
    });
  }
});

test("installed CLI versions require complete stable numeric versions", () => {
  for (const version of [
    "unknown",
    "codex-cli 0.163.0",
    "v0.163.0",
    "0.163",
    "00.163.0",
    "0.0163.0",
    "0.163.00",
    "0.163.0-rc.1",
    " 0.163.0",
    "0.163.0\n",
    "0.163.0+",
    "0.163.0+build..1",
    "0.163.9007199254740992",
  ]) {
    expect(selectAgentSource("codex", { path: "/cli", version })).toEqual({
      source: "bundled",
      reason: "unparseable",
    });
  }
});

test("installed CLI evidence is adapter-specific and exact negatives override the range", () => {
  const detected = { path: "/codex", version: "0.163.0" };
  const fixture: InstalledCliPair = {
    agent: "codex",
    adapterVersion: "2.1.1",
    cliVersion: "0.159.3",
    result: "compatible",
    evidence: "test fixture, not real-agent evidence",
  };
  expect(selectAgentSource("codex", detected, [fixture])).toEqual({
    source: "installed",
    reason: "compatible",
  });
  const negative: InstalledCliPair = { ...fixture, cliVersion: "0.163.0", result: "incompatible" };
  for (const pairs of [[fixture, negative], [negative, fixture], [negative]]) {
    expect(selectAgentSource("codex", detected, pairs)).toEqual({
      source: "bundled",
      reason: "incompatible",
    });
    expect(selectAgentSource("codex", { ...detected, version: "0.163.0+build.1" }, pairs)).toEqual({
      source: "bundled",
      reason: "incompatible",
    });
  }
  expect(
    selectAgentSource("codex", { ...detected, version: "0.163.1" }, [fixture, negative]),
  ).toEqual({ source: "installed", reason: "compatible" });
  expect(selectAgentSource("codex", detected, [])).toEqual({
    source: "bundled",
    reason: "below-tested-range",
  });
  for (const pair of [
    { ...fixture, agent: "claude" as const },
    { ...fixture, adapterVersion: "2.1.2" },
    { ...fixture, cliVersion: "0.164.0" },
    { ...fixture, cliVersion: "invalid" },
    { ...fixture, cliVersion: "0.159.3-rc.1" },
    { ...fixture, evidence: " " },
  ]) {
    expect(selectAgentSource("codex", detected, [pair])).toEqual({
      source: "bundled",
      reason: "below-tested-range",
    });
  }
});
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
