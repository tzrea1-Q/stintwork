// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { SegmentedProgress } from "./SegmentedProgress";
test("exposes values and caps visual segments", () => {
  const { rerender } = render(<SegmentedProgress label="Work" value={3} total={5} />);
  const bar = screen.getByRole("progressbar", { name: "Work" });
  expect(bar).toHaveAttribute("aria-valuenow", "3");
  expect(bar).toHaveAttribute("aria-valuemax", "5");
  expect(bar.children).toHaveLength(5);
  rerender(<SegmentedProgress label="Work" value={3} total={13} />);
  expect(bar.children).toHaveLength(1);
});
