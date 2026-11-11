// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import userEvent from "@testing-library/user-event";
import { ToggleGroup, ToggleGroupItem } from "./ToggleGroup";
test("navigates and toggles", async () => {
  const user = userEvent.setup();
  render(
    <ToggleGroup type="multiple">
      <ToggleGroupItem value="a">A</ToggleGroupItem>
      <ToggleGroupItem value="b">B</ToggleGroupItem>
    </ToggleGroup>,
  );
  await user.tab();
  await user.keyboard("{ArrowRight}[Space]");
  expect(screen.getByRole("button", { name: "B" })).toHaveAttribute("aria-pressed", "true");
});
