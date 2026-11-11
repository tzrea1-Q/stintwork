// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Kbd } from "./Kbd";
test("renders keyboard text", () => {
  render(<Kbd>Esc</Kbd>);
  expect(screen.getByText("Esc").tagName).toBe("KBD");
});
