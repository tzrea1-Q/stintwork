// SPDX-License-Identifier: Apache-2.0

import type { StintSummary } from "@stintwork/core";
import { useId } from "react";
import { CheckpointWarnings } from "./CheckpointWarnings";
import { renderCoreText, useLanguage } from "./i18n/language";
import { Markdown } from "./ui/Markdown";

export function HandoffCard({ stint }: { stint: StintSummary }) {
  const { t } = useLanguage();
  const title = useId();
  return (
    <article
      className="handoff-card my-3 rounded-sm border border-border bg-muted p-3 [overflow-wrap:anywhere] [&_h4]:font-semibold [&_dt]:font-semibold [&_dl>div]:mt-2 [&>p]:mt-2"
      aria-labelledby={title}
    >
      <h4 id={title}>{t.stints.handoff}</h4>
      <CheckpointWarnings warnings={stint.checkpointWarnings} />
      {stint.handoff ? (
        <dl>
          {[
            [t.stints.whereIStopped, stint.handoff.stoppedAt],
            [t.stints.unresolved, stint.handoff.unresolved],
            [t.stints.suggestedNext, stint.handoff.nextStep],
          ].map(([heading, text]) => (
            <div key={heading}>
              <dt>{heading}</dt>
              <dd>
                <Markdown>{text}</Markdown>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted text-muted-foreground">
          {stint.handoffError
            ? t.stints.noHandoffError(
                renderCoreText(stint.handoffErrorMessage, stint.handoffError, t),
              )
            : t.stints.noHandoff}
        </p>
      )}
      <p>
        {stint.checkpointCommit ? (
          <>
            {t.stints.checkpointLabel} <code>{stint.checkpointCommit}</code>
          </>
        ) : (
          t.stints.noCheckpoint
        )}
      </p>
    </article>
  );
}
