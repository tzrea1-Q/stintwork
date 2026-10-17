// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { builtinModules } from "node:module";
import { chmod, cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL("../dist/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const result = await build({
  stdin: {
    contents: `import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startCli } from "./packages/cli/src/cli.ts";
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
await startCli(process.argv.slice(2), version, fileURLToPath(new URL("./web/", import.meta.url)));`,
    resolveDir: root,
    sourcefile: "stintwork-entry.mjs",
  },
  outfile: fileURLToPath(new URL("bin.js", output)),
  platform: "node",
  target: "node22.12",
  format: "esm",
  bundle: true,
  conditions: ["development"],
  external: Object.keys(manifest.dependencies),
  banner: { js: "#!/usr/bin/env node\n// SPDX-License-Identifier: Apache-2.0" },
  metafile: true,
});
// The measurement harness must exercise the installed package without starting a prompt.
const preparation = await build({
  entryPoints: [fileURLToPath(new URL("../packages/agents/src/prepare-agent.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("prepare-agent.js", output)),
  platform: "node",
  target: "node22.12",
  format: "esm",
  bundle: true,
  conditions: ["development"],
  external: Object.keys(manifest.dependencies),
  banner: { js: "// SPDX-License-Identifier: Apache-2.0" },
  metafile: true,
});
for (const entry of Object.values({
  ...result.metafile.outputs,
  ...preparation.metafile.outputs,
})) {
  for (const dependency of entry.imports) {
    if (!dependency.external) continue;
    assert(
      dependency.path.startsWith("node:") ||
        builtinModules.includes(dependency.path) ||
        Object.keys(manifest.dependencies).some(
          (name) => dependency.path === name || dependency.path.startsWith(`${name}/`),
        ),
      `Undeclared runtime dependency: ${dependency.path}`,
    );
  }
}
await cp(new URL("../packages/web/dist/", import.meta.url), new URL("web/", output), {
  recursive: true,
});
await cp(new URL("../packages/core/workflows/", import.meta.url), new URL("workflows/", output), {
  recursive: true,
});
const profiles = new URL("../packages/agents/profiles/", import.meta.url);
const estimates = JSON.parse(await readFile(new URL("download-sizes.json", profiles), "utf8"));
for (const agent of ["claude", "codex"]) {
  for (const profile of await readdir(new URL(`${agent}/`, profiles))) {
    const directory = new URL(`${agent}/${profile}/`, profiles);
    const manifest = JSON.parse(await readFile(new URL("package.json", directory), "utf8"));
    const lock = JSON.parse(await readFile(new URL("package-lock.json", directory), "utf8"));
    assert.equal(lock.lockfileVersion, 3);
    assert.deepEqual(lock.packages[""].dependencies, manifest.dependencies);
    if (profile.startsWith("bundled-")) {
      const estimate = estimates[`${agent}/${profile}`];
      assert.equal(
        estimate?.lockDigest,
        createHash("sha256")
          .update(await readFile(new URL("package-lock.json", directory)))
          .digest("hex"),
      );
      assert(Number.isSafeInteger(estimate.downloadBytes) && estimate.downloadBytes > 0);
    }
  }
}
for (const input of Object.keys({ ...result.metafile.inputs, ...preparation.metafile.inputs }))
  assert(
    !/node_modules\/.*(?:claude-agent-acp|codex-acp|claude-agent-sdk|@openai\/codex)/.test(input),
    `Eager adapter bundled: ${input}`,
  );
await cp(
  new URL("../packages/agents/profiles/", import.meta.url),
  new URL("agent-profiles/", output),
  {
    recursive: true,
  },
);
await chmod(new URL("bin.js", output), 0o755);
console.log(
  "Built stintwork package: CLI bundle, web app, workflow YAML and released agent profiles/locks.",
);
