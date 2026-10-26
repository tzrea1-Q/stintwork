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

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { processIdentity, systemProcesses } from "@stintwork/agents";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  fstatSync,
  openSync,
  readSync,
  realpathSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";

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

export function addStintHistoryRoute(
  app: Hono,
  files: RepoFiles,
  hasPermissionBinding: (stintId: string, requestId: string, attemptId?: string) => boolean = () =>
    false,
) {
  app.get("/api/stints/:stintId", (context) => {
    context.header("Cache-Control", "no-store");
    const stint = indexStints(files).stints.find(
      (candidate) => candidate.id === context.req.param("stintId"),
    );
    if (stint?.status === "running")
      stint.events = stint.events.map((event) =>
        event.type === "permission_request" &&
        !event.automatic &&
        event.binding === "live" &&
        !hasPermissionBinding(stint.id, event.requestId, event.attemptId)
          ? { ...event, binding: "reconnecting" }
          : event,
      );
    return stint
      ? context.json(coreTextWire({ stint }))
      : context.json(coreTextWire({ reason: coreText({ code: "server.stintNotFound" }) }), 404);
  });
}

/** A short synchronous claim prevents concurrent servers from reclaiming each other's stale lock. */
export function reserveStintWorkItem(directory: string, slug: string): () => void {
  const path = join(directory, `${encodeURIComponent(slug)}.owner`);
  const claim = `${path}.claim`;
  const conflict = () =>
    new Error(
      `Work item is reserved by another server or ownership is unverifiable. Stop that server; if it is gone, inspect ${path} and ${claim} before removing stale ownership files and restarting Stintwork.`,
    );
  try {
    mkdirSync(claim);
  } catch {
    throw conflict();
  }
  try {
    let previous: { pid: number; identity?: string };
    try {
      previous = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw conflict();
      previous = { pid: 0 };
    }
    if (
      !previous ||
      typeof previous !== "object" ||
      (previous.identity !== undefined &&
        (typeof previous.identity !== "string" || !previous.identity.trim()))
    )
      throw conflict();
    if (previous.pid !== 0) {
      if (!Number.isSafeInteger(previous.pid) || previous.pid < 1) throw conflict();
      if (systemProcesses.exists(previous.pid)) {
        const identity = processIdentity(previous.pid);
        if (!previous.identity || !identity || identity === previous.identity) throw conflict();
      }
      unlinkSync(path);
    }
    const token = randomUUID();
    writeFileSync(
      path,
      JSON.stringify({ pid: process.pid, identity: processIdentity(process.pid), token }),
      { flag: "wx", mode: 0o600 },
    );
    return () => {
      if (JSON.parse(readFileSync(path, "utf8")).token === token) unlinkSync(path);
    };
  } finally {
    rmdirSync(claim);
  }
}
