// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { Input } from "./Input";

test("accepts typing, respects disabled and exposes invalid and focus styles", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Input aria-label="Field" aria-invalid="true" />);
  const field = screen.getByRole("textbox", { name: "Field" });
  await user.type(field, "hello");
  expect(field).toHaveValue("hello");
  expect(field.className).toContain("aria-invalid:border-destructive");
  expect(field.className).toContain("focus-visible:ring-ring");
  rerender(<Input aria-label="Field" disabled />);
  await user.type(field, " more");
  expect(field).toHaveValue("hello");
});
