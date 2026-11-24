// SPDX-License-Identifier: Apache-2.0
import { useRef } from "react";
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
  const drag = useRef<{ x: number; value: number } | null>(null);
  const resize = (next: number) => onChange(Math.max(min, Math.min(max, next)));
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <hr
          aria-label={label}
          aria-orientation="vertical"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          tabIndex={0}
          className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none rounded border-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
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
            drag.current = { x: event.clientX, value };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (drag.current) resize(drag.current.value + drag.current.x - event.clientX);
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
