// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, expect, test, vi } from "vitest";

let scheme: { matches: boolean; addEventListener: ReturnType<typeof vi.fn> };
let motion: typeof scheme;
let changeScheme: () => void;
let changeMotion: () => void;
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  scheme = {
    matches: false,
    addEventListener: vi.fn((_, callback) => {
      changeScheme = callback;
    }),
  };
  motion = {
    matches: false,
    addEventListener: vi.fn((_, callback) => {
      changeMotion = callback;
    }),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => (query.includes("color-scheme") ? scheme : motion)),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("empty storage defaults both choices to system", async () => {
  const store = await import("./appearance");
  expect(store.getTheme()).toBe("system");
  expect(store.getMotion()).toBe("system");
});
test("restores stored choices on startup", async () => {
  localStorage.setItem("stintwork.theme", "dark");
  localStorage.setItem("stintwork.motion", "reduced");
  const store = await import("./appearance");
  expect(store.getTheme()).toBe("dark");
  expect(store.getMotion()).toBe("reduced");
  expect(document.documentElement).toHaveClass("dark");
  expect(document.documentElement).toHaveAttribute("data-motion", "reduced");
});
test("invalid or inaccessible storage falls back to system", async () => {
  localStorage.setItem("stintwork.theme", "wrong");
  localStorage.setItem("stintwork.motion", "wrong");
  let store = await import("./appearance");
  expect([store.getTheme(), store.getMotion()]).toEqual(["system", "system"]);
  vi.resetModules();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("denied");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("denied");
  });
  store = await import("./appearance");
  expect([store.getTheme(), store.getMotion()]).toEqual(["system", "system"]);
  expect(() => {
    store.setTheme("dark");
    store.setMotion("full");
  }).not.toThrow();
});
test("theme overrides and follows live system changes", async () => {
  const store = await import("./appearance");
  store.setTheme("dark");
  expect(document.documentElement).toHaveClass("dark");
  scheme.matches = true;
  store.setTheme("light");
  expect(document.documentElement).not.toHaveClass("dark");
  store.setTheme("system");
  expect(document.documentElement).toHaveClass("dark");
  scheme.matches = false;
  changeScheme();
  expect(document.documentElement).not.toHaveClass("dark");
  expect(localStorage.getItem(store.themeStorageKey)).toBe("system");
});
test("motion overrides and follows live system changes", async () => {
  const store = await import("./appearance");
  store.setMotion("reduced");
  expect(document.documentElement).toHaveAttribute("data-motion", "reduced");
  motion.matches = true;
  store.setMotion("full");
  expect(document.documentElement).toHaveAttribute("data-motion", "full");
  expect(localStorage.getItem(store.motionStorageKey)).toBe("full");
  store.setMotion("system");
  expect(document.documentElement).toHaveAttribute("data-motion", "reduced");
  motion.matches = false;
  changeMotion();
  expect(document.documentElement).toHaveAttribute("data-motion", "full");
});
