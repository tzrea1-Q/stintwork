// SPDX-License-Identifier: Apache-2.0
import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion
      features={() => import("./motion-features").then((module) => module.default)}
      strict
    >
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
