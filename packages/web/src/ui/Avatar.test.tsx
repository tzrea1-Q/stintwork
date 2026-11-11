// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge } from "./Avatar";
test("exposes named fallback", () => {
  render(
    <Avatar role="img" aria-label="Codex">
      <AvatarFallback>C</AvatarFallback>
    </Avatar>,
  );
  expect(screen.getByRole("img", { name: "Codex" })).toHaveTextContent("C");
});

test("supports sizes, group, count and badge", () => {
  const { container } = render(
    <AvatarGroup>
      <Avatar size="sm" role="img" aria-label="Codex">
        <AvatarFallback>C</AvatarFallback>
        <AvatarBadge>1</AvatarBadge>
      </Avatar>
      <AvatarGroupCount>2</AvatarGroupCount>
    </AvatarGroup>,
  );
  expect(screen.getByRole("img", { name: "Codex" })).toHaveAttribute("data-size", "sm");
  expect(container.querySelector('[data-slot="avatar-badge"]')).toHaveTextContent("1");
  expect(container.querySelector('[data-slot="avatar-group-count"]')).toHaveTextContent("2");
});
