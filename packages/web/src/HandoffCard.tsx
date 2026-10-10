import type { StintSummary } from "@stintwork/core";
import { useId } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./handoff-card.css";

export function HandoffCard({ stint }: { stint: StintSummary }) {
  const title = useId();
  return (
    <article className="handoff-card" aria-labelledby={title}>
      <h4 id={title}>Handoff</h4>
      {stint.handoff ? (
        <dl>
          {[
            ["Where I stopped", stint.handoff.stoppedAt],
            ["Unresolved", stint.handoff.unresolved],
            ["Suggested next", stint.handoff.nextStep],
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
          {stint.handoffError
            ? `No handoff was given: ${stint.handoffError}`
            : "No handoff was given."}
        </p>
      )}
      <p>
        {stint.checkpointCommit ? (
          <>
            Checkpoint commit: <code>{stint.checkpointCommit}</code>
          </>
        ) : (
          "No checkpoint recorded."
        )}
      </p>
    </article>
  );
}
