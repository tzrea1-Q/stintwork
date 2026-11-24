// SPDX-License-Identifier: Apache-2.0
import { createContext } from "react";

export function countBoardChanges(
  previous: ReadonlyMap<string, string>,
  next: ReadonlyMap<string, string>,
) {
  let changes = 0;
  for (const [slug, stage] of previous) if (next.get(slug) !== stage) changes++;
  for (const slug of next.keys()) if (!previous.has(slug)) changes++;
  return changes;
}

export const BoardMotionContext = createContext<{
  firstLoad: boolean;
  previous: ReadonlyMap<string, string> | null;
  skip: boolean;
  reduced: boolean;
}>({ firstLoad: false, previous: null, skip: false, reduced: false });
