// SPDX-License-Identifier: Apache-2.0
import type { CheckpointWarning } from "@stintwork/core";
import { AlertTriangle, FileText } from "lucide-react";
import { useLanguage } from "./i18n/language";
import { Card, CardContent, CardHeader } from "./ui/Card";
import { IconChip } from "./ui/IconChip";
import { PropertyList, PropertyRow } from "./ui/PropertyRow";

export function CheckpointWarnings({ warnings }: { warnings?: readonly CheckpointWarning[] }) {
  const { t } = useLanguage();
  if (!warnings?.length) return null;
  const labels = {
    "likely-secret": t.needsYou.likelySecret,
    "large-file": t.needsYou.largeFile,
    "generated-directory": t.needsYou.generatedDirectory,
  };
  return (
    <section
      className="warning text-attention-foreground"
      aria-label={t.needsYou.checkpointWarnings}
    >
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <IconChip icon={AlertTriangle} tone="attention" />
          <h4>{t.needsYou.checkpointWarnings}</h4>
        </CardHeader>
        <CardContent>
          {warnings.some((warning) => warning.excluded) && <p>{t.needsYou.excludedFiles}</p>}
          {warnings.some((warning) => !warning.excluded) && <p>{t.needsYou.committedFiles}</p>}
          <ul>
            {warnings.map((warning) => (
              <li key={`${warning.path}:${warning.excluded}`}>
                <PropertyList>
                  <PropertyRow
                    icon={FileText}
                    label={t.review.visualRefresh07.path}
                    value={<code>{warning.path}</code>}
                  />
                </PropertyList>
                {warning.reasons.map((reason) => labels[reason]).join(", ")}
                {!warning.excluded && (
                  <span>
                    {t.needsYou.committed}
                    {warning.commits.map((commit) => (
                      <code key={commit}>{commit} </code>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
