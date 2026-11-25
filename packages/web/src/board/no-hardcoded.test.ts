// SPDX-License-Identifier: Apache-2.0
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
const dir = dirname(fileURLToPath(import.meta.url));
test("Board files use tokens for arbitrary sizes and colors", () => {
  const files = [
    ...readdirSync(dir)
      .filter((name) => name !== "no-hardcoded.test.ts" && /\.tsx?$/.test(name))
      .map((name) => join(dir, name)),
    join(dir, "../Column.tsx"),
    join(dir, "../WorkItemCard.tsx"),
    join(dir, "../Board.tsx"),
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    expect(source.match(/(?:font|tracking)-\[[^\]]+\]/g) ?? [], file).toEqual([]);
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

test("stage headers have no nested strip scroll container", () => {
  for (const file of ["../Board.tsx", "StageStrip.tsx"]) {
    expect(readFileSync(join(dir, file), "utf8")).not.toContain("stage-strip");
  }
});
