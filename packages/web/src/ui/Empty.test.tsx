// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import {
  Empty,
  EmptyMedia,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  EmptyContent,
} from "./Empty";
test("renders its content", () => {
  const { container } = render(<Empty>Content</Empty>);
  expect(screen.getByText("Content")).toBeInTheDocument();
  expect(container.firstElementChild).toHaveAttribute("data-slot", "empty");
});

test("supports icon media and description", () => {
  const { container } = render(
    <Empty>
      <EmptyMedia variant="icon">!</EmptyMedia>
      <EmptyDescription>Nothing here</EmptyDescription>
    </Empty>,
  );
  expect(container.querySelector('[data-slot="empty-icon"]')).toHaveAttribute(
    "data-variant",
    "icon",
  );
  expect(screen.getByText("Nothing here")).toHaveAttribute("data-slot", "empty-description");
});

test("composes empty state parts", () => {
  const { container } = render(
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Title</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>Content</EmptyContent>
    </Empty>,
  );
  for (const slot of ["empty-header", "empty-title", "empty-content"])
    expect(container.querySelector(`[data-slot="${slot}"]`)).toBeInTheDocument();
});
