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

test("press feedback follows pointer and keyboard and ignores disabled controls", async () => {
  const { fireEvent } = await import("@testing-library/react");
  render(
    <>
      <Button>Press</Button>
      <Button disabled>Disabled</Button>
    </>,
  );
  const button = screen.getByRole("button", { name: "Press" });
  fireEvent.pointerDown(button);
  expect(button).toHaveAttribute("data-pressed", "true");
  fireEvent.pointerUp(button);
  expect(button).not.toHaveAttribute("data-pressed");
  for (const key of ["Enter", " "]) {
    fireEvent.keyDown(button, { key });
    expect(button).toHaveAttribute("data-pressed", "true");
    fireEvent.keyUp(button, { key });
    expect(button).not.toHaveAttribute("data-pressed");
  }
  const disabled = screen.getByRole("button", { name: "Disabled" });
  fireEvent.pointerDown(disabled);
  fireEvent.keyDown(disabled, { key: "Enter" });
  expect(disabled).not.toHaveAttribute("data-pressed");
});

test("tooltip trigger composes press handlers and releases outside", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const { Tooltip, TooltipProvider, TooltipTrigger } = await import("./Tooltip");
  const onPointerDown = vi.fn();
  const onKeyDown = vi.fn();
  render(
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button onPointerDown={onPointerDown} onKeyDown={onKeyDown}>
            Trigger
          </Button>
        </TooltipTrigger>
      </Tooltip>
    </TooltipProvider>,
  );
  const button = screen.getByRole("button", { name: "Trigger" });
  fireEvent.pointerDown(button);
  expect(onPointerDown).toHaveBeenCalledOnce();
  expect(button).toHaveAttribute("data-pressed", "true");
  fireEvent.pointerLeave(button);
  expect(button).not.toHaveAttribute("data-pressed");
  fireEvent.keyDown(button, { key: "Enter" });
  expect(onKeyDown).toHaveBeenCalledOnce();
  expect(button).toHaveAttribute("data-pressed", "true");
  fireEvent.keyUp(button, { key: "Enter" });
  fireEvent.pointerDown(button);
  fireEvent.pointerUp(window);
  expect(button).not.toHaveAttribute("data-pressed");
});

test("preventing a press event suppresses feedback", async () => {
  const { fireEvent } = await import("@testing-library/react");
  render(
    <Button
      onPointerDown={(event) => event.preventDefault()}
      onKeyDown={(event) => event.preventDefault()}
    >
      Blocked
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Blocked" });
  fireEvent.pointerDown(button);
  fireEvent.keyDown(button, { key: " " });
  expect(button).not.toHaveAttribute("data-pressed");
});

test("other controls compose caller handlers with press feedback", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const { Toggle } = await import("./Toggle");
  const { ToggleGroup, ToggleGroupItem } = await import("./ToggleGroup");
  const { Checkbox } = await import("./Checkbox");
  const calls: string[] = [];
  render(
    <>
      <Toggle onPointerDown={() => calls.push("toggle")}>Toggle</Toggle>
      <ToggleGroup type="single">
        <ToggleGroupItem value="one" onPointerDown={() => calls.push("item")}>
          Item
        </ToggleGroupItem>
      </ToggleGroup>
      <Checkbox aria-label="Check" onPointerDown={() => calls.push("check")} />
    </>,
  );
  for (const name of ["Toggle", "Item", "Check"]) {
    const element = screen.getByRole(
      name === "Check" ? "checkbox" : name === "Item" ? "radio" : "button",
      { name },
    );
    fireEvent.pointerDown(element);
    expect(element).toHaveAttribute("data-pressed", "true");
    fireEvent.pointerCancel(window);
    expect(element).not.toHaveAttribute("data-pressed");
  }
  expect(calls).toEqual(["toggle", "item", "check"]);
});
