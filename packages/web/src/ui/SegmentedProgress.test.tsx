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
  rerender(<SegmentedProgress label="Work" value={3} total={41} />);
  expect(bar.children).toHaveLength(1);
});

test("shows twenty distinct segments", () => {
  render(<SegmentedProgress label="Work" value={7} total={20} />);
  const bar = screen.getByRole("progressbar", { name: "Work" });
  expect(bar.children).toHaveLength(20);
  expect(bar.firstElementChild).toHaveClass("min-w-0.5", "bg-running");
});

test("shows unfilled segments against a transparent track", () => {
  render(<SegmentedProgress label="Work" value={0} total={4} />);
  const bar = screen.getByRole("progressbar", { name: "Work" });
  expect(bar.children).toHaveLength(4);
  for (const segment of bar.children) expect(segment).toHaveClass("bg-foreground/10");
  expect(bar).not.toHaveClass("bg-muted");
});
