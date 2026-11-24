// SPDX-License-Identifier: Apache-2.0
import type { Page } from "@playwright/test";
import { afterEach, expect, test, vi } from "vitest";
import { sampleFrames } from "../e2e/support/frames";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

test("sampleFrames records each animation frame's timestamp and styles", async () => {
  vi.useFakeTimers();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
    window.setTimeout(() => callback(performance.now()), 16),
  );
  const element = document.createElement("div");
  element.id = "surface";
  element.style.cssText = "opacity: 0.5; transform: none; height: 20px";
  document.body.append(element);
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(16, 0, 30, 20));
  const page = {
    evaluate: (
      callback: (argument: { selector: string; ms: number }) => unknown,
      argument: { selector: string; ms: number },
    ) => callback(argument),
  } as unknown as Page;
  const sampled = sampleFrames(page, "#surface", 48);
  await vi.advanceTimersByTimeAsync(48);
  const frames = await sampled;
  expect(frames).toHaveLength(3);
  expect(frames.map((frame) => frame.timestamp - frames[0].timestamp)).toEqual([0, 16, 32]);
  expect(frames[0]).toMatchObject({
    opacity: "0.5",
    transform: "none",
    height: "20px",
    left: 16,
    overflow: expect.any(Number),
  });
});
