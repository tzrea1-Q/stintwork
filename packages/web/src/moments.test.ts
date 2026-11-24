// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { becameResolved, becameShipped, newlyArrived, rose } from "./moments";

test("detects transitions only after a previous snapshot", () => {
  expect(newlyArrived(undefined, ["a"])).toEqual([]);
  expect(newlyArrived(new Set(["a"]), ["a", "b"])).toEqual(["b"]);
  expect(newlyArrived(new Set(["a", "b"]), ["a"])).toEqual([]);
  expect(rose(undefined, 1)).toBe(false);
  expect(rose(1, 2)).toBe(true);
  expect(rose(2, 2)).toBe(false);
  expect(rose(2, 1)).toBe(false);
  expect(becameResolved(undefined, true)).toBe(false);
  expect(becameResolved(false, true)).toBe(true);
  expect(becameResolved(true, true)).toBe(false);
  expect(becameResolved(true, false)).toBe(false);
  expect(becameShipped(undefined, true)).toBe(false);
  expect(becameShipped("review:review", true)).toBe(true);
  expect(becameShipped("shipped", true)).toBe(false);
  expect(becameShipped("ship:ship", false)).toBe(false);
});
