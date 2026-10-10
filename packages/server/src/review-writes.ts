import { recordReviewDecision, type ReviewDecision } from "@stintwork/core";
import { commitWorkItemReview } from "@stintwork/git";
import { createNodeRepoFiles } from "./repo-files.js";

export async function saveWorkItemReview(
  worktree: string,
  slug: string,
  decision: ReviewDecision,
  rejection?: { path: string; baseCommit: string },
) {
  const existing = createNodeRepoFiles(worktree).read(`.scratch/${slug}/review.yaml`);
  return commitWorkItemReview(
    worktree,
    slug,
    recordReviewDecision(existing, decision),
    decision.id,
    rejection,
  );
}
