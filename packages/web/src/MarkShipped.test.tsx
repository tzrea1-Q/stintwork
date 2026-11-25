// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { MarkShipped } from "./MarkShipped";

test("close icon dismisses mark as shipped", async () => {
  const user = userEvent.setup();
  render(<MarkShipped slug="example" />);
  await user.click(screen.getByRole("button", { name: "Mark as shipped" }));
  const close = screen.getByRole("button", { name: "Close" });
  expect(close.querySelector("svg")).toBeInTheDocument();
  await user.click(close);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
