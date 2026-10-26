// SPDX-License-Identifier: Apache-2.0
import {
  coreTextWire,
  coreText,
  indexStints,
  type CheckpointWarning,
  type RepoFiles,
  type StintLogEntry,
  type Stint,
  isStintLogEntry,
} from "@stintwork/core";

import { execFileSync } from "node:child_process";
import { appendFileSync, closeSync, fstatSync, openSync, readSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { ensureLocalIgnore } from "./stint-repo-writes.js";
import { createCheckpoint, committedRiskyPaths } from "@stintwork/git";
import type { Hono } from "hono";

export const activeStintIds = new Set<string>();
const recovering = new Map<string, Promise<void>>();

/** Keep a torn last line as evidence and separate every new append from it. */
export function appendStintLog(path: string, entry: StintLogEntry) {
  const descriptor = openSync(path, "a+");
  try {
    const size = fstatSync(descriptor).size;
    const last = Buffer.alloc(1);
    if (size) readSync(descriptor, last, 0, 1, size - 1);
    appendFileSync(
      descriptor,
      `${size && last[0] !== 10 ? "\n" : ""}${JSON.stringify(coreTextWire(entry))}\n`,
    );
  } finally {
    closeSync(descriptor);
  }
}

export function verifyStintWorktree(
  root: string,
  stint: Pick<Stint, "worktree" | "workItem" | "baseCommit">,
) {
  const projectPath = realpathSync(root);
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
  execFileSync("git", ["merge-base", "--is-ancestor", stint.baseCommit, "HEAD"], {
    cwd: worktreePath,
  });
  return worktreePath;
}

export function recoverInterruptedStints(
  root: string,
  files: RepoFiles,
  adopt?: (stint: Stint, entries: StintLogEntry[], valid: boolean) => boolean,
): Promise<void> {
  const projectPath = realpathSync(root);
  const pending = recovering.get(projectPath);
  if (pending)
    return adopt ? pending.then(() => recoverInterruptedStints(root, files, adopt)) : pending;
  const recovery = (async () => {
    for (const path of files
      .list(".stintwork/local/stints/")
      .filter((path) => path.endsWith(".jsonl"))) {
      const text = files.read(path);
      if (text === undefined) continue;
      const { stints, warnings } = indexStints({ list: () => [path], read: () => text });
      const stint = stints[0];
      if (stint?.status !== "running" || (!adopt && activeStintIds.has(stint.id))) continue;
      const entries = text
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
          try {
            const entry: unknown = JSON.parse(line);
            return isStintLogEntry(entry) ? [entry] : [];
          } catch {
            return [];
          }
        });
      if (adopt?.(stint, entries, warnings.length === 0)) continue;
      let checkpointCommit: string | undefined;
      let checkpointWarnings: CheckpointWarning[] = [];
      let error: string | undefined;
      let verifiedWorktree: string | undefined;
      try {
        const worktreePath = verifyStintWorktree(root, stint);
        verifiedWorktree = worktreePath;
        ensureLocalIgnore(worktreePath);
        checkpointCommit = await createCheckpoint(
          worktreePath,
          {
            ...stint,
            status: "interrupted",
          },
          (warnings) => {
            checkpointWarnings = warnings;
          },
        );
      } catch (cause) {
        error = `Checkpoint failed: ${cause instanceof Error ? cause.message : String(cause)}`;
      }
      if (verifiedWorktree) {
        try {
          checkpointWarnings.push(...committedRiskyPaths(verifiedWorktree, stint.baseCommit));
        } catch (cause) {
          error = [error, `Cannot inspect stint commits: ${String(cause)}`]
            .filter(Boolean)
            .join("\n");
        }
      }
      const ended: StintLogEntry = {
        type: "ended",
        at: new Date().toISOString(),
        status: "interrupted",
        handoff: null,
        ...(checkpointCommit ? { checkpointCommit } : {}),
        ...(checkpointWarnings.length ? { checkpointWarnings } : {}),
        ...(error ? { error } : {}),
      };
      ensureLocalIgnore(root);
      appendStintLog(join(root, path), ended);
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
    return stint
      ? context.json(coreTextWire({ stint }))
      : context.json(coreTextWire({ reason: coreText({ code: "server.stintNotFound" }) }), 404);
  });
}
