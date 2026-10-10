import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  builtInWorkflows,
  indexProject,
  workflowGate,
  workflowMerge,
  type MergeRecord,
} from "@stintwork/core";
import {
  dryRunLocalMerge,
  mergeLocalWorkItem,
  LocalMergeRefusal,
  withRepoLock,
} from "@stintwork/git";
import type { Hono } from "hono";
import type { ProjectFilesReader } from "./work-item-files.js";
import type { ReviewEvidenceReader } from "./review-evidence.js";
import { saveWorkItemWorkflow } from "./workflow-writes.js";
import { saveWorkItemReview } from "./review-writes.js";
import { createNodeRepoFiles } from "./repo-files.js";

export function addShipRoutes(
  app: Hono,
  root: string,
  readProjectFiles: ProjectFilesReader,
  refresh: () => void,
  isStintActive: (slug: string) => boolean,
  writing: Set<string>,
  isChecking: (slug: string) => boolean,
  readReviewEvidence?: ReviewEvidenceReader,
) {
  for (const action of ["merge-local", "send-back"] as const) {
    app.post(`/api/work-items/:slug/ship/${action}`, async (context) => {
      const origin = context.req.header("origin");
      if (origin && origin !== new URL(context.req.url).origin)
        return context.json({ reason: "Origin must match the project server." }, 403);
      if (
        context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !==
        "application/json"
      )
        return context.json({ reason: "A JSON Ship action is required." }, 400);
      try {
        const body: unknown = await context.req.json();
        if (!body || typeof body !== "object" || Array.isArray(body))
          return context.json({ reason: "A JSON Ship action is required." }, 400);
      } catch {
        return context.json({ reason: "Invalid JSON." }, 400);
      }
      const slug = context.req.param("slug");
      if (
        !indexProject(readProjectFiles().files, { name: "" }).workItems.some(
          (item) => item.slug === slug,
        )
      )
        return context.json({ reason: "Work item not found." }, 404);
      if (writing.has(slug))
        return context.json(
          { reason: "A workflow or review write is active for this work item." },
          409,
        );
      writing.add(slug);
      let merged: MergeRecord | undefined;
      function locate() {
        const project = readProjectFiles();
        const snapshot = indexProject(project.files, { name: "" });
        readReviewEvidence?.(project, snapshot);
        const item = snapshot.workItems.find((item) => item.slug === slug);
        if (!item) throw new LocalMergeRefusal("Work item not found.");
        if (item.stage !== "ship")
          throw new LocalMergeRefusal("Merge locally requires the Ship stage.");
        if (
          item.activeStint ||
          item.stints.some(({ status }) => status === "running") ||
          isStintActive(slug)
        )
          throw new LocalMergeRefusal(
            "A stint is running on this work item. Finish or stop it before shipping.",
          );
        if (isChecking(slug))
          throw new LocalMergeRefusal("Cancel or finish checks before shipping.");
        const failure = [...project.warnings, ...snapshot.warnings].find(
          ({ path }) =>
            path === ".git" ||
            path === `.scratch/${slug}/workflow.yaml` ||
            path === `.scratch/${slug}/review.yaml`,
        );
        if (failure || item.reviewEvidenceError || !readReviewEvidence)
          throw new LocalMergeRefusal(
            failure?.message ?? item.reviewEvidenceError ?? "Cannot read Ship evidence.",
          );
        if (item.memoryProposals?.length)
          throw new LocalMergeRefusal(
            "Accept or reject every open memory proposal before shipping.",
          );
        merged =
          item.merged ??
          indexProject(createNodeRepoFiles(root), { name: "" }).workItems.find(
            (item) => item.slug === slug,
          )?.merged;
        return { project, item };
      }
      try {
        if (action === "merge-local") {
          const commit = await mergeLocalWorkItem(
            root,
            slug,
            async (commit) => {
              merged = { at: new Date().toISOString(), commit };
              await saveWorkItemWorkflow(
                root,
                slug,
                (text) => workflowMerge(text, merged as MergeRecord),
                true,
                `Record merge of ${slug}`,
              );
            },
            () => {
              locate();
              return merged?.commit;
            },
          );
          refresh();
          return context.json({ merged, commit });
        }
        return await withRepoLock(root, async () => {
          const { project, item } = locate();
          if (item.merged) throw new LocalMergeRefusal("This work item is shipped.");
          const report = await dryRunLocalMerge(root, slug);
          if (!report.conflicts.length)
            throw new LocalMergeRefusal("There are no merge conflicts to send back.");
          const implementation = builtInWorkflows[item.workflow].stages.find(
            (stage) => stage.column === "implement",
          );
          const worktree = project.worktreePaths.get(slug);
          if (!worktree || !implementation)
            throw new LocalMergeRefusal("The implementation worktree is unavailable.");
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
          const at = new Date().toISOString();
          const record = { by, at, commit: report.headCommit };
          const commit = await saveWorkItemReview(worktree, slug, [], undefined, {
            workflow: workflowGate(
              project.files.read(`.scratch/${slug}/workflow.yaml`),
              item,
              implementation.id,
              "reopen",
              record,
            ),
            note: {
              id: `review:${randomUUID()}`,
              at,
              source: "review",
              text: `## Merge conflicts\n\nResolve conflicts with ${report.mainBranch} before shipping:\n${report.conflicts.map((path) => `- ${path}`).join("\n")}`,
            },
          });
          refresh();
          return context.json({ stage: implementation.id, stageName: implementation.name, commit });
        });
      } catch (error) {
        refresh();
        return context.json(
          {
            reason: error instanceof Error ? error.message : String(error),
            ...(error instanceof LocalMergeRefusal
              ? { conflicts: error.conflicts, paths: error.paths }
              : {}),
          },
          409,
        );
      } finally {
        writing.delete(slug);
      }
    });
  }
}
