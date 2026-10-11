// SPDX-License-Identifier: Apache-2.0
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] ?? fileURLToPath(new URL("..", import.meta.url)));
const extensions = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".html",
]);
const excludedDirectories = new Set(["node_modules", "dist", "coverage", "prototype", "spikes"]);
const missing = [];
let checked = 0;

function checkDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) checkDirectory(path);
      continue;
    }
    const extension = extname(entry.name);
    if (!entry.isFile() || !extensions.has(extension)) continue;
    checked++;
    const source = readFileSync(path, "utf8")
      .replace(/^\uFEFF/, "")
      .replace(/^#![^\r\n]*(?:\r?\n|$)/, "");
    const comment = source.match(
      extension === ".html"
        ? /^\s*<!--([\s\S]*?)-->/
        : extension === ".css"
          ? /^\s*\/\*([\s\S]*?)\*\//
          : /^\s*(?:\/\/([^\r\n]*)|\/\*([\s\S]*?)\*\/)/,
    );
    if (
      !/^\s*(?:\*\s*)?SPDX-License-Identifier: Apache-2\.0\s*$/m.test(
        comment?.[1] ?? comment?.[2] ?? "",
      )
    )
      missing.push(relative(root, path));
  }
}

checkDirectory(join(root, "packages"));
if (missing.length || !checked) {
  console.error(
    missing.length
      ? `Missing Apache-2.0 SPDX header:\n${missing.join("\n")}`
      : "No package source files found.",
  );
  process.exitCode = 1;
} else {
  console.log(`Licence headers: checked ${checked} package source files.`);
}
