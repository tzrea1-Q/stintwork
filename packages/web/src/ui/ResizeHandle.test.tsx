// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { ResizeHandle } from "./ResizeHandle";
import { TooltipProvider } from "./Tooltip";

test("resizes with keyboard and pointer within the bounds", () => {
  function Example() {
    const [value, setValue] = useState(560);
    return (
      <TooltipProvider>
        <ResizeHandle value={value} min={400} max={864} onChange={setValue} label="Resize" />
      </TooltipProvider>
    );
  }
  render(<Example />);
  const handle = screen.getByRole("separator", { name: "Resize" });
  expect(handle).toHaveAttribute("aria-valuemin", "400");
  expect(handle).toHaveAttribute("aria-valuemax", "864");
  fireEvent.keyDown(handle, { key: "ArrowLeft" });
  expect(handle).toHaveAttribute("aria-valuenow", "576");
  fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
  expect(handle).toHaveAttribute("aria-valuenow", "512");
  fireEvent.keyDown(handle, { key: "Home" });
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(handle).toHaveAttribute("aria-valuenow", "400");
  fireEvent.keyDown(handle, { key: "End" });
  fireEvent.keyDown(handle, { key: "ArrowLeft" });
  expect(handle).toHaveAttribute("aria-valuenow", "864");
  fireEvent.keyDown(handle, { key: "Home" });
  vi.stubGlobal("PointerEvent", MouseEvent);
  handle.setPointerCapture = vi.fn();
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 500 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 300 });
  expect(handle).toHaveAttribute("aria-valuenow", "600");
  fireEvent.pointerUp(handle, { pointerId: 1 });
  vi.unstubAllGlobals();
});
