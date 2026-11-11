// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import userEvent from "@testing-library/user-event";
import { Toggle } from "./Toggle";
test("toggles with keyboard", async () => {
  const user = userEvent.setup();
  render(<Toggle>Bold</Toggle>);
  await user.tab();
  await user.keyboard("[Space]");
  expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
});

test("exposes variant and size", () => {
  render(
    <Toggle variant="outline" size="sm">
      Bold
    </Toggle>,
  );
  expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("data-slot", "toggle");
  expect(screen.getByRole("button", { name: "Bold" })).toHaveClass("border");
});
