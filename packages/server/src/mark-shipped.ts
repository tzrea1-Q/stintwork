// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import {
  CoreTextError,
  coreText,
  coreTextWire,
  errorText,
  loadWorkflows,
  type ProjectSnapshot,
  readWorkflow,
  workflowMerge,
} from "@stintwork/core";
import { withRepoLock } from "@stintwork/git";
import type { Hono } from "hono";
import { stringify } from "yaml";
import { resolveProjectSnapshot } from "./project-snapshot.js";
import { createNodeRepoFiles } from "./repo-files.js";
import type { ProjectFilesReader } from "./work-item-files.js";
import { saveWorkItemWorkflow } from "./workflow-writes.js";

export function addMarkShippedRoute(
  app: Hono,
  root: string,
  readProjectFiles: ProjectFilesReader,
  refresh: () => void,
  isActive: (slug: string) => boolean,
  writing: Set<string>,
  getSnapshot?: () => ProjectSnapshot,
) {
  app.post("/api/work-items/:slug/mark-shipped", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.originMismatch" }) }),
        403,
      );
    if (
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json(coreTextWire({ reason: coreText({ code: "server.jsonShip" }) }), 400);
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json(coreTextWire({ reason: coreText({ code: "server.invalidJson" }) }), 400);
    }
    const slug = context.req.param("slug");
    if (writing.has(slug))
      return context.json(coreTextWire({ reason: coreText({ code: "ship.activeWrite" }) }), 409);
    writing.add(slug);
    try {
      const merged = await withRepoLock(root, async () => {
        const project = readProjectFiles();
        const snapshot = resolveProjectSnapshot(project, getSnapshot);
        if (snapshot.setup.tracker === "github-issues")
          throw new CoreTextError({ code: "outside.github" });
        const item = snapshot.workItems.find((entry) => entry.slug === slug);
        if (!item) throw new CoreTextError({ code: "server.workItemNotFound" });
        if (item.github) throw new CoreTextError({ code: "outside.github" });
        if (item.worktreePath || project.worktreePaths.has(slug))
          throw new CoreTextError({ code: "outside.worktree" });
        const files = createNodeRepoFiles(root);
        const main = readWorkflow(
          files,
          `.scratch/${slug}/workflow.yaml`,
          [],
          loadWorkflows(files),
        );
        if (item.merged || main?.merged) throw new CoreTextError({ code: "ship.alreadyShipped" });
        if (
          item.activeStint?.status === "running" ||
          item.stints.some((stint) => stint.status === "running") ||
          isActive(slug)
        )
          throw new CoreTextError({ code: "ship.running" });
        const value =
          body && typeof body === "object" && "commit" in body ? body.commit : undefined;
        let commit: string;
        try {
          if (typeof value !== "string" || !value.trim() || value.startsWith("-"))
            throw new Error();
          commit = execFileSync("git", ["rev-parse", "--verify", `${value}^{commit}`], {
            cwd: root,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          }).trim();
        } catch {
          throw new CoreTextError({ code: "outside.unknownCommit" });
        }
        try {
          execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], {
            cwd: root,
            stdio: "ignore",
          });
        } catch {
          throw new CoreTextError({ code: "outside.unreachable" });
        }
        const merged = { at: new Date().toISOString(), commit, outside: true as const };
        await saveWorkItemWorkflow(
          root,
          slug,
          (text) =>
            workflowMerge(
              text ??
                stringify({
                  workflow: item.workflow,
                  stage: item.stage ?? snapshot.workflows[item.workflow].stages[0].id,
                }),
              merged,
              snapshot.workflows,
              item.workflow,
            ),
          `Record outside merge of ${slug}`,
        );
        return merged;
      });
      refresh();
      return context.json({ merged });
    } catch (error) {
      return context.json(coreTextWire({ reason: errorText(error) }), 409);
    } finally {
      writing.delete(slug);
    }
  });
}
