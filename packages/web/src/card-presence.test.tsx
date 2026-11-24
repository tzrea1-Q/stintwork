// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { render } from "@testing-library/react";
import { AnimatePresence, LazyMotion, MotionGlobalConfig, domMax } from "motion/react";
import { expect, test } from "vitest";
import { WorkItemCard } from "./WorkItemCard";
import { tween } from "./ui/motion";

const snapshot = indexProject(createMemoryRepoFiles({ ".scratch/one/spec.md": "# One" }), {
  name: "Test",
});
const item = snapshot.workItems[0];

function columns({ destination }: { destination: boolean }) {
  const card = <WorkItemCard key={item.slug} item={item} onOpen={() => {}} />;
  return (
    <LazyMotion features={domMax} strict>
      <div>
        <AnimatePresence mode="popLayout">{!destination && card}</AnimatePresence>
      </div>
      <div>
        <AnimatePresence mode="popLayout">{destination && card}</AnimatePresence>
      </div>
    </LazyMotion>
  );
}

test("only the live card owns its identifier during a stage move", async () => {
  MotionGlobalConfig.skipAnimations = false;
  try {
    const view = render(columns({ destination: false }));
    view.rerender(columns({ destination: true }));
    expect(view.container.querySelectorAll('[data-work-item="one"]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-exiting="one"]')).toHaveLength(1);
    const exiting = view.container.querySelector('[data-exiting="one"]');
    expect(exiting).toHaveAttribute("aria-hidden", "true");
    expect(exiting?.querySelector("button.work-item-open")).toBeDisabled();
    await new Promise((resolve) => setTimeout(resolve, tween.dismiss.duration * 1000 + 100));
    expect(view.container.querySelectorAll('[data-work-item="one"]')).toHaveLength(1);
  } finally {
    MotionGlobalConfig.skipAnimations = true;
  }
});
