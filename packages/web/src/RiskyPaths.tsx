// SPDX-License-Identifier: Apache-2.0
import { riskyPathAccepted, type RiskyPath, type ReviewDecision } from "@stintwork/core";
import { useState } from "react";
import { useLanguage } from "./i18n/language";

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
  const { t } = useLanguage();
  const [accepting, setAccepting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  return (
    <section aria-label={t.review.risks.label}>
      <h3>{t.review.risks.heading}</h3>
      <p>{t.review.risks.explanation}</p>
      {!risks.length && <p>{t.review.risks.empty}</p>}
      {risks.map((risk) => {
        const accepted = riskyPathAccepted(risk, decisions);
        return (
          <article key={risk.path} aria-label={t.review.risks.path(risk.path)}>
            <h4>
              <code>{risk.path}</code>
            </h4>
            <p>
              {risk.reasons.map((reason) => t.review.risks.reasons[reason]).join(", ")} ·{" "}
              {accepted ? t.review.risks.accepted : t.review.risks.blocks}
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
                {t.review.risks.accept}
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
                  {t.review.risks.reason}
                  <textarea
                    required
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <button type="submit" className="top-button" disabled={saving || !reason.trim()}>
                  {t.review.risks.save}
                </button>
                <button
                  type="button"
                  className="top-button"
                  disabled={saving}
                  onClick={() => setAccepting(null)}
                >
                  {t.review.risks.cancel}
                </button>
              </form>
            )}
          </article>
        );
      })}
    </section>
  );
}
