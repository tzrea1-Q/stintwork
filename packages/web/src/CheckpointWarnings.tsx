// SPDX-License-Identifier: Apache-2.0
import type { CheckpointWarning } from "@stintwork/core";
import { AlertTriangle } from "lucide-react";
import { useLanguage } from "./i18n/language";
import { Card, CardContent, CardHeader } from "./ui/Card";
import { IconChip } from "./ui/IconChip";

export function CheckpointWarnings({ warnings }: { warnings?: readonly CheckpointWarning[] }) {
  const { t } = useLanguage();
  if (!warnings?.length) return null;
  const labels = {
    "likely-secret": t.needsYou.likelySecret,
    "large-file": t.needsYou.largeFile,
    "generated-directory": t.needsYou.generatedDirectory,
  };
  const paths = [...new Set(warnings.map(({ path }) => path))].map((path) => {
    const entries = warnings.filter((warning) => warning.path === path);
    return {
      path,
      reasons: [...new Set(entries.flatMap((warning) => warning.reasons))],
      commits: [
        ...new Set(entries.flatMap((warning) => (warning.excluded ? [] : warning.commits))),
      ],
    };
  });
  return (
    <section className="warning" aria-label={t.needsYou.checkpointWarnings}>
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <IconChip icon={AlertTriangle} tone="attention" />
          <h4 className="text-attention-foreground">{t.needsYou.checkpointWarnings}</h4>
        </CardHeader>
        <CardContent>
          {warnings.some((warning) => warning.excluded) && <p>{t.needsYou.excludedFiles}</p>}
          {warnings.some((warning) => !warning.excluded) && <p>{t.needsYou.committedFiles}</p>}
          <ul>
            {paths.map((warning) => (
              <li key={warning.path}>
                <code className="font-mono">{warning.path}</code>
                {warning.reasons.length > 0 && " · "}
                {warning.reasons.map((reason) => (
                  <span key={reason} className="ml-2 rounded bg-muted px-2 py-1 text-xs">
                    {labels[reason]}
                  </span>
                ))}
                {warning.commits.length > 0 && (
                  <span> · {warning.commits.map((commit) => commit.slice(0, 7)).join(", ")}</span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
