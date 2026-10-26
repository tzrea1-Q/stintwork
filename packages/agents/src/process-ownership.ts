// SPDX-License-Identifier: Apache-2.0
import { execFileSync, spawnSync } from "node:child_process";
import { readlinkSync, realpathSync } from "node:fs";
import { relative, isAbsolute, resolve } from "node:path";
import type { StintProcessAttempt } from "@stintwork/core";

export type ProcessIdentity = {
  pid: number;
  parent?: number;
  group: number;
  identity: string;
  command: string;
  state?: string;
  uid?: number;
};
export type ProcessControl = {
  exists: (pid: number) => boolean;
  read: () => ProcessIdentity[];
  signal: (pid: number, signal: NodeJS.Signals) => void;
  workingDirectories: (pids: readonly number[], platform?: NodeJS.Platform) => Map<number, string>;
};
export const systemProcesses: ProcessControl = {
  exists(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
  },
  read() {
    // POSIX groups are created at launch, never inferred from a logged PID.
    const inspection = spawnSync(
      "/bin/ps",
      ["-axo", "pid=,ppid=,pgid=,uid=,lstart=,stat=,command="],
      {
        encoding: "utf8",
        timeout: 1000,
        maxBuffer: 16 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    if (inspection.error) throw inspection.error;
    if (inspection.status !== 0) throw new Error("Cannot inspect the native process table.");
    return inspection.stdout
      .trim()
      .split("\n")
      .flatMap((line) => {
        const match = line
          .trim()
          .match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\S+\s+\d+)\s+(\S+)\s+(.*)$/);
        if (!match) throw new Error("Cannot verify the native process table.");
        // This observed child has already exited; it must not look like new same-UID churn on every scan.
        if (Number(match[1]) === inspection.pid || match[6].includes("Z")) return [];
        return [
          {
            pid: Number(match[1]),
            uid: Number(match[4]),
            parent: Number(match[2]),
            group: Number(match[3]),
            identity: `${match[4]}:${match[5]}`,
            state: match[6],
            command: match[7],
          },
        ];
      });
  },
  workingDirectories(pids, platform = process.platform) {
    const directories = new Map<number, string>();
    if (platform === "linux") {
      for (const pid of pids) {
        try {
          directories.set(pid, readlinkSync(`/proc/${pid}/cwd`));
        } catch (error) {
          if (!["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? ""))
            throw error;
          // The caller rechecks identity: a missing cwd is safe only if the process also disappeared.
        }
      }
    } else if (platform === "darwin") {
      if (!pids.length) return directories;
      let output: string;
      try {
        output = execFileSync(
          "/usr/sbin/lsof",
          ["-a", "-p", pids.join(","), "-d", "cwd", "-F0pn"],
          {
            encoding: "utf8",
            timeout: 1000,
            maxBuffer: 16 * 1024 * 1024,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
      } catch (error) {
        const failure = error as {
          status?: number;
          stdout?: string;
          stderr?: string;
          code?: string;
          signal?: string;
        };
        if (
          failure.status !== 1 ||
          failure.stderr ||
          failure.code === "ETIMEDOUT" ||
          failure.signal
        )
          throw error;
        output = failure.stdout ?? "";
      }
      let pid = 0;
      let cwd = false;
      for (const entry of output.split("\0")) {
        const field = entry.replace(/^\n/, ""); // lsof terminates each record with an extra newline.
        if (!field) continue;
        if (/^p[1-9][0-9]*$/.test(field)) {
          pid = Number(field.slice(1));
          cwd = false;
        } else if (field === "fcwd") cwd = true;
        else if (field.startsWith("n") && pid && cwd && isAbsolute(field.slice(1))) {
          directories.set(pid, field.slice(1));
          cwd = false;
        } else throw new Error("Cannot verify native working-directory records.");
      }
    } else throw new Error("Native working-directory inspection requires Linux or macOS.");
    return directories;
  },
  signal: (pid, signal) => {
    process.kill(pid, signal);
  },
};

export class ProcessOwnershipError extends Error {}

export function processIdentity(pid: number): string | undefined {
  try {
    return systemProcesses.read().find((row) => row.pid === pid)?.identity;
  } catch {
    return undefined;
  } // Restricted/unsupported hosts must block orphan cleanup, never guess.
}

// Accept only the native UID:lstart identity, rejecting Date's permissive calendar normalization.
function nativeStart(identity: string | undefined, uid: number): number | undefined {
  const match = identity?.match(
    /^(\d+):([A-Za-z]{3})\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})\s+(\d{4})$/,
  );
  if (!match || Number(match[1]) !== uid) return;
  const date = new Date(`${match[3]} ${match[4]}, ${match[6]} ${match[5]}`);
  if (
    date.toDateString() !== `${match[2]} ${match[3]} ${match[4].padStart(2, "0")} ${match[6]}` ||
    date.toTimeString().slice(0, 8) !== match[5]
  )
    return;
  // lstart omits the UTC offset, so a repeated local time cannot establish ordering.
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  const repeatedMinutes = tomorrow.getTimezoneOffset() - date.getTimezoneOffset();
  const later = new Date(date.getTime() + repeatedMinutes * 60_000);
  if (
    repeatedMinutes > 0 &&
    later.toDateString() === date.toDateString() &&
    later.toTimeString().slice(0, 8) === match[5]
  )
    return;
  return date.getTime();
}

// Stops the recorded group and traceable descendants. Startup also checks marker/group/worktree cwd;
// the cwd heuristic excludes processes proven older than the attempt. Writers outside these links remain undiscoverable.
export async function stopStintProcesses(
  attempt: StintProcessAttempt,
  ownerReleased = false,
  processes = systemProcesses,
  unstartedExit?: Promise<void>,
  worktree?: string,
): Promise<void> {
  const blocked = (detail = "") =>
    new ProcessOwnershipError(
      `Cannot recover stint: previous owner or adapter/tool ownership is live or unverifiable (attempt ${attempt.id}, owner ${attempt.owner.pid}, adapter ${attempt.pid}, marker ${attempt.marker ?? "unavailable"}). ${detail} Verify any named live writers or restore native process/cwd inspection, then restart Stintwork. No checkpoint or replacement was started.`,
    );
  const describe = (row: ProcessIdentity) =>
    `${row.pid} (${row.command.length > 120 ? `${row.command.slice(0, 119)}…` : row.command})`;
  // Zombies retain a PID but cannot write, including in injected native snapshots.
  const liveProcesses = () => processes.read().filter((row) => !row.state?.includes("Z"));
  if (!ownerReleased && processes.exists(attempt.owner.pid)) {
    let owner: ProcessIdentity | undefined;
    try {
      owner = liveProcesses().find((row) => row.pid === attempt.owner.pid);
    } catch {
      throw blocked();
    }
    if (owner && (!attempt.owner.identity || owner.identity === attempt.owner.identity))
      throw blocked(`Recorded owner PID ${owner.pid} is still alive.`);
  }
  const group = attempt.processGroup ? -attempt.pid : attempt.pid;
  const verified = () => {
    let rows: ProcessIdentity[];
    try {
      rows = liveProcesses();
    } catch {
      throw blocked();
    }
    const leader = rows.find((row) => row.pid === attempt.pid);
    const marker = attempt.marker;
    if (
      !attempt.processGroup ||
      !attempt.identity ||
      marker !== `stintwork-${attempt.id}` ||
      !leader ||
      leader.group !== attempt.pid ||
      leader.identity !== attempt.identity ||
      !(leader.command === marker || leader.command.split(/\s+/).includes(`--title=${marker}`))
    )
      throw blocked();
    rememberOwned(rows);
    return rows;
  };
  const deadline = Date.now() + 1000;
  const owned = new Map<number, ProcessIdentity>();
  const frozen = new Set<number>();
  const same = (left: ProcessIdentity, right: ProcessIdentity) =>
    left.identity === right.identity &&
    left.parent === right.parent &&
    left.group === right.group &&
    left.command === right.command;
  function rememberOwned(rows: ProcessIdentity[]) {
    for (const row of rows) if (row.group === attempt.pid) owned.set(row.pid, row);
    // ponytail: small local process trees use repeated scans; index parent IDs if large trees make this budget expire.
    let added = true;
    while (added) {
      added = false;
      for (const row of rows)
        if (row.parent && owned.has(row.parent) && !owned.has(row.pid)) {
          const parent = rows.find((item) => item.pid === row.parent);
          const recorded = owned.get(row.parent);
          if (!parent || !recorded || !same(parent, recorded)) throw blocked();
          owned.set(row.pid, row);
          added = true;
        }
    }
  }
  function verifyDescendant(row: ProcessIdentity) {
    const currentRows = verified();
    const current = currentRows.find((item) => item.pid === row.pid);
    const parent = currentRows.find((item) => item.pid === row.parent);
    const recordedParent = row.parent ? owned.get(row.parent) : undefined;
    if (
      !current ||
      !same(current, row) ||
      !parent ||
      !recordedParent ||
      !same(parent, recordedParent)
    )
      throw blocked();
  }
  const signal = (pid: number, value: NodeJS.Signals) => {
    if (Date.now() > deadline) throw blocked();
    try {
      processes.signal(pid, value);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw blocked();
    }
  };
  try {
    verified();
    verified();
    signal(group, "SIGSTOP");
    // Freeze writers before walking their ancestry: a tool may have created its own process group.
    // Keep parents alive until every observed descendant is stopped, so ancestry cannot be lost.
    for (;;) {
      const rows = verified();
      let signalled = false;
      for (const row of owned.values()) {
        if (row.group === attempt.pid || frozen.has(row.pid)) continue;
        verifyDescendant(row);
        signal(row.pid, "SIGSTOP");
        frozen.add(row.pid);
        signalled = true;
      }
      if (signalled) continue;
      if (
        [...owned.values()].every(
          (row) =>
            !rows.find((item) => item.pid === row.pid)?.state ||
            rows.find((item) => item.pid === row.pid)?.state?.includes("T"),
        )
      )
        break;
      if (Date.now() >= deadline) throw blocked();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    for (const row of [...owned.values()].reverse()) {
      if (row.group === attempt.pid) continue;
      verifyDescendant(row);
      signal(row.pid, "SIGKILL");
    }
    verified();
    signal(group, "SIGKILL");
    for (;;) {
      let rows: ProcessIdentity[];
      try {
        rows = liveProcesses();
      } catch {
        throw blocked();
      }
      if (
        !rows.some(
          (row) =>
            row.group === attempt.pid ||
            row.parent === attempt.pid ||
            owned.get(row.pid)?.identity === row.identity,
        )
      )
        return;
      if (Date.now() >= deadline) throw blocked();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } catch (error) {
    if (!ownerReleased && worktree && error instanceof ProcessOwnershipError) {
      // Missing launch metadata cannot authorize signals, but native absence can still authorize fallback.
      const uid = process.getuid?.();
      if (
        uid === undefined ||
        (attempt.marker !== null && attempt.marker !== `stintwork-${attempt.id}`) ||
        (attempt.identity !== undefined && !attempt.identity.startsWith(`${uid}:`)) ||
        (attempt.owner.identity !== undefined && !attempt.owner.identity.startsWith(`${uid}:`))
      )
        throw error;
      const roots = [resolve(worktree)];
      try {
        roots.push(realpathSync(worktree));
      } catch (error) {
        if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? ""))
          throw blocked("Cannot resolve the worktree path for writer inspection.");
        // A missing worktree still needs an absence check before the non-mutating ending fallback.
      }
      const snapshot = () => {
        try {
          return liveProcesses();
        } catch {
          throw blocked("Process table inspection failed.");
        }
      };
      const rows = snapshot();
      const initial = new Map(rows.map((row) => [row.pid, row]));
      const serverIdentity = initial.get(process.pid)?.identity;
      // Parent PIDs alone are insufficient: each link must keep its identity and ancestry across snapshots.
      const localProcesses = (before: ProcessIdentity[], after: ProcessIdentity[]) => {
        const previous = new Map(before.map((row) => [row.pid, row]));
        const local = new Set<number>();
        if (
          serverIdentity &&
          previous.get(process.pid)?.identity === serverIdentity &&
          after.some((row) => row.pid === process.pid && row.identity === serverIdentity)
        )
          local.add(process.pid);
        // ponytail: small local process trees use repeated scans; index children if this exceeds the cleanup budget.
        let added = true;
        while (added) {
          added = false;
          for (const row of after) {
            const old = previous.get(row.pid);
            const original = initial.get(row.pid);
            if (
              row.parent &&
              local.has(row.parent) &&
              !local.has(row.pid) &&
              old?.identity === row.identity &&
              old.parent === row.parent &&
              (!original || (original.identity === row.identity && original.parent === row.parent))
            ) {
              local.add(row.pid);
              added = true;
            }
          }
        }
        return local;
      };
      const local = localProcesses(rows, rows);
      const absent = (rows: ProcessIdentity[], local: Set<number>) => {
        if (
          rows.some(
            (row) =>
              (row.pid === attempt.owner.pid &&
                (!attempt.owner.identity || row.identity === attempt.owner.identity)) ||
              (row.pid === attempt.pid && (!attempt.identity || row.identity === attempt.identity)),
          )
        )
          throw blocked("The recorded owner or adapter is still alive.");
        const writers = rows.filter(
          (row) =>
            !local.has(row.pid) &&
            ((attempt.processGroup && row.group === attempt.pid) ||
              (row.parent === attempt.pid && !rows.some((parent) => parent.pid === attempt.pid)) ||
              (attempt.marker !== null && row.command.includes(attempt.marker)) ||
              owned.get(row.pid)?.identity === row.identity),
        );
        if (writers.length)
          throw blocked(
            `Live possible writers: ${writers.map(describe).join(", ")}. Verify and stop those writers before retrying.`,
          );
      };
      absent(rows, local);
      if (rows.some((row) => !Number.isSafeInteger(row.uid)))
        throw blocked("Process UID inspection is unavailable.");
      const candidates = new Map(
        rows
          .filter((row) => row.uid === uid && !local.has(row.pid))
          .map((row) => [row.pid, row.identity]),
      );
      let directories: Map<number, string>;
      try {
        directories = processes.workingDirectories([...candidates.keys()]);
      } catch {
        throw blocked("Working-directory inspection failed; no live writer has been identified.");
      }
      const current = snapshot();
      const currentLocal = localProcesses(rows, current);
      absent(current, currentLocal);
      if (Date.now() >= deadline) throw blocked("Writer inspection exceeded its cleanup budget.");
      let rechecked: ProcessIdentity[] | undefined;
      for (const row of current) {
        if (!Number.isSafeInteger(row.uid)) throw blocked("Process UID inspection is unavailable.");
        if (row.uid !== uid || currentLocal.has(row.pid)) continue;
        const directory = directories.get(row.pid);
        if (!directory) {
          // lsof/proc can lose cwd before ps loses an exiting process. Recheck once, within the same budget.
          rechecked ??= snapshot();
          const recheckedLocal = localProcesses(current, rechecked);
          absent(rechecked, recheckedLocal);
          if (Date.now() >= deadline)
            throw blocked("Writer inspection exceeded its cleanup budget.");
          if (
            recheckedLocal.has(row.pid) ||
            !rechecked.some((item) => item.pid === row.pid && item.identity === row.identity)
          )
            continue;
        }
        if (candidates.get(row.pid) !== row.identity || !directory || !isAbsolute(directory))
          throw blocked(
            `Cannot inspect working directory for live PID ${describe(row)}; no writer ownership was assumed.`,
          );
        // Keep the raw spelling too: " (deleted)" can also be part of a real directory name.
        const paths = [resolve(directory), resolve(directory.replace(/ \(deleted\)$/, ""))];
        if (
          roots.some((root) =>
            paths.some((path) => {
              const inside = relative(root, path);
              return inside !== ".." && !inside.startsWith("../") && !isAbsolute(inside);
            }),
          )
        ) {
          const attemptStart = nativeStart(attempt.identity, uid);
          const start = nativeStart(row.identity, uid);
          // lstart has one-second resolution; the same second can still belong to this attempt.
          if (start !== undefined && attemptStart !== undefined && start + 1000 <= attemptStart)
            continue;
          throw blocked(
            `Live possible writer: PID ${describe(row)}, cwd ${directory}. Verify and stop that writer before retrying.`,
          );
        }
      }
      return;
    }
    if (!ownerReleased || !unstartedExit || !(error instanceof ProcessOwnershipError)) throw error;
    // ACP may close before Node delivers this server's ChildProcess exit event.
    // Only an unstarted local handle may use this proof. After session loading/work,
    // a vanished leader can have left reparented writers we can no longer identify.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        unstartedExit,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(error), Math.max(0, deadline - Date.now()));
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    let rows: ProcessIdentity[];
    try {
      rows = liveProcesses();
    } catch {
      throw error;
    }
    if (
      rows.some(
        (row) =>
          row.group === attempt.pid ||
          row.parent === attempt.pid ||
          owned.get(row.pid)?.identity === row.identity,
      )
    )
      throw error;
  }
}
