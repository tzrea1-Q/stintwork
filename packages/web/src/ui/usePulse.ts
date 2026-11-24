// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";

export function usePulse<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(!document.hidden);
  useEffect(() => {
    const update = () => setShown(!document.hidden);
    document.addEventListener("visibilitychange", update);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (ref.current) observer?.observe(ref.current);
    if (!observer) setVisible(true);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return { ref, style: { animationPlayState: visible && shown ? "running" : "paused" } as const };
}
