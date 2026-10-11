// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { appendFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { indexStints, type RepoFiles, type StintLogEntry } from "@stintwork/core";
import { createCheckpoint } from "@stintwork/git";
import type { Hono } from "hono";

export const activeStintIds = new Set<string>();
const recovering = new Map<string, Promise<void>>();

export function recoverInterruptedStints(root: string, files: RepoFiles): Promise<void> {
  const projectPath = realpathSync(root);
  const pending = recovering.get(projectPath);
  if (pending) return pending;
  const recovery = (async () => {
    for (const path of files
      .list(".stintwork/local/stints/")
      .filter((path) => path.endsWith(".jsonl"))) {
      const text = files.read(path);
      if (text === undefined) continue;
      const { stints } = indexStints({ list: () => [path], read: () => text });
      const stint = stints[0];
      if (stint?.status !== "running" || activeStintIds.has(stint.id)) continue;
      let checkpointCommit: string | undefined;
      let error: string | undefined;
      try {
        const worktreePath = realpathSync(stint.worktree.path);
        const records = execFileSync("git", ["worktree", "list", "--porcelain", "-z"], {
          cwd: projectPath,
          encoding: "utf8",
        }).split("\0\0");
        if (
          worktreePath === projectPath ||
          !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(stint.workItem) ||
          stint.worktree.branch !== `stintwork/${stint.workItem}` ||
          !records.some((record) => {
            const fields = record.split("\0");
            return (
              fields.includes(`worktree ${worktreePath}`) &&
              fields.includes(`branch refs/heads/${stint.worktree.branch}`)
            );
          })
        )
          throw new Error("The logged worktree is not on this project's work item branch.");
        checkpointCommit = await createCheckpoint(worktreePath, {
          ...stint,
          status: "interrupted",
        });
      } catch (cause) {
        error = `Checkpoint failed: ${cause instanceof Error ? cause.message : String(cause)}`;
      }
      const ended: StintLogEntry = {
        type: "ended",
        at: new Date().toISOString(),
        status: "interrupted",
        handoff: null,
        ...(checkpointCommit ? { checkpointCommit } : {}),
        ...(error ? { error } : {}),
      };
      appendFileSync(
        join(root, path),
        `${text.endsWith("\n") ? "" : "\n"}${JSON.stringify(ended)}\n`,
      );
    }
  })();
  recovering.set(projectPath, recovery);
  return recovery.finally(() => recovering.delete(projectPath));
}

export function addStintHistoryRoute(app: Hono, files: RepoFiles) {
  app.get("/api/stints/:stintId", (context) => {
    context.header("Cache-Control", "no-store");
    const stint = indexStints(files).stints.find(
      (candidate) => candidate.id === context.req.param("stintId"),
    );
    return stint ? context.json({ stint }) : context.json({ reason: "Stint not found." }, 404);
  });
}
