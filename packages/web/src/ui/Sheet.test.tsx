// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "./Sheet";

test("a sheet opens from the keyboard and returns focus after close or Escape", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <Sheet>
      <SheetTrigger>Inspect</SheetTrigger>
      <SheetContent side="left">
        <SheetTitle>Work item</SheetTitle>
        <SheetDescription>Item details.</SheetDescription>
        <SheetClose>Done</SheetClose>
      </SheetContent>
    </Sheet>,
  );
  await user.tab();
  await user.keyboard("{Enter}");
  const dialog = await screen.findByRole("dialog", { name: "Work item" });
  expect(container).not.toContainElement(dialog);
  expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByRole("button", { name: "Inspect" })).toHaveFocus());
  await user.keyboard("{Enter}{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("button", { name: "Inspect" })).toHaveFocus());
});
