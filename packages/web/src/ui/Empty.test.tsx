// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Empty } from "./Empty";
test("renders its content", () => {
  const { container } = render(<Empty>Content</Empty>);
  expect(screen.getByText("Content")).toBeInTheDocument();
  expect(container.firstElementChild).toHaveAttribute("data-slot", "empty");
});
