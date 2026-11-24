// SPDX-License-Identifier: Apache-2.0
import type { Page } from "@playwright/test";
import { afterEach, expect, test, vi } from "vitest";
import { waitForRest } from "../e2e/support/frames";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function fixture() {
  vi.useFakeTimers();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
    window.setTimeout(() => callback(performance.now()), 16),
  );
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => window.clearTimeout(id));
  const element = document.createElement("div");
  element.id = "drawer";
  element.style.cssText = "transform: none; translate: none; scale: none; rotate: none";
  document.body.append(element);
  const getAnimations = vi.fn(() => [] as Pick<Animation, "playState" | "pending">[]);
  Object.defineProperty(element, "getAnimations", { value: getAnimations });
  const bounds = vi
    .spyOn(element, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(16, 0, 300, 600));
  const evaluate = vi.fn((callback: (selector: string) => Promise<void>, selector: string) =>
    callback(selector),
  );
  return { element, getAnimations, bounds, evaluate, page: { evaluate } as unknown as Page };
}

test("waitForRest waits through movement and animations for three stable frames", async () => {
  const { element, getAnimations, bounds, evaluate, page } = fixture();
  let settled = false;
  const result = waitForRest(page, "#drawer").then(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(32);
  expect(settled).toBe(false);
  element.style.translate = "76.8%";
  getAnimations.mockReturnValue(
    Array.from({ length: 7 }, () => ({ playState: "running", pending: false })),
  );
  await vi.advanceTimersByTimeAsync(32);
  expect(settled).toBe(false);
  element.style.cssText =
    "transform: matrix(1, 0, 0, 1, 0, 0); translate: 0px 0px; scale: 1; rotate: 0deg";
  getAnimations.mockReturnValue([]);
  bounds.mockReturnValueOnce(new DOMRect(20, 0, 300, 600));
  await vi.advanceTimersByTimeAsync(48);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(16);
  await result;
  expect(settled).toBe(true);
  expect(evaluate).toHaveBeenCalledOnce();
  expect(getAnimations).toHaveBeenCalledWith({ subtree: true });
});

test("waitForRest times out with the last non-identity transform", async () => {
  const { element, page } = fixture();
  element.style.transform = "matrix(1, 0, 0, 1, 2, 0)";
  const result = expect(waitForRest(page, "#drawer")).rejects.toThrow(element.style.transform);
  await vi.advanceTimersByTimeAsync(3000);
  await result;
});

test.each([
  ["translate", "-50% -50%"],
  ["scale", "0.9"],
  ["rotate", "1deg"],
] as const)("waitForRest permits stable %s positioning", async (property, value) => {
  const { element, page } = fixture();
  element.style[property] = value;
  let settled = false;
  const result = waitForRest(page, "#drawer").then(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(48);
  expect(settled).toBe(true);
  await result;
});

test("waitForRest times out while an animation is pending", async () => {
  const { getAnimations, page } = fixture();
  getAnimations.mockReturnValue([{ playState: "paused", pending: true }]);
  const result = expect(waitForRest(page, "#drawer")).rejects.toThrow('"pending":true');
  await vi.advanceTimersByTimeAsync(3000);
  await result;
});
