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
  read: (timeoutMs?: number) => ProcessIdentity[];
  signal: (pid: number, signal: NodeJS.Signals) => void;
  workingDirectories: (
    pids: readonly number[],
    platform?: NodeJS.Platform,
    timeoutMs?: number,
  ) => Map<number, string>;
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
  read(timeoutMs = 1000) {
    // POSIX groups are created at launch, never inferred from a logged PID.
    const inspection = spawnSync(
      "/bin/ps",
      ["-axo", "pid=,ppid=,pgid=,uid=,lstart=,stat=,command="],
      {
        encoding: "utf8",
        timeout: timeoutMs,
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
  workingDirectories(pids, platform = process.platform, timeoutMs = 1000) {
    const directories = new Map<number, string>();
    if (platform === "linux") {
      const deadline = Date.now() + timeoutMs;
      for (const pid of pids) {
        if (Date.now() >= deadline) throw new Error("Working-directory inspection timed out.");
        try {
          directories.set(pid, readlinkSync(`/proc/${pid}/cwd`));
        } catch (error) {
          if (
            !["ENOENT", "ESRCH", "EACCES", "EPERM"].includes(
              (error as NodeJS.ErrnoException).code ?? "",
            )
          )
            throw error;
          // Missing/denied records stay unreadable; the caller rechecks identity across bounded scans.
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
            timeout: timeoutMs,
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
  scanOptions: {
    attempts?: number;
    intervalMs?: number;
    timeoutMs?: number;
    now?: () => number;
    wait?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<void> {
  const blocked = (detail: string) =>
    new ProcessOwnershipError(
      `${ownerReleased ? "Cannot clean up current attempt: adapter/tool ownership" : "Cannot recover stint: previous owner or adapter/tool ownership"} is live or unverifiable (attempt ${attempt.id}, owner ${attempt.owner.pid}, adapter ${attempt.pid}, marker ${attempt.marker ?? "unavailable"}). ${detail} Verify any named live writers or restore native process/cwd inspection, then restart Stintwork. No checkpoint or replacement was started.`,
    );
  const describe = (row: ProcessIdentity) =>
    `${row.pid} (${row.command.length > 120 ? `${row.command.slice(0, 119)}…` : row.command})`;
  // Zombies retain a PID but cannot write, including in injected native snapshots.
  const liveProcesses = (timeoutMs?: number) =>
    processes.read(timeoutMs).filter((row) => !row.state?.includes("Z"));
  const checkOwner = () => {
    if (!ownerReleased && processes.exists(attempt.owner.pid)) {
      let owner: ProcessIdentity | undefined;
      try {
        owner = liveProcesses().find((row) => row.pid === attempt.owner.pid);
      } catch {
        throw blocked("Cannot inspect the recorded owner in the native process table.");
      }
      if (owner && (!attempt.owner.identity || owner.identity === attempt.owner.identity))
        throw blocked(`Recorded owner PID ${owner.pid} is still alive.`);
    }
  };
  const group = attempt.processGroup ? -attempt.pid : attempt.pid;
  const verified = () => {
    let rows: ProcessIdentity[];
    try {
      rows = liveProcesses();
    } catch {
      throw blocked("Cannot inspect the adapter in the native process table.");
    }
    const leader = rows.find((row) => row.pid === attempt.pid);
    const marker = attempt.marker;
    if (!attempt.processGroup)
      throw blocked("Recorded attempt has no process-group ownership proof.");
    if (!attempt.identity) throw blocked("Recorded adapter start identity is unavailable.");
    if (marker !== `stintwork-${attempt.id}`)
      throw blocked("Recorded launch marker does not match the attempt.");
    if (!leader) throw blocked(`Adapter PID ${attempt.pid} is absent from the live process table.`);
    if (leader.group !== attempt.pid)
      throw blocked(`Adapter PID ${attempt.pid} no longer leads the recorded process group.`);
    if (leader.identity !== attempt.identity)
      throw blocked(`Adapter PID ${attempt.pid} has a different native start identity.`);
    if (!(leader.command === marker || leader.command.split(/\s+/).includes(`--title=${marker}`)))
      throw blocked(`Adapter PID ${attempt.pid} no longer has the recorded launch marker.`);
    rememberOwned(rows);
    return rows;
  };
  const now = scanOptions.now ?? Date.now;
  const wait =
    scanOptions.wait ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = now() + 1000;
  const owned = new Map<number, ProcessIdentity>();
  const frozen = new Set<number>();
  let groupFrozen = false;
  // exec and setsid can change command/group without changing native identity or ancestry.
  const same = (left: ProcessIdentity, right: ProcessIdentity) =>
    left.identity === right.identity && left.parent === right.parent;
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
          if (!parent || !recorded || !same(parent, recorded))
            throw blocked(`Cannot verify ancestry for PID ${describe(row)}.`);
          owned.set(row.pid, row);
          added = true;
        }
    }
  }
  function verifyDescendant(row: ProcessIdentity, currentRows: ProcessIdentity[]) {
    const current = currentRows.find((item) => item.pid === row.pid);
    if (!current) {
      owned.delete(row.pid);
      return false;
    }
    const parent = currentRows.find((item) => item.pid === row.parent);
    const recordedParent = row.parent ? owned.get(row.parent) : undefined;
    if (
      !same(current, row) ||
      (row.group !== attempt.pid && (!parent || !recordedParent || !same(parent, recordedParent)))
    )
      throw blocked(`PID/start identity or ancestry changed for descendant ${describe(row)}.`);
    return true;
  }
  const signal = (pid: number, value: NodeJS.Signals) => {
    if (now() > deadline)
      throw blocked(`Cleanup budget expired before ${value} to PID/group ${pid}.`);
    // Even a failed syscall may leave signalling uncertain; unwind every attempted freeze.
    if (value === "SIGSTOP") {
      if (pid === group) {
        groupFrozen = true;
      } else frozen.add(pid);
    }
    try {
      processes.signal(pid, value);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH")
        throw blocked(`${value} to PID/group ${pid} failed: ${String(error)}.`);
    }
  };
  try {
    checkOwner();
    verified();
    verified();
    signal(group, "SIGSTOP");
    // Freeze writers before walking their ancestry: a tool may have created its own process group.
    // Keep parents alive until every observed descendant is stopped, so ancestry cannot be lost.
    let stoppedRows: ProcessIdentity[];
    for (;;) {
      const rows = verified();
      let signalled = false;
      for (const row of owned.values()) {
        const current = rows.find((item) => item.pid === row.pid);
        if (current?.group === attempt.pid || frozen.has(row.pid)) continue;
        if (!verifyDescendant(row, rows)) continue;
        signal(row.pid, "SIGSTOP");
        signalled = true;
      }
      if (signalled) continue;
      if (
        [...owned.values()].every(
          (row) =>
            !rows.find((item) => item.pid === row.pid)?.state ||
            rows.find((item) => item.pid === row.pid)?.state?.includes("T"),
        )
      ) {
        // All observed writers are frozen; share this snapshot instead of running ps per kill.
        stoppedRows = rows;
        break;
      }
      if (now() >= deadline) throw blocked("Cleanup budget expired waiting for writers to stop.");
      await wait(10);
    }
    for (const row of [...owned.values()].reverse()) {
      if (stoppedRows.find((item) => item.pid === row.pid)?.group === attempt.pid) continue;
      if (!verifyDescendant(row, stoppedRows)) continue;
      signal(row.pid, "SIGKILL");
    }
    verified();
    signal(group, "SIGKILL");
    for (;;) {
      let rows: ProcessIdentity[];
      try {
        rows = liveProcesses();
      } catch {
        throw blocked("Cannot inspect remaining writers after SIGKILL.");
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
      if (now() >= deadline)
        throw blocked("Cleanup budget expired waiting for killed writers to exit.");
      await wait(10);
    }
  } catch (error) {
    if (groupFrozen || frozen.size) {
      let rows: ProcessIdentity[] | undefined;
      try {
        rows = liveProcesses();
      } catch {
        /* Inspection uncertainty permits continuation, never an unverified kill. */
      }
      const failures: string[] = [];
      const release = (pid: number, value: NodeJS.Signals) => {
        try {
          processes.signal(pid, value);
        } catch (failure) {
          if ((failure as NodeJS.ErrnoException).code !== "ESRCH")
            failures.push(`${value} to ${pid}: ${String(failure)}`);
        }
      };
      for (const recorded of [...owned.values()].reverse()) {
        if (recorded.group !== attempt.pid && !frozen.has(recorded.pid)) continue;
        const current = rows?.find((row) => row.pid === recorded.pid);
        // A confirmed stopped process cannot exit/exec/reuse its PID by itself. A fresh matching
        // native identity authorizes its kill even after the normal deadline. Uncertainty only
        // authorizes SIGCONT; never strand a group just because verification or ps failed.
        if (current?.identity === recorded.identity && current.state?.includes("T"))
          release(recorded.pid, "SIGKILL");
      }
      // setsid/setpgid can race the group stop. The recorded members need individual
      // continuation too, even if a failed inspection cannot find their new groups.
      for (const recorded of owned.values())
        if (recorded.group === attempt.pid) release(recorded.pid, "SIGCONT");
      for (const pid of frozen) release(pid, "SIGCONT");
      if (groupFrozen) release(group, "SIGCONT");
      if (failures.length)
        throw blocked(
          `Frozen-writer release failed (${failures.join("; ")}). Original check: ${String(error)}`,
        );
    }
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
      const {
        attempts = 4,
        intervalMs = 500,
        timeoutMs = 3000,
        now = Date.now,
        wait = (milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
      } = scanOptions;
      if (
        !Number.isInteger(attempts) ||
        attempts < 1 ||
        attempts > 4 ||
        !Number.isFinite(timeoutMs) ||
        timeoutMs <= 0 ||
        timeoutMs > 3000 ||
        !Number.isFinite(intervalMs) ||
        intervalMs < 0
      )
        throw blocked("Invalid orphan inspection schedule.");
      const scanDeadline = now() + timeoutMs;
      const remaining = () => {
        const milliseconds = Math.min(1000, Math.floor(scanDeadline - now()));
        if (milliseconds <= 0) throw blocked("Writer inspection exceeded its cleanup budget.");
        return milliseconds;
      };
      const key = (row: ProcessIdentity) => `${row.pid}:${row.identity}`;
      const scan = () => {
        const snapshot = () => {
          try {
            return liveProcesses(remaining());
          } catch {
            throw blocked("Process table inspection failed.");
          }
        };
        const rows = snapshot();
        const initial = new Map(rows.map((row) => [row.pid, row]));
        const attemptStart = nativeStart(attempt.identity, uid);
        const predatesAttempt = (row: ProcessIdentity) => {
          const start = nativeStart(row.identity, uid);
          // Only a stable identity in an earlier native start second proves this exclusion.
          return (
            initial.get(row.pid)?.identity === row.identity &&
            start !== undefined &&
            attemptStart !== undefined &&
            start + 1000 <= attemptStart
          );
        };
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
                (!original ||
                  (original.identity === row.identity && original.parent === row.parent))
              ) {
                local.add(row.pid);
                added = true;
              }
            }
          }
          return local;
        };
        const local = localProcesses(rows, rows);
        if (rows.some((row) => !Number.isSafeInteger(row.uid)))
          throw blocked("Process UID inspection is unavailable.");
        const candidates = new Map(
          rows
            .filter((row) => row.uid === uid && !local.has(row.pid) && !predatesAttempt(row))
            .map((row) => [row.pid, row.identity]),
        );
        let directories: Map<number, string>;
        try {
          directories = processes.workingDirectories(
            [...candidates.keys()],
            undefined,
            remaining(),
          );
        } catch {
          throw blocked("Working-directory inspection failed; no live writer has been identified.");
        }
        let current = snapshot();
        const replaced = new Set<string>();
        let currentLocal = localProcesses(rows, current);
        if (
          current.some(
            (row) =>
              row.uid === uid &&
              !currentLocal.has(row.pid) &&
              !predatesAttempt(row) &&
              (!directories.has(row.pid) || candidates.get(row.pid) !== row.identity),
          )
        ) {
          const rechecked = snapshot();
          for (const row of rechecked)
            if (current.some((old) => old.pid === row.pid && old.identity !== row.identity))
              replaced.add(key(row));
          currentLocal = localProcesses(current, rechecked);
          current = rechecked;
        }
        remaining();
        const writers = new Map<string, ProcessOwnershipError>();
        const unreadable = new Map<string, ProcessOwnershipError>();
        // A transient first row must not hide another persistently unreadable process.
        for (const row of current) {
          if (!Number.isSafeInteger(row.uid))
            throw blocked("Process UID inspection is unavailable.");
          if (
            (row.pid === attempt.owner.pid &&
              (!attempt.owner.identity || row.identity === attempt.owner.identity)) ||
            (row.pid === attempt.pid && (!attempt.identity || row.identity === attempt.identity)) ||
            (!currentLocal.has(row.pid) &&
              ((attempt.processGroup && row.group === attempt.pid) ||
                (row.parent === attempt.pid &&
                  !current.some((parent) => parent.pid === attempt.pid)) ||
                (attempt.marker !== null && row.command.includes(attempt.marker)) ||
                owned.get(row.pid)?.identity === row.identity))
          ) {
            writers.set(
              key(row),
              blocked(
                `Live possible writers: ${describe(row)}. Verify and stop those writers before retrying.`,
              ),
            );
            continue;
          }
          if (
            row.uid !== uid ||
            currentLocal.has(row.pid) ||
            replaced.has(key(row)) ||
            predatesAttempt(row)
          )
            continue;
          const directory = directories.get(row.pid);
          if (candidates.get(row.pid) !== row.identity || !directory || !isAbsolute(directory)) {
            unreadable.set(
              key(row),
              blocked(
                `Cannot inspect working directory for live PID ${describe(row)}; no writer ownership was assumed.`,
              ),
            );
            continue;
          }
          // Retain both spellings: " (deleted)" may also be part of a real directory name.
          const paths = [resolve(directory), resolve(directory.replace(/ \(deleted\)$/, ""))];
          if (
            roots.some((root) =>
              paths.some((path) => {
                const inside = relative(root, path);
                return inside !== ".." && !inside.startsWith("../") && !isAbsolute(inside);
              }),
            )
          ) {
            writers.set(
              key(row),
              blocked(
                `Live possible writer: PID ${describe(row)}, cwd ${directory}. Verify and stop that writer before retrying.`,
              ),
            );
          }
        }
        remaining();
        return { writers, unreadable };
      };
      let persistent: Map<string, ProcessOwnershipError> | undefined;
      let failure: unknown = error;
      for (let index = 0; index < attempts && now() < scanDeadline; index++) {
        try {
          const result = scan();
          // Only the same PID/start identity, unreadable in every complete scan, remains uncertain.
          persistent =
            persistent === undefined
              ? result.unreadable
              : new Map([...persistent].filter(([identity]) => result.unreadable.has(identity)));
          if (!result.writers.size && !result.unreadable.size) return;
          if (index + 1 === attempts) {
            const blocker =
              result.writers.values().next().value ?? persistent.values().next().value;
            if (!blocker) return;
            throw blocker;
          }
          failure =
            result.writers.values().next().value ??
            persistent.values().next().value ??
            blocked("Writer inspection remained uncertain.");
        } catch (error) {
          failure = error;
        }
        if (index + 1 < attempts && now() < scanDeadline)
          await wait(Math.min(intervalMs, scanDeadline - now()));
      }
      throw failure;
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
          timer = setTimeout(() => reject(error), Math.max(0, deadline - now()));
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
