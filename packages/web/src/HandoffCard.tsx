// SPDX-License-Identifier: Apache-2.0

import type { StintSummary } from "@stintwork/core";
import { Copy } from "lucide-react";
import { Fragment, useId } from "react";
import { CheckpointWarnings } from "./CheckpointWarnings";
import { renderCoreText, useLanguage } from "./i18n/language";
import { Markdown } from "./ui/Markdown";
import { shortHash } from "./short-id";
import { Button } from "./ui/Button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";

export function HandoffCard({ stint }: { stint: StintSummary }) {
  const { t } = useLanguage();
  const title = useId();
  return (
    <article
      className="handoff-card my-3 rounded-2xl border border-border bg-card p-4 [overflow-wrap:anywhere] [&_h4]:font-semibold [&>p]:mt-2"
      aria-labelledby={title}
    >
      <h4 id={title}>{t.stints.handoff}</h4>
      <CheckpointWarnings warnings={stint.checkpointWarnings} />
      {stint.handoff ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 py-2">
          {[
            { heading: t.stints.whereIStopped, text: stint.handoff.stoppedAt },
            { heading: t.stints.unresolved, text: stint.handoff.unresolved },
            { heading: t.stints.suggestedNext, text: stint.handoff.nextStep },
          ].map(({ heading, text }) => (
            <Fragment key={heading}>
              <dt className="text-sm text-muted-foreground">{heading}</dt>
              <dd className="min-w-0">
                <Markdown>{text}</Markdown>
              </dd>
            </Fragment>
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
            {t.stints.checkpointLabel}{" "}
            <code title={stint.checkpointCommit} className="font-mono">
              {shortHash(stint.checkpointCommit)}
            </code>{" "}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t.review.diff.copyHash(t.stints.checkpointCommit)}
                    onClick={() =>
                      void navigator.clipboard.writeText(stint.checkpointCommit as string)
                    }
                  >
                    <Copy aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t.review.diff.copyHash(t.stints.checkpointCommit)}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        ) : (
          t.stints.noCheckpoint
        )}
      </p>
    </article>
  );
}
