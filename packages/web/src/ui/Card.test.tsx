// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Card } from "./Card";
test("renders its content", () => {
  const { container } = render(<Card>Content</Card>);
  expect(screen.getByText("Content")).toBeInTheDocument();
  expect(container.firstElementChild).toHaveAttribute("data-slot", "card");
});
