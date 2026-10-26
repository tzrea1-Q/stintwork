// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import type { StintProcessAttempt } from "@stintwork/core";

export type ProcessIdentity = {
  pid: number;
  parent?: number;
  group: number;
  identity: string;
  command: string;
  state?: string;
};
export type ProcessControl = {
  exists: (pid: number) => boolean;
  read: () => ProcessIdentity[];
  signal: (pid: number, signal: NodeJS.Signals) => void;
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
    const output = execFileSync(
      "/bin/ps",
      ["-axo", "pid=,ppid=,pgid=,uid=,lstart=,stat=,command="],
      {
        encoding: "utf8",
        timeout: 1000,
        maxBuffer: 16 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return output
      .trim()
      .split("\n")
      .flatMap((line) => {
        const match = line
          .trim()
          .match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\S+\s+\d+)\s+(\S+)\s+(.*)$/);
        if (!match) throw new Error("Cannot verify the native process table.");
        if (match[6].includes("Z")) return [];
        return [
          {
            pid: Number(match[1]),
            parent: Number(match[2]),
            group: Number(match[3]),
            identity: `${match[4]}:${match[5]}`,
            state: match[6],
            command: match[7],
          },
        ];
      });
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

export async function stopStintProcesses(
  attempt: StintProcessAttempt,
  ownerReleased = false,
  processes = systemProcesses,
  unstartedExit?: Promise<void>,
): Promise<void> {
  const blocked = () =>
    new ProcessOwnershipError(
      `Cannot recover stint: previous owner or adapter/tool ownership is live or unverifiable (attempt ${attempt.id}, owner ${attempt.owner.pid}, adapter ${attempt.pid}, marker ${attempt.marker ?? "unavailable"}). Stop the old processes after verifying their identities, then restart Stintwork. No checkpoint or replacement was started.`,
    );
  if (!ownerReleased && processes.exists(attempt.owner.pid)) {
    if (!attempt.owner.identity) throw blocked();
    let owner: ProcessIdentity | undefined;
    try {
      owner = processes.read().find((row) => row.pid === attempt.owner.pid);
    } catch {
      throw blocked();
    }
    if (owner?.identity === attempt.owner.identity) throw blocked();
  }
  const group = attempt.processGroup ? -attempt.pid : attempt.pid;
  const verified = () => {
    let rows: ProcessIdentity[];
    try {
      rows = processes.read();
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
        rows = processes.read();
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
      rows = processes.read();
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
