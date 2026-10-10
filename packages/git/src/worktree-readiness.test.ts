import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { installWorktreeDependencies } from "./worktree-readiness.js";

const fixtures: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function fixture(
  manager: string,
  files: Record<string, string>,
  offlineFails = false,
  onlineFails = false,
) {
  const root = await mkdtemp(join(tmpdir(), "stintwork-install-"));
  fixtures.push(root);
  await mkdir(join(root, "bin"));
  await writeFile(
    join(root, "bin", manager),
    `#!/bin/sh\nprintf '%s|%s\\n' "$*" "$YARN_ENABLE_NETWORK" >> attempts\nprintf 'fixture output\\n'\n${offlineFails ? 'case "$*|$YARN_ENABLE_NETWORK" in *--offline*|*\\|0) exit 1;; esac' : ""}\n${onlineFails ? "exit 2" : "mkdir -p node_modules"}\n`,
    { mode: 0o755 },
  );
  vi.stubEnv("PATH", `${join(root, "bin")}${delimiter}${process.env.PATH}`);
  for (const [path, text] of Object.entries(files)) await writeFile(join(root, path), text);
  return root;
}

test.each([
  [
    "pnpm",
    { "pnpm-lock.yaml": "" },
    "install --frozen-lockfile --offline|",
    "install --frozen-lockfile|",
  ],
  ["npm", { "package-lock.json": "{}" }, "ci --offline|", "ci|"],
  ["npm", { "npm-shrinkwrap.json": "{}" }, "ci --offline|", "ci|"],
  [
    "yarn",
    { "yarn.lock": "", "package.json": "{}" },
    "install --frozen-lockfile --offline|",
    "install --frozen-lockfile|",
  ],
  [
    "yarn",
    { "yarn.lock": "", ".yarnrc.yml": "" },
    "install --immutable|0",
    "install --immutable|1",
  ],
  [
    "yarn",
    { "yarn.lock": "", "package.json": '{"packageManager":"yarn@4.9.2"}' },
    "install --immutable|0",
    "install --immutable|1",
  ],
] as const)(
  "%s tries offline first, streams output, and falls back online (%j)",
  async (manager, files, offline, online) => {
    const root = await fixture(manager, files, true);
    const progress: string[] = [];
    await installWorktreeDependencies(root, (text) => progress.push(text));
    expect((await readFile(join(root, "attempts"), "utf8")).trim().split("\n")).toEqual([
      offline,
      online,
    ]);
    expect(progress.join("")).toContain("fixture output");
    expect(progress.join("")).toContain("Offline dependency install unavailable; trying online.");
    expect(progress.at(-1)).toBe("Worktree dependencies are ready.\n");
    await installWorktreeDependencies(root, (text) => progress.push(text));
    expect((await readFile(join(root, "attempts"), "utf8")).trim().split("\n")).toHaveLength(2);
  },
);

test("does not fall back online after a successful offline install", async () => {
  const root = await fixture("pnpm", { "pnpm-lock.yaml": "" });
  await installWorktreeDependencies(root, () => {});
  expect((await readFile(join(root, "attempts"), "utf8")).trim()).toBe(
    "install --frozen-lockfile --offline|",
  );
});

test("does not install without a supported lockfile or when Yarn PnP is already ready", async () => {
  const cases: Record<string, string>[] = [
    {},
    { "yarn.lock": "", ".yarnrc.yml": "", ".pnp.cjs": "" },
  ];
  for (const files of cases) {
    const root = await fixture("yarn", files);
    await installWorktreeDependencies(root, () => {
      throw new Error("No installation expected");
    });
    await expect(readFile(join(root, "attempts"))).rejects.toMatchObject({ code: "ENOENT" });
  }
});

test("a failed online install is not reported ready", async () => {
  const root = await fixture("npm", { "package-lock.json": "{}" }, true, true);
  const progress: string[] = [];
  await expect(installWorktreeDependencies(root, (text) => progress.push(text))).rejects.toThrow(
    "npm dependency install failed (2)",
  );
  expect(progress.join("")).not.toContain("dependencies are ready");
  await mkdir(join(root, "node_modules"));
  await expect(installWorktreeDependencies(root, () => {}, true)).rejects.toThrow(
    "npm dependency install failed (2)",
  );
});

test("cancelling setup stops the installer without falling back online", async () => {
  const root = await fixture("pnpm", { "pnpm-lock.yaml": "" });
  await writeFile(
    join(root, "bin/pnpm"),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> attempts\nprintf 'waiting\\n'\nexec '${process.execPath}' -e 'setInterval(() => {}, 1000)'\n`,
    { mode: 0o755 },
  );
  const cancellation = new AbortController();
  await expect(
    installWorktreeDependencies(
      root,
      (text) => {
        if (text.includes("waiting")) cancellation.abort();
      },
      false,
      cancellation.signal,
    ),
  ).rejects.toThrow();
  expect((await readFile(join(root, "attempts"), "utf8")).trim()).toBe(
    "install --frozen-lockfile --offline",
  );
});
