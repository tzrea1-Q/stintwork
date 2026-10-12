// SPDX-License-Identifier: Apache-2.0
import { riskyPathAccepted, type RiskyPath, type ReviewDecision } from "@stintwork/core";
import { useState } from "react";

export function RiskyPaths({
  risks,
  decisions,
  saving,
  onAccept,
}: {
  risks: readonly RiskyPath[];
  decisions: readonly ReviewDecision[];
  saving: boolean;
  onAccept: (risk: RiskyPath, reason: string) => Promise<boolean>;
}) {
  const [accepting, setAccepting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  return (
    <section aria-label="Risky files on the branch">
      <h3>No risky files on the branch</h3>
      <p>
        Remove risky files in a follow-up commit and add them to .gitignore, or deliberately Accept
        each path with a reason. File contents are not shown.
      </p>
      {!risks.length && <p>No risky paths in the merge-base-to-head diff.</p>}
      {risks.map((risk) => {
        const accepted = riskyPathAccepted(risk, decisions);
        return (
          <article key={risk.path} aria-label={`Risky path ${risk.path}`}>
            <h4>
              <code>{risk.path}</code>
            </h4>
            <p>
              {risk.reasons.join(", ")} · {accepted ? "Accepted" : "Blocks shipping"}
            </p>
            {accepted ? (
              <p>
                {
                  decisions.find(
                    (decision) => decision.kind === "risky-path" && decision.id === risk.path,
                  )?.reason
                }
              </p>
            ) : (
              <button
                type="button"
                className="top-button"
                disabled={saving}
                onClick={() => {
                  setAccepting(risk.path);
                  setReason("");
                }}
              >
                Accept
              </button>
            )}
            {!accepted && accepting === risk.path && (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (reason.trim() && (await onAccept(risk, reason.trim()))) setAccepting(null);
                }}
              >
                <label>
                  Acceptance reason
                  <textarea
                    required
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <button type="submit" className="top-button" disabled={saving || !reason.trim()}>
                  Save acceptance
                </button>
                <button
                  type="button"
                  className="top-button"
                  disabled={saving}
                  onClick={() => setAccepting(null)}
                >
                  Cancel
                </button>
              </form>
            )}
          </article>
        );
      })}
    </section>
  );
}
