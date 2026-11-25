// SPDX-License-Identifier: Apache-2.0
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
test("Work item files use tokens for arbitrary sizes and colors", () => {
  const files = [
    ...readdirSync(dir)
      .filter((name) => name !== "no-hardcoded.test.ts" && /\.tsx?$/.test(name))
      .map((name) => join(dir, name)),
    join(dir, "../WorkItemDrawer.tsx"),
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const values = source.match(/-\[[^\]]*\]/g) ?? [];
    expect(
      values.filter(
        (value) =>
          /px|#|em|rgb|oklch/i.test(value) &&
          // Existing property grid class is part of the drawer behavior contract.
          value !== "-[1rem_7.75rem_minmax(0,1fr)]" &&
          !/^-\[(?:length:)?var\(--[\w-]+\)\]$/.test(value),
      ),
      file,
    ).toEqual([]);
  }
});
