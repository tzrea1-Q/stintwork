// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "motion/react";
import { useRef, useState } from "react";
import { expect, test, vi } from "vitest";
import { Button } from "./Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./Dialog";
import { MotionRoot } from "./MotionRoot";
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

test("backdrop clicks dismiss a reopened triggerless dialog and restore focus", async () => {
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
  const trigger = screen.getByRole("button", { name: "Preview" });
  for (let attempt = 0; attempt < 2; attempt++) {
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Preview item" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy" })).toHaveFocus());
    const backdrop = dialog.previousElementSibling;
    if (!backdrop) throw new Error("Dialog backdrop missing");
    fireEvent(backdrop, new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    fireEvent.mouseDown(backdrop);
    fireEvent(backdrop, new MouseEvent("pointerup", { bubbles: true, button: 0 }));
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  }
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

test.each(["controlled", "uncontrolled"])("%s dialog returns focus after close", async (mode) => {
  const user = userEvent.setup();
  function Example() {
    const [open, setOpen] = useState(false);
    return (
      <Dialog open={mode === "controlled" ? open : undefined} onOpenChange={setOpen}>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Example</DialogTitle>
          <button type="button">Inside</button>
        </DialogContent>
      </Dialog>
    );
  }
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "Open" });
  await user.click(trigger);
  expect(screen.getByRole("button", { name: "Inside" })).toHaveFocus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("nested dialogs close only the topmost on Escape", async () => {
  const user = userEvent.setup();
  render(
    <Dialog>
      <DialogTrigger>Outer</DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Outer dialog</DialogTitle>
        <Dialog>
          <DialogTrigger>Inner</DialogTrigger>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>Inner dialog</DialogTitle>
            <button type="button">Inside</button>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>,
  );
  await user.click(screen.getByRole("button", { name: "Outer" }));
  await user.click(screen.getByRole("button", { name: "Inner" }));
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Inner dialog" })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("dialog", { name: "Outer dialog" })).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.getByRole("button", { name: "Outer" })).toHaveFocus());
});

test("returnFocusRef overrides the trigger", async () => {
  const user = userEvent.setup();
  function Example() {
    const ref = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button type="button" ref={ref}>
          Destination
        </button>
        <Dialog>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent returnFocusRef={ref} aria-describedby={undefined}>
            <DialogTitle>Example</DialogTitle>
          </DialogContent>
        </Dialog>
      </>
    );
  }
  render(<Example />);
  await user.click(screen.getByRole("button", { name: "Open" }));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.getByRole("button", { name: "Destination" })).toHaveFocus());
});

test("an open dialog keeps its content node across parent re-renders", async () => {
  const user = userEvent.setup();
  function Example() {
    const [count, setCount] = useState(0);
    return (
      <Dialog>
        <DialogTrigger>Open stable dialog</DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Stable dialog</DialogTitle>
          <Button onClick={() => setCount((value) => value + 1)}>Count {count}</Button>
        </DialogContent>
      </Dialog>
    );
  }
  render(
    <MotionRoot>
      <Example />
    </MotionRoot>,
  );
  await user.click(screen.getByRole("button", { name: "Open stable dialog" }));
  const button = screen.getByRole("button", { name: "Count 0" });
  await user.click(button);
  expect(button.isConnected).toBe(true);
  expect(screen.getByRole("button", { name: "Count 1" })).toBe(button);
});

test.each(["left", "right"] as const)(
  "a %s sheet starts visible and retains an edge entrance with motion enabled",
  (placement) => {
    MotionGlobalConfig.skipAnimations = false;
    try {
      render(
        <MotionRoot>
          <Dialog defaultOpen>
            <DialogContent placement={placement} aria-describedby={undefined}>
              <DialogTitle>Animated sheet</DialogTitle>
            </DialogContent>
          </Dialog>
        </MotionRoot>,
      );
      const dialog = screen.getByRole("dialog", { name: "Animated sheet" });
      expect(dialog).toHaveStyle({ opacity: "1", transform: "none" });
      expect(dialog).toHaveClass(
        placement === "left"
          ? "motion-safe:starting:-translate-x-full"
          : "motion-safe:starting:translate-x-full",
      );
    } finally {
      MotionGlobalConfig.skipAnimations = true;
    }
  },
);

test("a reduced-motion sheet starts with opacity only", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  MotionGlobalConfig.skipAnimations = false;
  try {
    render(
      <MotionRoot>
        <Dialog defaultOpen>
          <DialogContent placement="right" aria-describedby={undefined}>
            <DialogTitle>Reduced sheet</DialogTitle>
          </DialogContent>
        </Dialog>
      </MotionRoot>,
    );
    const dialog = screen.getByRole("dialog", { name: "Reduced sheet" });
    expect(dialog).toHaveStyle({ opacity: "0" });
    expect(dialog.style.transform === "" || dialog.style.transform === "none").toBe(true);
  } finally {
    MotionGlobalConfig.skipAnimations = true;
    vi.unstubAllGlobals();
  }
});
