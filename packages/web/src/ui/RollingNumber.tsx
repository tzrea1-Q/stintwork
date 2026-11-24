// SPDX-License-Identifier: Apache-2.0
import { animate, MotionGlobalConfig } from "motion/react";
import { useEffect, useRef } from "react";
import { spring, useReducedMotionSafe } from "./motion";

export function RollingNumber({ value }: { value: number }) {
  const digits = useRef<HTMLSpanElement>(null);
  const current = useRef(value);
  const reduced = useReducedMotionSafe();
  useEffect(() => {
    if (reduced || MotionGlobalConfig.skipAnimations) {
      current.current = value;
      if (digits.current) digits.current.textContent = String(value);
      return;
    }
    const animation = animate(current.current, value, {
      ...spring.number,
      onUpdate: (latest) => {
        current.current = latest;
        if (digits.current) digits.current.textContent = String(Math.round(latest));
      },
    });
    return () => animation.stop();
  }, [value, reduced]);
  return (
    <span role="img" className="tabular-nums" aria-label={String(value)}>
      <span aria-hidden="true" ref={digits}>
        {value}
      </span>
    </span>
  );
}
