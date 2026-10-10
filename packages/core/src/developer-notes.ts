import type { Stint } from "./stints.js";

export type DeveloperNote = { id: string; at: string; text: string; source?: "review" };

export function hasUnresolvedHandoff(unresolved: string): boolean {
  const text = unresolved
    .trim()
    .replace(/^[-*+]\s+/, "")
    .replace(/[*_`]/g, "")
    .trim();
  return text.length > 0 && !/^none[.!]?$/i.test(text);
}

export function pendingDeveloperNotes(
  stints: readonly Stint[],
  reviewNotes: readonly DeveloperNote[] = [],
): DeveloperNote[] {
  const consumed = new Set(
    stints.flatMap((stint) => stint.brief.developerNotes?.map((note) => note.id) ?? []),
  );
  return [
    ...reviewNotes.filter((note) => !consumed.has(note.id)),
    ...stints.flatMap((stint) =>
      stint.handoffAnswer?.note && !consumed.has(stint.id)
        ? [{ id: stint.id, at: stint.handoffAnswer.at, text: stint.handoffAnswer.note }]
        : [],
    ),
  ].sort((first, second) => first.at.localeCompare(second.at) || first.id.localeCompare(second.id));
}
