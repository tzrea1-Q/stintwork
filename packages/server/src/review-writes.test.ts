import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseReviewDecisions, type ReviewDecision } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { saveWorkItemReview } from "./review-writes.js";

const roots: string[] = [];
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test.each<[ReviewDecision["kind"], ReviewDecision["status"], string]>([
  ["finding", "open", "Record finding review-1 as open for first"],
  ["finding", "resolved", "Record finding review-1 as resolved for first"],
  ["finding", "accepted", "Record finding review-1 as accepted for first"],
  ["finding", "sent-back", "Record finding review-1 as sent-back for first"],
  ["memory-proposal", "open", "Record memory-proposal review-1 as open for first"],
  ["memory-proposal", "accepted", "Record memory-proposal review-1 as accepted for first"],
  ["memory-proposal", "rejected", "Record memory-proposal review-1 as rejected for first"],
])("records a %s decision with status %s in its commit subject", async (kind, status, subject) => {
  const root = mkdtempSync(join(tmpdir(), "stintwork-review-writes-"));
  roots.push(root);
  git(root, "init", "--quiet", "--initial-branch=stintwork/first");
  git(root, "config", "user.name", "Developer");
  git(root, "config", "user.email", "developer@example.invalid");
  mkdirSync(join(root, ".scratch/first"), { recursive: true });
  writeFileSync(join(root, ".scratch/first/spec.md"), "# First");
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "Fixture");
  const decision: ReviewDecision = {
    id: "review-1",
    kind,
    status,
    reason: "Developer reviewed",
    by: "Developer",
    at: "2026-10-10T10:00:00Z",
  };
  const commit = await saveWorkItemReview(root, "first", decision);
  expect(git(root, "show", "--format=%s", "--no-patch", commit)).toBe(subject);
  expect(git(root, "show", "--format=", "--name-only", commit)).toBe(".scratch/first/review.yaml");
  expect(
    parseReviewDecisions(readFileSync(join(root, ".scratch/first/review.yaml"), "utf8")),
  ).toEqual([decision]);
});
