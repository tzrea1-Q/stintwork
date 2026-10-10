import { parseDocument } from "yaml";
import type { DeveloperNote } from "./developer-notes.js";

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
  const developerNotes: unknown = value.developerNotes === undefined ? [] : value.developerNotes;
  if (
    !Array.isArray(developerNotes) ||
    !developerNotes.every(isReviewNote) ||
    new Set(developerNotes.map((note) => note.id)).size !== developerNotes.length
  )
    throw new Error("review.yaml needs unique review developer notes with id, at and text.");
  return { document, decisions: value.decisions as ReviewDecision[], developerNotes };
}

function isReviewNote(value: unknown): value is DeveloperNote {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  return (
    note.source === "review" &&
    ["id", "at", "text"].every((key) => typeof note[key] === "string" && !!note[key].trim()) &&
    Number.isFinite(Date.parse(note.at as string))
  );
}

export function parseReviewDeveloperNotes(text: string | undefined): DeveloperNote[] {
  return reviewDocument(text).developerNotes;
}

export function recordReviewDeveloperNote(text: string, note: DeveloperNote): string {
  if (!isReviewNote(note)) throw new Error("Invalid review developer note.");
  const { document, developerNotes } = reviewDocument(text);
  if (developerNotes.some((previous) => previous.id === note.id))
    throw new Error("This review developer note already exists.");
  document.set("developerNotes", [...developerNotes, note]);
  return document.toString();
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
