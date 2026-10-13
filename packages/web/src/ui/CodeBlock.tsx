// SPDX-License-Identifier: Apache-2.0
import type { ComponentPropsWithoutRef } from "react";
import { useLanguage } from "../i18n/language";
import { cn } from "./cn";

export function CodeBlock({ className, ...props }: ComponentPropsWithoutRef<"pre">) {
  const { t } = useLanguage();
  return (
    // biome-ignore lint/a11y/useSemanticElements: This named scroll region retains preformatted code semantics.
    <pre
      role="region"
      aria-label={t.codeBlock}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll code independently.
      tabIndex={0}
      className={cn(
        "my-3 max-w-full overflow-auto whitespace-pre rounded-md border border-border bg-bg p-3 font-mono text-xs [overflow-wrap:normal] [&_code]:bg-transparent [&_code]:p-0",
        className,
      )}
      {...props}
    />
  );
}
