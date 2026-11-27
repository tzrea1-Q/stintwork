// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { expect, test } from "vitest";
import {
  blur,
  ease,
  pressScale,
  scale,
  shift,
  spring,
  stagger,
  staggerDelay,
  tween,
} from "./motion";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const docs = read("../../../../docs/agents/frontend.md");
const css = read("../styles/tokens.css");
const row = (name: string) => {
  const match = docs.match(new RegExp(`^\\| \`${name.replace(".", "\\.")}\` \\| ([^|]+) \\|`, "m"));
  expect(match, `missing Motion table row ${name}`).not.toBeNull();
  return match?.[1] ?? "";
};

test("motion tokens match the documented table", () => {
  const springs = {
    press: [0.15, 0.3],
    pop: [0.25, 0.25],
    selection: [0.3, 0.2],
    surface: [0.4, 0.15],
    layout: [0.45, 0.15],
    arrive: [0.5, 0.3],
    celebrate: [0.6, 0.45],
    number: [0.8, 0],
  } as const;
  for (const [name, [duration, bounce]] of Object.entries(springs)) {
    expect(spring[name as keyof typeof spring]).toEqual({
      type: "spring",
      visualDuration: duration,
      bounce,
    });
    expect(row(`spring.${name}`)).toMatch(new RegExp(`${duration}.*bounce ${bounce}`));
  }
  expect(ease).toEqual({
    out: [0.23, 1, 0.32, 1],
    soft: [0.215, 0.61, 0.355, 1],
    away: [0.33, 0.17, 0.67, 0.5],
  });
  const durations = {
    color: 150,
    fade: 200,
    menu: 180,
    overlay: 300,
    sheet: 400,
    disclosure: 300,
    swap: 180,
    dismiss: 180,
  };
  for (const [name, ms] of Object.entries(durations)) {
    expect(tween[name as keyof typeof tween].duration).toBe(ms / 1000);
    expect(row(`tween.${name}`)).toContain(`${ms}ms`);
  }
  expect(tween).toEqual({
    color: { duration: 0.15, ease: [0.25, 0.1, 0.25, 1] },
    fade: { duration: 0.2, ease: ease.out },
    menu: { duration: 0.18, ease: ease.soft },
    overlay: { duration: 0.3, ease: ease.soft },
    sheet: { duration: 0.4, ease: ease.soft },
    disclosure: { duration: 0.3, ease: ease.soft },
    swap: { duration: 0.18, ease: ease.out },
    dismiss: { duration: 0.18, ease: ease.away },
  });
  expect(scale).toEqual({
    tooltip: 0.8,
    popover: 0.9,
    menu: 0.9,
    dialog: 0.92,
    palette: 0.96,
    removedCard: 0.96,
  });
  expect(shift).toEqual({ panel: 6, arrive: 12 });
  expect(blur).toEqual({ swap: 2, surface: 6 });
  expect(stagger).toEqual({ interval: 0.035, maxItems: 12, maxDelay: 0.3 });
  expect(pressScale).toEqual({ control: 0.97, card: 0.985 });
  expect(row("scale")).toMatch(
    /tooltip 0\.8, popover and menu 0\.9, dialog 0\.92, palette 0\.96, removed card 0\.96/,
  );
  expect(row("shift")).toMatch(/panel 6px, arrive 12px/);
  expect(row("blur")).toMatch(/swap 2px, surface 6px/);
  expect(row("stagger")).toMatch(/35ms per item, at most 12 items and 300ms/);
  expect(row("spring.press")).toContain("0.15");
  for (const curve of Object.values(ease))
    expect(docs).toContain(`cubic-bezier(${curve.join(", ")})`);
});

test("CSS durations and curves match the tokens", () => {
  for (const [name, token] of Object.entries(tween))
    expect(css).toContain(`--motion-duration-${name}: ${token.duration * 1000}ms;`);
  for (const [name, curve] of Object.entries({ ...ease, color: tween.color.ease }))
    expect(css).toContain(`--motion-ease-${name}: cubic-bezier(${curve.join(", ")});`);
});

test("stagger caps its item count and delay", () => {
  expect(staggerDelay(0)).toBe(0);
  expect(staggerDelay(1)).toBe(0.035);
  expect(staggerDelay(11)).toBe(0.3);
  expect(staggerDelay(100)).toBe(0.3);
});

test("native details use global height transitions and open at their natural height", () => {
  const styles = read("../style.css");
  expect(styles).toMatch(/@layer base\s*\{\s*details\s*\{\s*interpolate-size:\s*allow-keywords;/);
  expect(styles).toMatch(
    /(?:^|\n)\s*details::details-content\s*\{[^}]*height:\s*0;[^}]*transition:/,
  );
  expect(styles).toMatch(/details\[open\]::details-content\s*\{\s*height:\s*auto;/);
  expect(styles).toMatch(
    /\[data-motion="reduced"\]\s+details::details-content\s*\{\s*transition:\s*none;/,
  );
  expect(styles).not.toContain("@starting-style");
});

test("reduced motion keeps disclosure state indicators visible", () => {
  const styles = read("../style.css");
  const reducedRules = [...styles.matchAll(/\[data-motion="reduced"\]([^{}]*)\{([^{}]*)\}/g)];
  expect(
    reducedRules.some(
      (match) =>
        match[1].includes(".group\\/disclosure summary svg") && /transition:\s*none/.test(match[2]),
    ),
  ).toBe(true);
  for (const [, , rule] of reducedRules)
    expect(rule).not.toMatch(/(?:^|[;{])\s*(?:rotate|transform)\s*:\s*none\b/);
});
