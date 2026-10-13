// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { cn } from "./cn";

test("conditional classes preserve the last Tailwind override", () => {
  expect(cn("px-2 bg-surface", false && "hidden", ["px-4"], { "text-muted": true })).toBe(
    "bg-surface px-4 text-muted",
  );
});
