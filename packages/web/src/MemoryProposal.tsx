// SPDX-License-Identifier: Apache-2.0
import type { MemoryProposalAttentionItem } from "@stintwork/core";
import { useState } from "react";

export function MemoryProposal({
  item,
  onError,
}: {
  item: MemoryProposalAttentionItem;
  onError: (reason: string) => void;
}) {
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
        throw new Error(
          typeof body.reason === "string" ? body.reason : "Could not decide memory proposal.",
        );
      }
      setSubmitted(true);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not decide memory proposal.");
    } finally {
      setSending(false);
    }
  }
  return (
    <>
      <p>{item.details}</p>
      <p className="muted">
        Reject restores the whole file to the stint's base, including any later committed changes.
      </p>
      <section aria-label={`Diff for ${item.path}`}>
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
          Accept memory proposal
        </button>
        <button
          type="button"
          disabled={sending || submitted}
          onClick={() => void decide("rejected")}
        >
          Reject memory proposal
        </button>
      </div>
      {submitted && <p role="status">Memory proposal decision recorded.</p>}
    </>
  );
}
