// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { generateAgentLocks } from "../../../scripts/generate-agent-locks.js";
import { isolatedNpmArgs, isolatedNpmEnvironment, runNpm } from "./npm.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

test("real offline npm creates installation-relative lock paths when cwd is a symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "stintwork-npm-lock-"));
  directories.push(root);
  const cache = join(root, "npm-cache");
  const dependency = join(root, "dependency");
  const stage = join(root, "stage");
  const alias = join(root, "stage alias");
  for (const directory of [dependency, stage]) {
    await mkdir(directory);
    await writeFile(join(directory, ".npmrc"), "");
    await writeFile(join(directory, ".global-npmrc"), "");
  }
  await writeFile(
    join(dependency, "package.json"),
    JSON.stringify({ name: "fixture-dependency", version: "1.0.0" }),
  );
  const options = (cwd: string) => ({
    cwd,
    env: isolatedNpmEnvironment(process.env),
    timeout: 10_000,
  });
  await runNpm(["pack", "--offline", ...isolatedNpmArgs(dependency, cache)], options(dependency));
  await writeFile(
    join(stage, "package.json"),
    JSON.stringify({
      name: "fixture-prefix",
      private: true,
      dependencies: {
        "fixture-dependency": `file:${join(dependency, "fixture-dependency-1.0.0.tgz")}`,
      },
    }),
  );
  await symlink(stage, alias, "dir");
  await runNpm(
    ["install", "--package-lock-only", "--offline", ...isolatedNpmArgs(alias, cache)],
    options(alias),
  );
  const lock = JSON.parse(await readFile(join(stage, "package-lock.json"), "utf8"));
  expect(Object.keys(lock.packages)).toEqual(["", "node_modules/fixture-dependency"]);
  expect(await readdir(join(root, "stage"))).not.toContain("node_modules");
});

test("the generator validates all profiles before publishing locks and preserves a prior lock on invalid npm output", async () => {
  const root = await mkdtemp(join(tmpdir(), "stintwork-generator-"));
  directories.push(root);
  const npm = join(root, "npm-cli.js");
  const profiles = join(root, "profiles");
  await writeFile(
    npm,
    `
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync('package.json'));
const packages = {'': {name:manifest.name, dependencies:manifest.dependencies}};
for (const [name, pin] of Object.entries(manifest.dependencies)) {
  const alias = pin.startsWith('npm:');
  const key = (process.env.TEST_GENERATOR_BAD ? '../escaped/' : '') + 'node_modules/' + name;
  packages[key] = {
    ...(alias ? {name:'@openai/codex'} : {}),
    version:alias ? pin.slice(pin.lastIndexOf('@')+1) : pin,
    resolved:'https://registry.npmjs.org/'+name+'/-/fixture.tgz',
    integrity:'sha512-'+Buffer.alloc(64,1).toString('base64'),
  };
}
fs.writeFileSync('package-lock.json',JSON.stringify({lockfileVersion:3,packages}));
`,
  );
  const env = { npm_execpath: npm, PATH: "" };
  await generateAgentLocks(profiles, env);
  let count = 0;
  for (const agent of ["claude", "codex"])
    for (const profile of await readdir(join(profiles, agent))) {
      const lock = JSON.parse(
        await readFile(join(profiles, agent, profile, "package-lock.json"), "utf8"),
      );
      expect(
        Object.keys(lock.packages).every((path) => path === "" || path.startsWith("node_modules/")),
      ).toBe(true);
      count++;
    }
  expect(count).toBe(16);
  const first = join(profiles, "claude/installed/package-lock.json");
  const good = await readFile(first);
  await expect(generateAgentLocks(profiles, { ...env, TEST_GENERATOR_BAD: "1" })).rejects.toThrow(
    "Missing or unsafe released version/artifact/SHA-512 integrity",
  );
  expect(await readFile(first)).toEqual(good);
});
