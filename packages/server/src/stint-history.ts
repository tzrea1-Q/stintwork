// SPDX-License-Identifier: Apache-2.0
import {
  coreTextWire,
  coreText,
  indexStints,
  type RepoFiles,
  type StintLogEntry,
  type Stint,
  type Warning,
  isStintLogEntry,
} from "@stintwork/core";

import { execFileSync } from "node:child_process";
import { appendFileSync, closeSync, fstatSync, openSync, readSync, realpathSync } from "node:fs";

import type { Hono } from "hono";

export const activeStintIds = new Set<string>();

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

/** Discover once at startup; adoption reserves synchronously and queues all agent/Git work. */
export function recoverInterruptedStints(
  files: RepoFiles,
  adopt: (stint: Stint, entries: StintLogEntry[], valid: boolean, path: string) => void,
  warn: (warning: Warning) => void,
): void {
  let paths: readonly string[];
  try {
    paths = files.list(".stintwork/local/stints/");
  } catch (error) {
    warn({ path: ".stintwork/local/stints/", message: `Cannot list stint logs: ${String(error)}` });
    return;
  }
  for (const path of paths.filter((path) => path.endsWith(".jsonl"))) {
    let text: string | undefined;
    try {
      text = files.read(path);
    } catch (error) {
      warn({ path, message: `Cannot read stint log: ${String(error)}` });
      continue;
    }
    if (text === undefined) continue;
    const { stints, warnings } = indexStints({ list: () => [path], read: () => text });
    const stint = stints[0];
    if (stint?.status !== "running") continue;
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
    adopt(stint, entries, warnings.length === 0, path);
  }
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
