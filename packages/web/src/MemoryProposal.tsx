// SPDX-License-Identifier: Apache-2.0
import type { MemoryProposalAttentionItem } from "@stintwork/core";
import { useState } from "react";
import { CoreTextError, useLanguage } from "./i18n/language";

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
        const body = await response.json();
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
    <>
      <p>{item.details}</p>
      <p className="muted">{t.review.memory.rejectWarning}</p>
      <section aria-label={t.review.memory.diff(item.path)}>
        <pre className="permission-details">
          <code>{item.diff}</code>
        </pre>
      </section>
      <div className="stint-permission-actions">
        <button
          type="button"
          disabled={sending || submitted}
          onClick={() => void decide("accepted")}
        >
          {t.review.memory.accept}
        </button>
        <button
          type="button"
          disabled={sending || submitted}
          onClick={() => void decide("rejected")}
        >
          {t.review.memory.reject}
        </button>
      </div>
      {submitted && <p role="status">{t.review.memory.recorded}</p>}
    </>
  );
}
