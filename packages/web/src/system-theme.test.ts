// SPDX-License-Identifier: Apache-2.0
import { expect, test, vi } from "vitest";

test("tracks the system color scheme", async () => {
  let listener: () => void = () => {};
  const scheme = {
    matches: true,
    addEventListener: vi.fn((_, callback) => {
      listener = callback;
    }),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => scheme),
  );
  vi.resetModules();
  await import("./system-theme");
  expect(document.documentElement).toHaveClass("dark");
  scheme.matches = false;
  listener();
  expect(document.documentElement).not.toHaveClass("dark");
  vi.unstubAllGlobals();
});
