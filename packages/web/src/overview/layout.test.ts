// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { assignColumns, type CardId } from "./layout";
const all: CardId[] = ["milestone", "stages", "next", "attention", "activity", "running"];
test("assigns cards in each specified reading order", () => {
  expect(assignColumns(3, all)).toEqual([
    ["milestone", "attention"],
    ["stages", "activity"],
    ["next", "running"],
  ]);
  expect(assignColumns(2, all)).toEqual([
    ["milestone", "stages", "running"],
    ["next", "attention", "activity"],
  ]);
  expect(assignColumns(1, all)).toEqual([
    ["attention", "next", "running", "milestone", "stages", "activity"],
  ]);
});
test("fills empty columns when a column has cards to spare", () => {
  expect(assignColumns(3, ["milestone", "attention"])).toEqual([["milestone"], ["attention"], []]);
  expect(assignColumns(2, ["milestone", "stages", "running"])).toEqual([
    ["milestone", "stages"],
    ["running"],
  ]);
  expect(assignColumns(3, ["stages"])).toEqual([["stages"], [], []]);
  expect(assignColumns(2, ["next"])).toEqual([["next"], []]);
  expect(assignColumns(3, [])).toEqual([[], [], []]);
});
