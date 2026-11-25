// SPDX-License-Identifier: Apache-2.0
export type CardId = "milestone" | "stages" | "next" | "attention" | "activity" | "running";
const orders: Record<1 | 2 | 3, CardId[][]> = {
  1: [["attention", "next", "running", "milestone", "stages", "activity"]],
  2: [
    ["milestone", "stages", "running"],
    ["next", "attention", "activity"],
  ],
  3: [
    ["milestone", "attention"],
    ["stages", "activity"],
    ["next", "running"],
  ],
};
export function assignColumns(count: 1 | 2 | 3, available: readonly CardId[]): CardId[][] {
  const columns = orders[count].map((column) => column.filter((card) => available.includes(card)));
  for (const column of columns) {
    if (column.length) continue;
    const donor = columns.find((other) => other.length > 1);
    const moved = donor?.pop();
    if (moved) column.push(moved);
  }
  return columns.filter((column) => column.length);
}
