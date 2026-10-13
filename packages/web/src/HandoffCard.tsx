// SPDX-License-Identifier: Apache-2.0
import type { StintSummary } from "@stintwork/core";
import { useId } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckpointWarnings } from "./CheckpointWarnings";
import "./handoff-card.css";
import { useLanguage } from "./i18n/language";

export function HandoffCard({ stint }: { stint: StintSummary }) {
  const { t } = useLanguage();
  const title = useId();
  return (
    <article className="handoff-card" aria-labelledby={title}>
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
              <dd className="markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                  {text}
                </ReactMarkdown>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted">
          {stint.handoffError ? t.stints.noHandoffError(stint.handoffError) : t.stints.noHandoff}
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
