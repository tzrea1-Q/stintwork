// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Progress } from "./Progress";
test("exposes progress", () => {
  render(<Progress value={40} max={80} aria-label="Progress" />);
  expect(screen.getByRole("progressbar", { name: "Progress" })).toHaveAttribute(
    "aria-valuenow",
    "40",
  );
  expect(screen.getByRole("progressbar").firstChild).toHaveStyle({ transform: "translateX(-50%)" });
});
