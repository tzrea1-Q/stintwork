// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { parse } from "yaml";
import { defaultCheckCommands } from "./project-config.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const script = join(root, "scripts/check-licence-headers.mjs");
const fixtures: string[] = [];
const identifier = "SPDX-License-Identifier: Apache-2.0";
const extensions = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "css", "html"];

function fixture(files: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), "stintwork-licence-"));
  fixtures.push(directory);
  mkdirSync(join(directory, "packages"));
  for (const [path, content] of Object.entries(files)) {
    const target = join(directory, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return directory;
}

function check(directory?: string) {
  return spawnSync(process.execPath, [script, ...(directory ? [directory] : [])], {
    cwd: tmpdir(),
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});

test("every package source file has an Apache-2.0 header, independent of the working directory", () => {
  const result = check();
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toMatch(/checked [1-9]\d* package source files/);
});

test("accepts headers in all source types, including JSX, module variants, BOM and a CLI shebang", () => {
  const files = Object.fromEntries(
    extensions.map((extension) => [
      `packages/example/src/file.${extension}`,
      extension === "html"
        ? `<!-- ${identifier} -->\n<!doctype html>\n`
        : extension === "css"
          ? `/* ${identifier} */\nbody {}\n`
          : `// ${identifier}\nexport {};\n`,
    ]),
  );
  files["packages/example/src/bin.ts"] = `#!/usr/bin/env node\r\n// ${identifier}\r\n`;
  files["packages/example/src/types.d.ts"] = `\uFEFF/**\n * ${identifier}\n */\nexport {};\n`;
  const result = check(fixture(files));
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("checked 12 package source files");
});

test.each(extensions)("rejects a fixture source without its header: %s", (extension) => {
  const path = `packages/example/src/missing.${extension}`;
  const result = check(fixture({ [path]: "no header\n" }));
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Missing Apache-2.0 SPDX header");
  expect(result.stderr).toContain(path);
});

test.each([
  ["ts", `export const licence = "${identifier}";\n`],
  ["js", `export {};\n// ${identifier}\n`],
  ["ts", `// Copyright Stintwork\n// ${identifier}\n`],
  ["js", "// SPDX-License-Identifier: MIT\n"],
  ["js", `// ${identifier} OR MIT\n`],
  ["css", `// ${identifier}\nbody {}\n`],
  ["html", `<!doctype html>\n<!-- ${identifier} -->\n`],
])("requires the exact licence in the first valid %s comment: %s", (extension, source) => {
  const result = check(fixture({ [`packages/example/src/invalid.${extension}`]: source }));
  expect(result.status).toBe(1);
});

test("reports every missing header, including nested source and package configuration", () => {
  const paths = ["packages/example/src/nested/missing.ts", "packages/example/vite.config.ts"];
  const result = check(fixture(Object.fromEntries(paths.map((path) => [path, "export {};\n"]))));
  expect(result.status).toBe(1);
  for (const path of paths) expect(result.stderr).toContain(path);
});

test("excludes generated output, dependencies, prototype, spikes and non-source files", () => {
  const files = Object.fromEntries(
    [
      "packages/example/dist/output.js",
      "packages/example/dist/types.d.ts",
      "packages/example/coverage/report.html",
      "packages/example/node_modules/dependency/index.js",
      "packages/example/prototype/demo.ts",
      "packages/example/spikes/probe.ts",
      "prototype/demo.ts",
      "spikes/probe.ts",
      "outside.js",
      "packages/example/package.json",
      "packages/example/README.md",
    ].map((path) => [path, "no header\n"]),
  );
  files["packages/example/src/index.ts"] = `// ${identifier}\nexport {};\n`;
  const result = check(fixture(files));
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("checked 1 package source files");
});

test("refuses an empty package source tree rather than silently passing", () => {
  const result = check(fixture({}));
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("No package source files found");
});

test("project lint checks and CI enforce licence headers", () => {
  const packageText = readFileSync(join(root, "package.json"), "utf8");
  const { scripts } = JSON.parse(packageText);
  expect(scripts["licence:check"]).toBe("node scripts/check-licence-headers.mjs");
  expect(scripts.lint).toContain(`${scripts["licence:check"]} &&`);
  expect(defaultCheckCommands(packageText, "pnpm")).toContainEqual({
    name: "lint",
    command: "pnpm run lint",
  });
  const workflow = parse(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8"));
  expect(workflow.jobs.checks.steps).toContainEqual({ run: "pnpm licence:check" });
});
