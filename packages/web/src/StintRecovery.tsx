// SPDX-License-Identifier: Apache-2.0
import { coreText, type StintSummary } from "@stintwork/core";
import { renderCoreText, translateCoreText, useLanguage } from "./i18n/language";
import type { Catalog } from "./i18n/en";
import { Badge } from "./ui/Badge";
import { Disclosure } from "./ui/Disclosure";

// Older logs carry plain reasons; match only Stintwork's known copy, never agent text.
function recoveryReason(reason: string, t: Catalog) {
  for (const code of ["recovery.legacy", "recovery.grok", "recovery.ownershipMetadata"] as const) {
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
    <div className="stint-recovery my-3 grid min-w-0 gap-3 rounded-md border border-border bg-surface-raised p-3 text-sm [overflow-wrap:anywhere]">
      {fallback ? (
        <p role="status" className="text-warning">
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
      ) : recoveryStatus(stint, t) ? (
        <div>
          <Badge variant={recovery.state === "resumed" ? "success" : "accent"}>
            {recoveryStatus(stint, t)}
          </Badge>
        </div>
      ) : null}
      <Disclosure label={t.stints.recovery.details}>
        <dl className="mt-2 space-y-3 px-2 pb-2 [&_dt]:font-medium [&_dd]:mt-1 [&_dd]:whitespace-pre-wrap">
          {reason && (
            <div>
              <dt>{t.stints.recovery.reason}</dt>
              <dd>{reason}</dd>
            </div>
          )}
          {stint.error && stint.error !== `Could not resume stint: ${recovery.reason}` && (
            <div>
              <dt>{t.stints.recovery.diagnostic}</dt>
              <dd>{renderCoreText(stint.errorMessage, stint.error, t)}</dd>
            </div>
          )}
          {path && (
            <div>
              <dt>{t.stints.recovery.worktree}</dt>
              <dd>{path}</dd>
            </div>
          )}
          {launch && (
            <>
              <div>
                <dt>{t.stints.recovery.recordedSource}</dt>
                <dd>{translateCoreText(coreText({ code: `agent.source.${launch.source}` }), t)}</dd>
              </div>
              <div>
                <dt>{t.stints.recovery.selectionReason}</dt>
                <dd>{translateCoreText(coreText({ code: `agent.reason.${launch.reason}` }), t)}</dd>
              </div>
              <div>
                <dt>{t.stints.preparation.executable}</dt>
                <dd>
                  <code>{launch.executable.path}</code>
                </dd>
              </div>
              <div>
                <dt>{t.stints.preparation.version}</dt>
                <dd>{launch.executable.version}</dd>
              </div>
              <div>
                <dt>{t.stints.preparation.adapterVersion}</dt>
                <dd>{launch.adapterVersion}</dd>
              </div>
              <div>
                <dt>{t.stints.recovery.adapter}</dt>
                <dd>
                  <code>{launch.adapterEntry}</code>
                </dd>
              </div>
            </>
          )}
        </dl>
      </Disclosure>
    </div>
  );
}
