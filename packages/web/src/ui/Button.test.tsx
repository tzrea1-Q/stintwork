// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Button } from "./Button";

test("a named button supports keyboard activation, disabled state and link composition", async () => {
  const user = userEvent.setup();
  const activate = vi.fn();
  render(
    <>
      <Button onClick={activate}>Save</Button>
      <Button disabled>Delete</Button>
      <Button asChild variant="ghost" size="sm">
        <a href="#details">Details</a>
      </Button>
    </>,
  );
  await user.tab();
  expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(activate).toHaveBeenCalledOnce();
  await user.tab();
  expect(screen.getByRole("link", { name: "Details" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
});
