// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { builtinModules } from "node:module";
import { chmod, cp, mkdir, readFile, rm } from "node:fs/promises";
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
for (const entry of Object.values(result.metafile.outputs)) {
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
await chmod(new URL("bin.js", output), 0o755);
console.log("Built stintwork package: CLI bundle, web app and workflow YAML.");
