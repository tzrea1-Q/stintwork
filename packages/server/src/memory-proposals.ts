import { execFileSync } from "node:child_process";
import {
  deriveAttentionItems,
  deriveMemoryProposals,
  indexProject,
  indexStints,
  isProjectMemoryPath,
  type ProjectSnapshot,
  type RepoFiles,
  type ReviewDecision,
} from "@stintwork/core";
import { checkpointChangedPaths, checkpointFileDiff } from "@stintwork/git";
import type { Hono } from "hono";
import { saveWorkItemReview } from "./review-writes.js";
import type { ProjectFilesReader } from "./work-item-files.js";

export function createMemoryProposalReader(root: string) {
  const changes = new Map<string, { path: string; diff: string }[]>();
  return (files: RepoFiles, snapshot: ProjectSnapshot) => {
    const stints = indexStints(files).stints;
    for (const item of snapshot.workItems) {
      item.memoryProposals = [];
      for (const stint of stints) {
        if (stint.workItem !== item.slug || stint.status === "running" || !stint.checkpointCommit)
          continue;
        const key = JSON.stringify([stint.id, stint.baseCommit, stint.checkpointCommit]);
        try {
          let diff = changes.get(key);
          if (!diff) {
            diff = checkpointChangedPaths(root, stint.baseCommit, stint.checkpointCommit)
              .filter(isProjectMemoryPath)
              .map((path) => ({
                path,
                diff: checkpointFileDiff(
                  root,
                  stint.baseCommit,
                  stint.checkpointCommit as string,
                  path,
                ),
              }));
            changes.set(key, diff);
          }
          item.memoryProposals.push(...deriveMemoryProposals(stint, diff, item.reviewDecisions));
        } catch (error) {
          snapshot.warnings.push({
            path: `.stintwork/local/stints/${stint.id}.jsonl`,
            message: `Cannot derive memory proposals: ${String(error)}`,
          });
        }
      }
    }
    snapshot.attentionItems = deriveAttentionItems(snapshot);
  };
}

export function addMemoryProposalRoutes(
  app: Hono,
  root: string,
  readProjectFiles: ProjectFilesReader,
  refresh: () => void,
  isStintActive: (slug: string) => boolean,
  writing: Set<string>,
) {
  const readProposals = createMemoryProposalReader(root);
  app.post("/api/work-items/:slug/memory-proposals/decision", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json({ reason: "Origin must match the project server." }, 403);
    if (
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json({ reason: "A JSON memory proposal decision is required." }, 400);
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ reason: "Invalid JSON." }, 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("id" in body) ||
      typeof body.id !== "string" ||
      !("status" in body) ||
      (body.status !== "accepted" && body.status !== "rejected") ||
      ("reason" in body && typeof body.reason !== "string")
    )
      return context.json({ reason: "Choose a proposal id and accepted or rejected status." }, 400);
    const slug = context.req.param("slug");
    const reason = "reason" in body ? String(body.reason).trim() : "";
    const status = body.status as "accepted" | "rejected";
    const project = readProjectFiles();
    if (project.warnings.some(({ path }) => path === ".git"))
      return context.json({ reason: "Cannot discover work item branches." }, 503);
    const snapshot = indexProject(project.files, { name: "" });
    const item = snapshot.workItems.find((entry) => entry.slug === slug);
    if (!item) return context.json({ reason: "Work item not found." }, 404);
    if (item.activeStint || isStintActive(slug) || writing.has(slug))
      return context.json({ reason: "A stint or review write is active for this work item." }, 409);
    if (snapshot.warnings.some(({ path }) => path === `.scratch/${slug}/review.yaml`))
      return context.json(
        { reason: "review.yaml must be valid before recording a decision." },
        409,
      );
    const previous = item.reviewDecisions?.find(
      (entry) => entry.kind === "memory-proposal" && entry.id === body.id,
    );
    if (previous && previous.status !== "open") {
      if (previous.status !== status || previous.reason !== reason)
        return context.json({ reason: "This memory proposal was already decided." }, 409);
      refresh();
      return context.json({ decision: previous });
    }
    readProposals(project.files, snapshot);
    const proposal = item.memoryProposals?.find((entry) => entry.id === body.id);
    if (!proposal) return context.json({ reason: "Open memory proposal not found." }, 404);
    const worktree = project.worktreePaths.get(slug);
    if (!worktree) return context.json({ reason: "The work item's worktree is unavailable." }, 409);
    writing.add(slug);
    try {
      let by = "Developer";
      try {
        by =
          execFileSync("git", ["config", "--get", "user.name"], {
            cwd: worktree,
            encoding: "utf8",
          }).trim() || by;
      } catch (error) {
        if ((error as { status?: number }).status !== 1) throw error;
      }
      const decision: ReviewDecision = {
        id: proposal.id,
        kind: "memory-proposal",
        status,
        reason,
        by,
        at: new Date().toISOString(),
      };
      const commit = await saveWorkItemReview(
        worktree,
        slug,
        decision,
        status === "rejected"
          ? { path: proposal.path, baseCommit: proposal.baseCommit }
          : undefined,
      );
      refresh();
      return context.json({ decision, commit });
    } catch (error) {
      refresh();
      return context.json({ reason: String(error) }, 409);
    } finally {
      writing.delete(slug);
    }
  });
}
