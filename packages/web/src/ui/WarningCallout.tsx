// SPDX-License-Identifier: Apache-2.0
import { TriangleAlert } from "lucide-react";
import { useLanguage } from "../i18n/language";
import { Disclosure } from "./Disclosure";

export function WarningCallout({
  warnings,
}: {
  warnings: readonly { message: string; path?: string }[];
}) {
  const { t } = useLanguage();
  if (!warnings.length) return null;
  const firstLine = warnings[0].message.split(/\r?\n/, 1)[0];
  return (
    <section
      role="alert"
      aria-label={t.warningCallout.title(warnings.length)}
      className="mb-4 min-w-0 rounded-md border border-warning/30 bg-warning/10 p-3 text-warning"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert className="size-icon-sm shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">{t.warningCallout.title(warnings.length)}</h3>
          <p data-truncate title={firstLine} className="mt-1 truncate text-sm">
            {firstLine}
          </p>
        </div>
      </div>
      <Disclosure label={t.warningCallout.details} className="mt-1 [&_summary]:py-1">
        <ul className="space-y-2 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
          {warnings.map((warning) => (
            <li key={`${warning.path}:${warning.message}`}>
              {warning.path && `${warning.path}: `}
              {warning.message}
            </li>
          ))}
        </ul>
      </Disclosure>
    </section>
  );
}
