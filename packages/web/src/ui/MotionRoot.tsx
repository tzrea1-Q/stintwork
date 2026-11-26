// SPDX-License-Identifier: Apache-2.0
import { LazyMotion, MotionConfig } from "motion/react";
import { type ReactNode, useSyncExternalStore } from "react";
import { getMotion, subscribeAppearance } from "../appearance";

export function MotionRoot({ children }: { children: ReactNode }) {
  const motion = useSyncExternalStore(subscribeAppearance, getMotion, () => "system");
  return (
    <LazyMotion
      features={() => import("./motion-features").then((module) => module.default)}
      strict
    >
      <MotionConfig
        reducedMotion={motion === "reduced" ? "always" : motion === "full" ? "never" : "user"}
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
