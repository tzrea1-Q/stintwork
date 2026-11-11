// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import {
  Item,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemFooter,
  ItemSeparator,
} from "./Item";
test("renders its content", () => {
  const { container } = render(<Item>Content</Item>);
  expect(screen.getByText("Content")).toBeInTheDocument();
  expect(container.firstElementChild).toHaveAttribute("data-slot", "item");
});

test("composes a link and exposes item variants", () => {
  render(
    <Item asChild variant="outline" size="sm">
      <a href="#detail">Details</a>
    </Item>,
  );
  expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute("data-variant", "outline");
  expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute("data-size", "sm");
});

test("composes item parts in a list", () => {
  const { container } = render(
    <ItemGroup>
      <Item>
        <ItemHeader>Header</ItemHeader>
        <ItemMedia variant="icon">Icon</ItemMedia>
        <ItemContent>
          <ItemTitle>Title</ItemTitle>
          <ItemDescription>Description</ItemDescription>
        </ItemContent>
        <ItemActions>Actions</ItemActions>
        <ItemFooter>Footer</ItemFooter>
      </Item>
      <ItemSeparator />
    </ItemGroup>,
  );
  expect(screen.getByRole("list")).toHaveAttribute("data-slot", "item-group");
  for (const slot of [
    "item-header",
    "item-media",
    "item-content",
    "item-title",
    "item-description",
    "item-actions",
    "item-footer",
    "item-separator",
  ])
    expect(container.querySelector(`[data-slot="${slot}"]`)).toBeInTheDocument();
});
