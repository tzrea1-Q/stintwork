// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { StatusChip } from "./StatusChip";
test("renders a hidden pulsing dot", () => {
  render(
    <StatusChip status="running" pulse>
      Running
    </StatusChip>,
  );
  const dot = screen.getByText("Running").firstElementChild;
  expect(dot).toHaveAttribute("aria-hidden", "true");
  expect(dot).toHaveClass("motion-safe:animate-pulse");
});

test("exposes the new status immediately", () => {
  const { rerender } = render(<StatusChip status="running">Running</StatusChip>);
  rerender(<StatusChip status="success">Done</StatusChip>);
  expect(screen.getByText("Done")).toBeVisible();
  expect(screen.queryByText("Running")).not.toBeInTheDocument();
});
