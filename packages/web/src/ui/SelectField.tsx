// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";
import { cn } from "./cn";

export function SelectField({
  value,
  onValueChange,
  options,
  disabled,
  className,
  ...props
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly { value: string; label: string; disabled?: boolean }[];
} & Omit<ComponentPropsWithoutRef<typeof SelectTrigger>, "value" | "onChange" | "children">) {
  const selected = options.findIndex((option) => option.value === value);
  const trigger = useRef<HTMLButtonElement>(null);
  const deferredFocus = useRef(false);
  useEffect(() => {
    if (!disabled && deferredFocus.current) {
      deferredFocus.current = false;
      if (document.activeElement === document.body) trigger.current?.focus({ preventScroll: true });
    }
  }, [disabled]);
  return (
    <Select
      value={selected < 0 ? "" : String(selected)}
      disabled={disabled}
      onValueChange={(index) => onValueChange(options[Number(index)].value)}
    >
      <SelectTrigger {...props} ref={trigger} className={cn("w-full max-w-full", className)}>
        <SelectValue data-truncate title={options[selected]?.label}>
          {options[selected]?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        onCloseAutoFocus={() => {
          deferredFocus.current = !!trigger.current?.disabled;
        }}
      >
        {options.map((option, index) => (
          <SelectItem key={option.value} value={String(index)} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
