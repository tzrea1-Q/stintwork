// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "./Dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";

test("a conditionally mounted dialog returns focus without a DialogTrigger", async () => {
  const user = userEvent.setup();
  function Preview() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Preview
        </button>
        {open && (
          <Dialog open onOpenChange={setOpen}>
            <DialogContent aria-describedby={undefined}>
              <DialogTitle>Preview item</DialogTitle>
              <button type="button">Copy</button>
            </DialogContent>
          </Dialog>
        )}
      </>
    );
  }
  render(<Preview />);
  await user.click(screen.getByRole("button", { name: "Preview" }));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.getByRole("button", { name: "Preview" })).toHaveFocus());
});

test("a named modal traps focus, dismisses with Escape and restores its trigger", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <Dialog>
      <DialogTrigger>Edit</DialogTrigger>
      <DialogContent>
        <DialogTitle>Edit item</DialogTitle>
        <DialogDescription>Change the name.</DialogDescription>
        <input aria-label="Name" />
        <DialogClose>Cancel</DialogClose>
      </DialogContent>
    </Dialog>,
  );
  await user.tab();
  await user.keyboard("{Enter}");
  const dialog = await screen.findByRole("dialog", { name: "Edit item" });
  expect(dialog).toHaveAccessibleDescription("Change the name.");
  expect(container).not.toContainElement(dialog);
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
  await user.tab();
  await user.tab();
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("only the topmost overlay dismisses and focus returns through its own triggers", async () => {
  const user = userEvent.setup();
  render(
    <Dialog>
      <DialogTrigger>Edit</DialogTrigger>
      <DialogContent>
        <DialogTitle>Edit item</DialogTitle>
        <DialogDescription>Details</DialogDescription>
        <Popover>
          <PopoverTrigger>More</PopoverTrigger>
          <PopoverContent aria-label="More details">
            <button type="button">Action</button>
          </PopoverContent>
        </Popover>
      </DialogContent>
    </Dialog>,
  );
  await user.click(screen.getByRole("button", { name: "Edit" }));
  await user.click(screen.getByRole("button", { name: "More" }));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.getByRole("button", { name: "More" })).toHaveFocus());
  expect(screen.getByRole("dialog", { name: "Edit item" })).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus());
});

test("pending-save hooks prevent Escape and outside dismissal", async () => {
  const user = userEvent.setup();
  render(
    <Dialog>
      <DialogTrigger>Edit</DialogTrigger>
      <DialogContent
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogTitle>Edit item</DialogTitle>
        <DialogDescription>Saving</DialogDescription>
        <DialogClose>Cancel</DialogClose>
      </DialogContent>
    </Dialog>,
  );
  await user.click(screen.getByRole("button", { name: "Edit" }));
  await user.keyboard("{Escape}");
  fireEvent.pointerDown(document.body);
  expect(screen.getByRole("dialog", { name: "Edit item" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
