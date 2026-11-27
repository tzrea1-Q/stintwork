// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { BoardMotionContext } from "./board-motion";
import { WorkItemCard } from "./WorkItemCard";

vi.mock("motion/react", async (importOriginal) => {
  const motion = await importOriginal<typeof import("motion/react")>();
  const React = await import("react");
  return {
    ...motion,
    m: new Proxy(motion.m, {
      get(target, key) {
        if (key !== "div") return Reflect.get(target, key);
        return React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
          (props, ref) => React.createElement("div", { ...props, ref, "data-motion-node": "true" }),
        );
      },
    }),
  };
});

const snapshot = indexProject(createMemoryRepoFiles({ ".scratch/card/spec.md": "# Card" }), {
  name: "Test",
  branch: "main",
});

test.each([
  [true, false, "off"],
  [false, true, "off"],
  [false, false, "position"],
] as const)(
  "card content is not a layout node with skip=%s reduced=%s",
  (skip, reduced, layout) => {
    render(
      <BoardMotionContext.Provider
        value={{ firstLoad: false, previous: null, skip, instant: false, reduced }}
      >
        <WorkItemCard item={snapshot.workItems[0]} onOpen={vi.fn()} />
      </BoardMotionContext.Provider>,
    );
    const card = screen.getByRole("article");
    expect(card).toHaveAttribute("data-layout", layout);
    expect(card.firstElementChild).not.toHaveAttribute("data-motion-node");
    expect(card.firstElementChild).not.toHaveAttribute("data-layout");
  },
);
