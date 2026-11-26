// SPDX-License-Identifier: Apache-2.0
// @vitest-environment node
import { expect, test } from "vitest";
import { getReducedMotion, getTheme } from "./appearance";
import { useReducedMotionSafe } from "./ui/motion";

test("appearance and motion modules load without a DOM", () => {
  expect(getTheme()).toBe("system");
  expect(getReducedMotion()).toBe(false);
  expect(useReducedMotionSafe).toBeTypeOf("function");
});
