// SPDX-License-Identifier: Apache-2.0

import type { MemoryProposalAttentionItem } from "@stintwork/core";
import { Brain, FileText } from "lucide-react";
import { useState } from "react";
import { CoreTextError, readResponseJson, useLanguage } from "./i18n/language";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader } from "./ui/Card";
import { CodeBlock } from "./ui/CodeBlock";
import { IconChip } from "./ui/IconChip";
import { PropertyList, PropertyRow } from "./ui/PropertyRow";

export function MemoryProposal({
  item,
  onError,
}: {
  item: MemoryProposalAttentionItem;
  onError: (reason: string | Error) => void;
}) {
  const { t } = useLanguage();
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  async function decide(status: "accepted" | "rejected") {
    setSending(true);
    onError("");
    try {
      const response = await fetch(
        `/api/work-items/${encodeURIComponent(item.workItem)}/memory-proposals/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, status, reason: "" }),
        },
      );
      if (!response.ok) {
        const body = await readResponseJson(response);
        throw new CoreTextError(body, t.review.memory.error);
      }
      setSubmitted(true);
    } catch (error) {
      onError(
        error instanceof CoreTextError && error.reasonMessage !== undefined
          ? error
          : error instanceof Error
            ? error.message
            : t.review.memory.error,
      );
    } finally {
      setSending(false);
    }
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <IconChip icon={Brain} tone="attention" />
        <strong>{t.review.memory.accept}</strong>
      </CardHeader>
      <CardContent>
        <PropertyList>
          <PropertyRow
            icon={FileText}
            label={t.review.visualRefresh07.path}
            value={<code>{item.path}</code>}
          />
        </PropertyList>
        <p>{item.details}</p>
        <p className="muted text-muted-foreground">{t.review.memory.rejectWarning}</p>
        <section aria-label={t.review.memory.diff(item.path)}>
          <CodeBlock className="permission-details">
            <code>{item.diff}</code>
          </CodeBlock>
        </section>
        <div className="stint-permission-actions flex flex-wrap gap-2 [&_span]:text-xs">
          <Button
            type="button"
            variant="primary"
            disabled={sending || submitted}
            onClick={() => void decide("accepted")}
          >
            {t.review.memory.accept}
          </Button>
          <Button
            type="button"
            disabled={sending || submitted}
            onClick={() => void decide("rejected")}
          >
            {t.review.memory.reject}
          </Button>
        </div>
        {submitted && <p role="status">{t.review.memory.recorded}</p>}
      </CardContent>
    </Card>
  );
}
