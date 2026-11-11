// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const webRoot = existsSync(resolve(process.cwd(), "packages/web"))
  ? resolve(process.cwd(), "packages/web")
  : process.cwd();
const css = readFileSync(resolve(webRoot, "src/styles/tokens.css"), "utf8");

function luminance(color: string): number {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(color);
  if (!match) throw new Error(`Expected an opaque OKLCH color: ${color}`);
  const [, lightness, chroma, hue] = match.map(Number);
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgb.reduce(
    (sum, value, i) => sum + Math.max(0, Math.min(1, value)) * [0.2126, 0.7152, 0.0722][i],
    0,
  );
}

test("spacing stays in pixels and status text meets 4.5:1 contrast", () => {
  expect(css).toContain("--space-unit: 4px;");
  expect(css).toContain("--spacing: var(--space-unit);");
  const [light, dark] = css.split(".dark {");
  for (const theme of [light, dark.split("@theme inline")[0]]) {
    const color = (name: string) => {
      const match = new RegExp(`--${name}: (oklch\\([^;]+\\));`).exec(theme);
      if (!match) throw new Error(`Missing ${name}`);
      return luminance(match[1]);
    };
    for (const name of ["destructive", "running", "attention", "blocked", "success", "stopped"]) {
      const background = color(name === "destructive" ? name : `${name}-soft`);
      const foreground = color(`${name}-foreground`);
      const contrast =
        (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
      expect(contrast, name).toBeGreaterThanOrEqual(4.5);
    }
  }
});
