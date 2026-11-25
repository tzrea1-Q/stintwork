// SPDX-License-Identifier: Apache-2.0
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
const dir = dirname(fileURLToPath(import.meta.url));
test("Overview files use tokens for arbitrary sizes and colors", () => {
  const files = [
    ...readdirSync(dir)
      .filter((name) => name !== "no-hardcoded.test.ts" && /\.tsx?$/.test(name))
      .map((name) => join(dir, name)),
    join(dir, "../Overview.tsx"),
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const values = source.match(/-\[[^\]]*\]/g) ?? [];
    expect(
      values.filter(
        (value) =>
          /px|#|em|rgb|oklch/i.test(value) && !/^-\[(?:length:)?var\(--[\w-]+\)\]$/.test(value),
      ),
      file,
    ).toEqual([]);
  }
});
