// SPDX-License-Identifier: Apache-2.0

import { type ReviewDecision, type RiskyPath, riskyPathAccepted } from "@stintwork/core";
import { AlertTriangle, FileText } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "./i18n/language";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader } from "./ui/Card";
import { IconChip } from "./ui/IconChip";
import { PropertyList, PropertyRow } from "./ui/PropertyRow";

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
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <IconChip icon={AlertTriangle} tone="attention" />
          <h3>{t.review.risks.heading}</h3>
        </CardHeader>
        <CardContent>
          <p>{t.review.risks.explanation}</p>
          {!risks.length && <p>{t.review.risks.empty}</p>}
          {risks.map((risk) => {
            const accepted = riskyPathAccepted(risk, decisions);
            return (
              <article key={risk.path} aria-label={t.review.risks.path(risk.path)}>
                <PropertyList>
                  <PropertyRow
                    icon={FileText}
                    label={t.review.visualRefresh07.path}
                    value={<code>{risk.path}</code>}
                  />
                </PropertyList>
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
                  <Button
                    type="button"
                    variant="primary"
                    disabled={saving}
                    onClick={() => {
                      setAccepting(risk.path);
                      setReason("");
                    }}
                  >
                    {t.review.risks.accept}
                  </Button>
                )}
                {!accepted && accepting === risk.path && (
                  <form
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (reason.trim() && (await onAccept(risk, reason.trim())))
                        setAccepting(null);
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
                    <Button variant="primary" type="submit" disabled={saving || !reason.trim()}>
                      {t.review.risks.save}
                    </Button>
                    <Button type="button" disabled={saving} onClick={() => setAccepting(null)}>
                      {t.review.risks.cancel}
                    </Button>
                  </form>
                )}
              </article>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
