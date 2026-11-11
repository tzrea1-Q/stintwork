// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { ScrollArea } from "./ScrollArea";
test("places children in viewport", () => {
  render(<ScrollArea>Content</ScrollArea>);
  expect(
    screen.getByText("Content").closest("[data-radix-scroll-area-viewport]"),
  ).toBeInTheDocument();
});
