import {
  recordReviewDecision,
  recordReviewDeveloperNote,
  type DeveloperNote,
  type ReviewDecision,
} from "@stintwork/core";
import { commitWorkItemReview } from "@stintwork/git";
import { createNodeRepoFiles } from "./repo-files.js";

export async function saveWorkItemReview(
  worktree: string,
  slug: string,
  decision: ReviewDecision | readonly ReviewDecision[],
  rejection?: { path: string; baseCommit: string },
  sendBack?: { workflow: string; note: DeveloperNote },
) {
  const existing = createNodeRepoFiles(worktree).read(`.scratch/${slug}/review.yaml`);
  const decisions = "kind" in decision ? [decision] : decision;
  if (!decisions.length) throw new Error("A review decision is required.");
  let text = existing ?? "decisions: []\n";
  for (const entry of decisions) text = recordReviewDecision(text, entry);
  if (sendBack) text = recordReviewDeveloperNote(text, sendBack.note);
  return commitWorkItemReview(
    worktree,
    slug,
    text,
    decisions
      .map((entry) => `Record ${entry.kind} ${entry.id} as ${entry.status} for ${slug}`)
      .join("\n\n"),
    rejection,
    sendBack?.workflow,
  );
}
