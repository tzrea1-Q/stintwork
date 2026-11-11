// SPDX-License-Identifier: Apache-2.0
import { coreText, type StintSummary } from "@stintwork/core";
import { FileText, Info, RotateCcw } from "lucide-react";
import type { Catalog } from "./i18n/en";
import { renderCoreText, translateCoreText, useLanguage } from "./i18n/language";
import { Card, CardContent, CardHeader } from "./ui/Card";
import { Disclosure } from "./ui/Disclosure";
import { IconChip } from "./ui/IconChip";
import { PropertyList, PropertyRow } from "./ui/PropertyRow";
import { StatusChip } from "./ui/StatusChip";

// Older logs carry plain reasons; match only Stintwork's known copy, never agent text.
function recoveryReason(reason: string, t: Catalog) {
  for (const code of [
    "recovery.legacy",
    "recovery.grok",
    "recovery.antigravity",
    "recovery.ownershipMetadata",
  ] as const) {
    const message = coreText({ code });
    if (reason === message.text) return translateCoreText(message, t);
  }
  return reason;
}

export function recoveryStatus(stint: StintSummary, t: Catalog) {
  const state = stint.recovery?.state;
  return state && (stint.status === "running" || state === "resumed")
    ? t.stints.recovery.states[state]
    : null;
}

export function StintRecovery({ stint }: { stint: StintSummary }) {
  const { t } = useLanguage();
  const recovery = stint.recovery;
  if (!recovery?.state) return null;
  const launch = recovery.launch;
  const path = stint.worktree?.path;
  const fallback = recovery.state === "fallback" && stint.status !== "running";
  const reason = recovery.reason ? recoveryReason(recovery.reason, t) : "";
  return (
    <Card className="stint-recovery my-3 min-w-0 overflow-visible [overflow-wrap:anywhere]">
      <CardHeader className="flex min-w-0 flex-row flex-wrap items-center gap-3">
        <IconChip icon={RotateCcw} tone="attention" />
        <strong className="min-w-0">{t.review.visualRefresh07.recovery}</strong>
        {!fallback && recoveryStatus(stint, t) && (
          <StatusChip status={recovery.state === "resumed" ? "success" : "running"}>
            {recoveryStatus(stint, t)}
          </StatusChip>
        )}
      </CardHeader>
      <CardContent>
        {fallback && (
          <p role="status" className="text-attention-foreground">
            {stint.checkpointCommit
              ? t.stints.recovery.saved(stint.checkpointCommit)
              : !stint.error?.includes("Checkpoint failed:")
                ? t.stints.recovery.unchanged
                : path
                  ? t.stints.recovery.checkpointFailed(
                      path,
                      renderCoreText(stint.errorMessage, stint.error ?? reason, t),
                    )
                  : t.stints.recovery.checkpointFailedUnknown(
                      renderCoreText(stint.errorMessage, stint.error ?? reason, t),
                    )}
          </p>
        )}
        <Disclosure label={t.stints.recovery.details}>
          <PropertyList className="mt-2 px-2 pb-2">
            {reason && (
              <PropertyRow
                icon={Info}
                label={t.stints.recovery.reason}
                value={<span className="whitespace-pre-wrap">{reason}</span>}
              />
            )}
            {stint.error && stint.error !== `Could not resume stint: ${recovery.reason}` && (
              <PropertyRow
                icon={Info}
                label={t.stints.recovery.diagnostic}
                value={
                  <span className="whitespace-pre-wrap">
                    {renderCoreText(stint.errorMessage, stint.error, t)}
                  </span>
                }
              />
            )}
            {path && (
              <PropertyRow
                icon={FileText}
                label={t.stints.recovery.worktree}
                value={<code>{path}</code>}
              />
            )}
            {launch && (
              <>
                <PropertyRow
                  icon={Info}
                  label={t.stints.recovery.recordedSource}
                  value={
                    <span>
                      {translateCoreText(coreText({ code: `agent.source.${launch.source}` }), t)}
                    </span>
                  }
                />
                <PropertyRow
                  icon={Info}
                  label={t.stints.recovery.selectionReason}
                  value={
                    <span>
                      {translateCoreText(coreText({ code: `agent.reason.${launch.reason}` }), t)}
                    </span>
                  }
                />
                <PropertyRow
                  icon={FileText}
                  label={t.stints.preparation.executable}
                  value={<code>{launch.executable.path}</code>}
                />
                <PropertyRow
                  icon={Info}
                  label={t.stints.preparation.version}
                  value={<span>{launch.executable.version}</span>}
                />
                <PropertyRow
                  icon={Info}
                  label={t.stints.preparation.adapterVersion}
                  value={<span>{launch.adapterVersion}</span>}
                />
                <PropertyRow
                  icon={FileText}
                  label={t.stints.recovery.adapter}
                  value={<code>{launch.adapterEntry}</code>}
                />
              </>
            )}
          </PropertyList>
        </Disclosure>
      </CardContent>
    </Card>
  );
}
