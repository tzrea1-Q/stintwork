// SPDX-License-Identifier: Apache-2.0
import type { GateWorkItem } from "./gates.js";
import { parseDocument } from "yaml";

export type MergeMethod = "merge" | "squash" | "rebase";
export type PullRequest = {
  number: number;
  url: string;
  repo: string;
  remote: string;
  remoteUrl: string;
  branch: string;
  base: string;
  headCommit: string;
  mergeMethod?: MergeMethod;
};
export type PullRequestChecks = {
  number: number;
  headCommit: string;
  fetchedAt: string;
  state: string;
  checks: { name: string; bucket: string; link: string }[];
};
export type PullRequestPreview = Omit<PullRequest, "number" | "url"> & {
  title: string;
  body: string;
  confirmation: string;
};

export function pullRequestText(item: GateWorkItem) {
  const review = item.stints.find((stint) => stint.stage === "review")?.findings;
  return {
    title: item.title,
    body: [
      `## Spec\n\n${item.spec?.text ?? "No spec."}`,
      `## Tickets\n\n${item.tickets.map((ticket) => `- [${ticket.resolved ? "x" : " "}] ${ticket.number}: ${ticket.title}`).join("\n") || "No tickets."}`,
      `## Review\n\n${review?.findings?.length === 0 ? "No findings." : review?.findings?.map((finding) => `- ${finding.title}: ${item.reviewDecisions?.find((decision) => decision.id === finding.id)?.status ?? "open"}`).join("\n") || "No review evidence."}`,
      `## Checks\n\n${item.checks?.map((check) => `- ${check.name}: ${check.status} (${check.commit})`).join("\n") || "No local check results recorded."}`,
    ].join("\n\n"),
  };
}

export function workflowPullRequest(text: string | undefined, pullRequest: PullRequest) {
  const document = parseDocument(text ?? "");
  if (document.errors.length || document.warnings.length || document.get("stage") !== "ship")
    throw new Error("A valid Ship workflow is required before recording a pull request.");
  document.set("pullRequest", pullRequest);
  return document.toString();
}

export function isPullRequest(value: unknown): value is PullRequest {
  if (!value || typeof value !== "object") return false;
  const pr = value as PullRequest;
  return (
    Number.isSafeInteger(pr.number) &&
    pr.number > 0 &&
    typeof pr.repo === "string" &&
    /^[\w.-]+\/[\w.-]+$/.test(pr.repo) &&
    pr.url === `https://github.com/${pr.repo}/pull/${pr.number}` &&
    [pr.remote, pr.remoteUrl, pr.branch, pr.base].every(
      (field) => typeof field === "string" && !!field && !field.startsWith("-"),
    ) &&
    typeof pr.headCommit === "string" &&
    /^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(pr.headCommit) &&
    (pr.mergeMethod === undefined || ["merge", "squash", "rebase"].includes(pr.mergeMethod))
  );
}
