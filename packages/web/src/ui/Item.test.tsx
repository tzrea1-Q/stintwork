// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Item } from "./Item";
test("renders its content", () => {
  const { container } = render(<Item>Content</Item>);
  expect(screen.getByText("Content")).toBeInTheDocument();
  expect(container.firstElementChild).toHaveAttribute("data-slot", "item");
});
