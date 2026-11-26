// SPDX-License-Identifier: Apache-2.0
import { getReducedMotion, subscribeAppearance } from "../appearance";
import { useEffect, useState, useSyncExternalStore } from "react";

export const spring = {
  press: { type: "spring", visualDuration: 0.15, bounce: 0.3 },
  pop: { type: "spring", visualDuration: 0.25, bounce: 0.25 },
  selection: { type: "spring", visualDuration: 0.3, bounce: 0.2 },
  surface: { type: "spring", visualDuration: 0.4, bounce: 0.15 },
  layout: { type: "spring", visualDuration: 0.45, bounce: 0.15 },
  arrive: { type: "spring", visualDuration: 0.5, bounce: 0.3 },
  celebrate: { type: "spring", visualDuration: 0.6, bounce: 0.45 },
  number: { type: "spring", visualDuration: 0.8, bounce: 0 },
} as const;
export const ease = {
  out: [0.23, 1, 0.32, 1],
  soft: [0.215, 0.61, 0.355, 1],
  away: [0.33, 0.17, 0.67, 0.5],
} as const;
export const tween = {
  color: { duration: 0.15, ease: [0.25, 0.1, 0.25, 1] },
  fade: { duration: 0.2, ease: ease.out },
  menu: { duration: 0.18, ease: ease.soft },
  overlay: { duration: 0.3, ease: ease.soft },
  sheet: { duration: 0.4, ease: ease.soft },
  disclosure: { duration: 0.3, ease: ease.soft },
  swap: { duration: 0.18, ease: ease.out },
  dismiss: { duration: 0.18, ease: ease.away },
} as const;
export const scale = {
  tooltip: 0.8,
  popover: 0.9,
  menu: 0.9,
  dialog: 0.92,
  palette: 0.96,
  removedCard: 0.96,
} as const;
export const shift = { panel: 6, arrive: 12 } as const;
export const blur = { swap: 2, surface: 6 } as const;
export const stagger = { interval: 0.035, maxItems: 12, maxDelay: 0.3 } as const;
export const pressScale = { control: 0.97, card: 0.985 } as const;
export const staggerDelay = (index: number) =>
  Math.min(Math.min(Math.max(0, index), stagger.maxItems - 1) * stagger.interval, stagger.maxDelay);
export function useReducedMotionSafe() {
  return useSyncExternalStore(subscribeAppearance, getReducedMotion, () => false);
}

export function usePress<T extends HTMLElement, P extends React.DOMAttributes<T>>(
  kind: keyof typeof pressScale,
  props: P,
) {
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotionSafe();
  useEffect(() => {
    if (!pressed) return;
    const release = () => setPressed(false);
    const releasePointer = (event: PointerEvent) => {
      if (!event.defaultPrevented) release();
    };
    window.addEventListener("pointerup", releasePointer);
    window.addEventListener("pointercancel", releasePointer);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("pointerup", releasePointer);
      window.removeEventListener("pointercancel", releasePointer);
      document.removeEventListener("visibilitychange", release);
    };
  }, [pressed]);
  const {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onKeyDown,
    onKeyUp,
    onBlur,
    ...rest
  } = props;
  const compose =
    <E extends React.SyntheticEvent<T>>(
      caller: ((event: E) => void) | undefined,
      action: (event: E) => void,
    ) =>
    (event: E) => {
      caller?.(event);
      if (!event.defaultPrevented) action(event);
    };
  const enabled = (element: HTMLElement) => !element.matches(":disabled, [aria-disabled='true']");
  return {
    rest,
    press: {
      "data-pressed": pressed || undefined,
      animate: { scale: pressed && !reduced ? pressScale[kind] : 1 },
      transition: spring.press,
      onPointerDown: compose(onPointerDown, (event) => {
        if (enabled(event.currentTarget)) setPressed(true);
      }),
      onPointerUp: compose(onPointerUp, () => setPressed(false)),
      onPointerLeave: compose(onPointerLeave, () => setPressed(false)),
      onPointerCancel: compose(onPointerCancel, () => setPressed(false)),
      onKeyDown: compose(onKeyDown, (event) => {
        if ((event.key === "Enter" || event.key === " ") && enabled(event.currentTarget))
          setPressed(true);
      }),
      onKeyUp: compose(onKeyUp, (event) => {
        if (event.key === "Enter" || event.key === " ") setPressed(false);
      }),
      onBlur: compose(onBlur, () => setPressed(false)),
    },
  };
}
