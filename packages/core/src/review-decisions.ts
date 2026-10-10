import { parseDocument } from "yaml";

export type ReviewDecision = {
  id: string;
  kind: "finding" | "memory-proposal";
  status: "open" | "resolved" | "accepted" | "rejected" | "sent-back";
  reason: string;
  by: string;
  at: string;
};

function isReviewDecision(value: unknown): value is ReviewDecision {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    !!entry.id.trim() &&
    (entry.kind === "finding" || entry.kind === "memory-proposal") &&
    typeof entry.status === "string" &&
    (entry.kind === "memory-proposal"
      ? ["open", "accepted", "rejected"].includes(entry.status)
      : ["open", "resolved", "accepted", "sent-back"].includes(entry.status)) &&
    typeof entry.reason === "string" &&
    (entry.kind !== "finding" || entry.status !== "accepted" || !!entry.reason.trim()) &&
    typeof entry.by === "string" &&
    !!entry.by.trim() &&
    typeof entry.at === "string" &&
    Number.isFinite(Date.parse(entry.at))
  );
}

function reviewDocument(text: string | undefined) {
  const document = parseDocument(text ?? "decisions: []\n");
  if (document.errors.length || document.warnings.length)
    throw new Error("review.yaml must be valid before recording a decision.");
  const value = document.toJS();
  if (
    !value ||
    !Array.isArray(value.decisions) ||
    !value.decisions.every(isReviewDecision) ||
    new Set(value.decisions.map((entry: ReviewDecision) => JSON.stringify([entry.kind, entry.id])))
      .size !== value.decisions.length
  )
    throw new Error("review.yaml needs unique decisions with id, kind, status, reason, by and at.");
  return { document, decisions: value.decisions as ReviewDecision[] };
}

export function parseReviewDecisions(text: string | undefined): ReviewDecision[] {
  return reviewDocument(text).decisions;
}

export function recordReviewDecision(text: string | undefined, decision: ReviewDecision): string {
  if (!isReviewDecision(decision)) throw new Error("Invalid review decision.");
  const { document, decisions } = reviewDocument(text);
  const position = decisions.findIndex(
    (entry) => entry.kind === decision.kind && entry.id === decision.id,
  );
  if (position < 0) decisions.push(decision);
  else decisions[position] = decision;
  document.set("decisions", decisions);
  return document.toString();
}
