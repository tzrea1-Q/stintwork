// SPDX-License-Identifier: Apache-2.0
import { readFileSync, readdirSync } from "node:fs";
import { expect, test } from "vitest";
import { checkNodeVersion } from "./cli.js";

const root = new URL("../../../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

test("only the root stintwork package is publishable, at 0.2.0 on Node 22.12 or newer", () => {
  expect(manifest).toMatchObject({
    name: "stintwork",
    version: "0.2.0",
    license: "Apache-2.0",
    type: "module",
    engines: { node: ">=22.12.0" },
    bin: { stintwork: "dist/bin.js" },
    files: ["dist/", "README.md", "README.zh-CN.md", "LICENSE"],
  });
  expect(manifest.private).toBeUndefined();
  for (const directory of readdirSync(new URL("packages/", root))) {
    const workspace = JSON.parse(
      readFileSync(new URL(`packages/${directory}/package.json`, root), "utf8"),
    );
    expect(workspace.private, directory).toBe(true);
    expect(workspace.name, directory).not.toBe("stintwork");
  }
});

test("runtime dependencies remain exact registry dependencies, not workspace links or native build tools", () => {
  const dependencies: Record<string, string> = {};
  for (const name of ["server", "core", "agents", "git"]) {
    const workspace = JSON.parse(
      readFileSync(new URL(`packages/${name}/package.json`, root), "utf8"),
    );
    for (const [dependency, version] of Object.entries(workspace.dependencies ?? {})) {
      if (!dependency.startsWith("@stintwork/")) dependencies[dependency] = version as string;
    }
  }
  expect(manifest.dependencies).toEqual(dependencies);
  for (const [name, version] of Object.entries(manifest.dependencies)) {
    expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    expect(name).not.toMatch(/^(?:@stintwork\/|node-gyp$|node-pty$|fsevents$|better-sqlite3$)/);
  }
  expect(manifest.bundleDependencies ?? manifest.bundledDependencies).toBeUndefined();
  for (const hook of ["preinstall", "install", "postinstall"])
    expect(manifest.scripts[hook]).toBeUndefined();
  expect(manifest.scripts.prepack).toContain("build");
});

test("the packed smoke test is on demand and in CI on Ubuntu and macOS without publishing", () => {
  expect(manifest.scripts["smoke:package"]).toBe("node scripts/package-smoke.mjs");
  const workflow = readFileSync(new URL(".github/workflows/ci.yml", root), "utf8");
  expect(workflow).toContain("os: [ubuntu-latest, macos-latest]");
  expect(workflow).toMatch(/runs-on: \$\{\{ matrix\.os }}/);
  expect(workflow).toContain("pnpm --config.verify-deps-before-run=false smoke:package");
  for (const action of ["actions/checkout@v6", "actions/setup-node@v6", "pnpm/action-setup@v5"])
    expect(workflow).toContain(action);
  expect(workflow).not.toMatch(/(?:checkout|setup-node|action-setup)@v4|npm publish/);
});

test("unsupported Node versions have an actionable error at the 22.12 boundary", () => {
  for (const version of ["20.19.0", "21.7.3", "22.11.0"])
    expect(() => checkNodeVersion(version)).toThrow(
      `Node.js >=22.12.0 is required; found ${version}`,
    );
  for (const version of ["22.12.0", "22.22.3", "24.0.0"])
    expect(() => checkNodeVersion(version)).not.toThrow();
});
