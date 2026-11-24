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

test("propagates variant, size, spacing and orientation to items", async () => {
  const user = userEvent.setup();
  render(
    <ToggleGroup type="multiple" variant="outline" size="sm" spacing={0} orientation="vertical">
      <ToggleGroupItem value="a">A</ToggleGroupItem>
      <ToggleGroupItem value="b">B</ToggleGroupItem>
    </ToggleGroup>,
  );
  const a = screen.getByRole("button", { name: "A" });
  expect(a).toHaveAttribute("data-variant", "outline");
  expect(a).toHaveAttribute("data-size", "sm");
  expect(a).toHaveAttribute("data-spacing", "0");
  await user.tab();
  await user.keyboard("{ArrowDown}[Space]");
  expect(screen.getByRole("button", { name: "B" })).toHaveAttribute("aria-pressed", "true");
});

test("indicator follows the selected item", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <ToggleGroup type="single" defaultValue="a">
      <ToggleGroupItem value="a">A</ToggleGroupItem>
      <ToggleGroupItem value="b">B</ToggleGroupItem>
    </ToggleGroup>,
  );
  await user.click(screen.getByRole("radio", { name: "B" }));
  expect(container.querySelectorAll('[data-slot="toggle-indicator"]')).toHaveLength(1);
  expect(
    screen.getByRole("radio", { name: "B" }).querySelector('[data-slot="toggle-indicator"]'),
  ).toBeInTheDocument();
});
