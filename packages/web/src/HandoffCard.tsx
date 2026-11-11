// SPDX-License-Identifier: Apache-2.0

import type { StintSummary } from "@stintwork/core";
import { CircleHelp, Flag, ListTodo } from "lucide-react";
import { useId } from "react";
import { CheckpointWarnings } from "./CheckpointWarnings";
import { renderCoreText, useLanguage } from "./i18n/language";
import { Markdown } from "./ui/Markdown";
import { PropertyList, PropertyRow } from "./ui/PropertyRow";

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
        <PropertyList>
          {[
            { icon: Flag, heading: t.stints.whereIStopped, text: stint.handoff.stoppedAt },
            { icon: CircleHelp, heading: t.stints.unresolved, text: stint.handoff.unresolved },
            { icon: ListTodo, heading: t.stints.suggestedNext, text: stint.handoff.nextStep },
          ].map(({ icon, heading, text }) => (
            <PropertyRow
              key={heading}
              icon={icon}
              label={heading}
              value={<Markdown>{text}</Markdown>}
            />
          ))}
        </PropertyList>
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
            <code className="block max-w-full overflow-auto font-mono">
              {stint.checkpointCommit}
            </code>
          </>
        ) : (
          t.stints.noCheckpoint
        )}
      </p>
    </article>
  );
}
