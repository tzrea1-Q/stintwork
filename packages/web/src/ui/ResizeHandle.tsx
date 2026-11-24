// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./Tooltip";

export function ResizeHandle({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);
  const resize = (next: number) => onChange(Math.max(min, Math.min(max, next)));
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* biome-ignore lint/a11y/useSemanticElements: A draggable separator needs a reliable pointer hit area. */}
        <div
          role="separator"
          aria-label={label}
          aria-orientation="vertical"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          tabIndex={0}
          className="absolute inset-y-0 left-0 z-10 w-3 cursor-col-resize touch-none rounded border-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          onKeyDown={(event) => {
            const step = event.shiftKey ? 64 : 16;
            if (event.key === "ArrowLeft") resize(value + step);
            else if (event.key === "ArrowRight") resize(value - step);
            else if (event.key === "Home") resize(min);
            else if (event.key === "End") resize(max);
            else return;
            event.preventDefault();
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            stopDrag.current?.();
            const { clientX, pointerId } = event;
            const move = (next: PointerEvent) => {
              if (next.pointerId === pointerId) resize(value + clientX - next.clientX);
            };
            const stop = (next: PointerEvent) => {
              if (next.pointerId === pointerId) stopDrag.current?.();
            };
            stopDrag.current = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", stop);
              window.removeEventListener("pointercancel", stop);
              stopDrag.current = null;
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", stop);
            window.addEventListener("pointercancel", stop);
          }}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
