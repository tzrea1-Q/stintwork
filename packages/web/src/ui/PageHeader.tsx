// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import { Eyebrow } from "./Card";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col items-start justify-between gap-4 min-[700px]:flex-row min-[700px]:items-end">
      <div className="min-w-0">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="my-2 text-[length:var(--type-title-small)] leading-none font-normal tracking-[-.055em] min-[768px]:text-[length:var(--type-title)]">
          {title}
        </h1>
        <p className="text-[length:var(--type-context)] text-muted-foreground">{description}</p>
      </div>
      {actions}
    </header>
  );
}
