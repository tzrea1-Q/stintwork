// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Board } from "./Board";
import { countBoardChanges } from "./board-motion";
import { RollingNumber } from "./ui/RollingNumber";
import { WorkItemCard } from "./WorkItemCard";

const snapshot = indexProject(createMemoryRepoFiles({ ".scratch/one/spec.md": "# One" }), {
  name: "Test",
  branch: "main",
});

test("counts moves, arrivals and removals once", () => {
  const previous = new Map([
    ["same", "a"],
    ["move", "a"],
    ["gone", "a"],
  ]);
  const next = new Map([
    ["same", "a"],
    ["move", "b"],
    ["new", "a"],
  ]);
  expect(countBoardChanges(previous, next)).toBe(3);
  expect(countBoardChanges(previous, previous)).toBe(0);
  expect(
    countBoardChanges(new Map(), new Map(Array.from({ length: 13 }, (_, i) => [String(i), "a"]))),
  ).toBeGreaterThan(12);
});

test("first board mount is marked once per module", () => {
  const first = render(<Board snapshot={snapshot} />);
  expect(first.container.querySelector(".pipeline-app")).toHaveAttribute("data-first-load", "true");
  first.unmount();
  const second = render(<Board snapshot={snapshot} />);
  expect(second.container.querySelector(".pipeline-app")).toHaveAttribute(
    "data-first-load",
    "false",
  );
});

test("rolling number exposes and directly renders the final value when animations are skipped", () => {
  const { rerender } = render(<RollingNumber value={2} />);
  rerender(<RollingNumber value={17} />);
  expect(screen.getByRole("img", { name: "17" })).toBeInTheDocument();
  expect(document.querySelector("[aria-hidden=true]")).toHaveTextContent("17");
});

test("card press keeps click and keyboard activation", async () => {
  const onOpen = vi.fn();
  render(<WorkItemCard item={snapshot.workItems[0]} onOpen={onOpen} />);
  const button = screen.getByRole("button", { name: /one/i });
  fireEvent.pointerDown(button);
  expect(button).toHaveAttribute("data-pressed", "true");
  fireEvent.pointerUp(button);
  fireEvent.keyDown(button, { key: "Enter" });
  expect(button).toHaveAttribute("data-pressed", "true");
  fireEvent.click(button);
  fireEvent.keyUp(button, { key: "Enter" });
  expect(onOpen).toHaveBeenCalledWith("one");
  onOpen.mockClear();
  button.focus();
  await userEvent.keyboard("{Enter}");
  expect(onOpen).toHaveBeenCalledWith("one");
});
