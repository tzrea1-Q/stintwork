// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import type { StintProcessAttempt } from "@stintwork/core";
import {
  stopStintProcesses,
  type ProcessControl,
  type ProcessIdentity,
} from "./process-ownership.js";

const attempt: StintProcessAttempt = {
  id: "attempt",
  marker: "stintwork-attempt",
  pid: 20,
  owner: { pid: 10, startedAt: "2026-01-01T00:00:00Z", identity: "owner-start" },
  identity: "adapter-start",
  processGroup: true,
};
function processes(rows: ProcessIdentity[]) {
  const table = new Map(rows.map((row) => [row.pid, row]));
  const signal = vi.fn((pid: number, _signal: NodeJS.Signals) => {
    for (const row of table.values())
      if (pid === row.pid || -pid === row.group) {
        if (_signal === "SIGSTOP") row.state = "T";
        else table.delete(row.pid);
      }
  });
  const control: ProcessControl = {
    exists: (pid) =>
      pid < 0 ? [...table.values()].some((row) => row.group === -pid) : table.has(pid),
    read: () => [...table.values()],
    signal,
    workingDirectories: () => new Map(),
  };
  return { table, signal, control };
}
const adapter = { pid: 20, group: 20, identity: "adapter-start", command: "stintwork-attempt" };

test("a dead server's verified attempt stops its adapter and tools before releasing writers", async () => {
  const fake = processes([
    adapter,
    { pid: 21, group: 20, identity: "tool-start", command: "tool" },
    { pid: 30, group: 30, identity: "unrelated", command: "editor" },
  ]);
  await stopStintProcesses(attempt, false, fake.control);
  expect([...fake.table.keys()]).toEqual([30]);
  expect(fake.signal.mock.calls).toEqual([
    [-20, "SIGSTOP"],
    [-20, "SIGKILL"],
  ]);
});

test.each(["owner", "reused", "marker", "missing-proof", "orphan"])(
  "%s ownership blocks cleanup without signalling any process",
  async (fault) => {
    const recorded = structuredClone(attempt);
    const fake = processes([
      { ...adapter },
      { pid: 21, group: 20, identity: "tool-start", command: "tool" },
    ]);
    if (fault === "owner")
      fake.table.set(10, { pid: 10, group: 10, identity: "owner-start", command: "server" });
    if (fault === "reused") fake.table.set(20, { ...adapter, identity: "reused-start" });
    if (fault === "marker") fake.table.set(20, { ...adapter, command: "unrelated" });
    if (fault === "missing-proof") delete recorded.identity;
    if (fault === "orphan") fake.table.delete(20);
    await expect(stopStintProcesses(recorded, false, fake.control)).rejects.toThrow(
      /No checkpoint or replacement/,
    );
    expect(fake.signal).not.toHaveBeenCalled();
  },
);

test("a reused owner PID does not authorize signalling it or block a verified old adapter", async () => {
  const fake = processes([
    adapter,
    { pid: 10, group: 10, identity: "different-start", command: "editor" },
  ]);
  await stopStintProcesses(attempt, false, fake.control);
  expect([...fake.table.keys()]).toEqual([10]);
  expect(fake.signal.mock.calls).toEqual([
    [-20, "SIGSTOP"],
    [-20, "SIGKILL"],
  ]);
});

test("identity is rechecked immediately before signalling, including a PID reused during inspection", async () => {
  const fake = processes([adapter]);
  let reads = 0;
  const read = fake.control.read;
  fake.control.read = () => {
    if (++reads === 2) fake.table.set(20, { ...adapter, identity: "reused" });
    return read();
  };
  await expect(stopStintProcesses(attempt, false, fake.control)).rejects.toThrow(
    /No checkpoint or replacement/,
  );
  expect(fake.signal).not.toHaveBeenCalled();
});

test("cleanup is bounded and never retries a signal against a surviving or reused group", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  try {
    const fake = processes([adapter]);
    fake.control.signal = fake.signal.mockImplementation(() => {});
    const outcome = stopStintProcesses(attempt, false, fake.control).catch((error) => error);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await outcome).toBeInstanceOf(Error);
    expect(fake.signal.mock.calls).toEqual([
      [-20, "SIGSTOP"],
      [-20, "SIGKILL"],
    ]);
  } finally {
    vi.useRealTimers();
  }
});

test("tool descendants in separate process groups are stopped by verified ancestry before replacement", async () => {
  const fake = processes([
    adapter,
    { pid: 21, parent: 20, group: 21, identity: "detached-tool", command: "tool" },
    { pid: 22, parent: 21, group: 22, identity: "nested-tool", command: "nested" },
    { pid: 30, group: 30, identity: "editor", command: "unrelated" },
  ]);
  await stopStintProcesses(attempt, false, fake.control);
  expect([...fake.table.keys()]).toEqual([30]);
});

test("a detached parent reused during cleanup never authorizes signalling its unrelated new children", async () => {
  const fake = processes([
    adapter,
    { pid: 21, parent: 20, group: 21, identity: "tool-start", command: "tool" },
  ]);
  const signal = fake.control.signal;
  fake.control.signal = (pid, value) => {
    signal(pid, value);
    if (pid === 21 && value === "SIGSTOP") {
      fake.table.set(21, { pid: 21, group: 90, identity: "reused-parent", command: "editor" });
      fake.table.set(22, {
        pid: 22,
        parent: 21,
        group: 90,
        identity: "unrelated-child",
        command: "editor-child",
      });
    }
  };
  await expect(stopStintProcesses(attempt, false, fake.control)).rejects.toThrow(
    /No checkpoint or replacement/,
  );
  expect(fake.signal.mock.calls.some(([pid]) => pid === 22)).toBe(false);
});

test.each([
  ["already observed", true],
  ["already observed", false],
  ["delivered after transport closure", true],
  ["delivered after transport closure", false],
] as const)(
  "an unstarted owned adapter exit %s permits cleanup with no writers (PID/group present: %s)",
  async (timing, present) => {
    const fake = processes([{ pid: 30, group: 30, identity: "editor", command: "unrelated" }]);
    // kill(0) can still see the exited leader/group while ps omits its zombie row.
    fake.control.exists = () => present;
    let observeExit: () => void = () => {};
    const exited = new Promise<void>((resolve) => {
      observeExit = resolve;
    });
    if (timing === "already observed") observeExit();
    else queueMicrotask(observeExit);
    await expect(stopStintProcesses(attempt, true, fake.control, exited)).resolves.toBeUndefined();
    expect(fake.signal).not.toHaveBeenCalled();
    expect([...fake.table.keys()]).toEqual([30]);
  },
);

test("observing this server's adapter exit does not release a surviving orphan tool", async () => {
  const fake = processes([{ pid: 21, group: 20, identity: "surviving-tool", command: "tool" }]);
  await expect(stopStintProcesses(attempt, true, fake.control, Promise.resolve())).rejects.toThrow(
    /No checkpoint or replacement/,
  );
  expect(fake.signal).not.toHaveBeenCalled();
});

test("an observed exit cannot forget a detached writer seen before its parent exited", async () => {
  const fake = processes([
    adapter,
    { pid: 21, parent: 20, group: 21, identity: "detached-tool", command: "tool" },
  ]);
  let observeExit: () => void = () => {};
  const exited = new Promise<void>((resolve) => {
    observeExit = resolve;
  });
  let reads = 0;
  const read = fake.control.read;
  fake.control.read = () => {
    if (++reads === 2) {
      fake.table.delete(20);
      fake.table.set(21, {
        pid: 21,
        parent: 1,
        group: 21,
        identity: "detached-tool",
        command: "tool",
      });
      observeExit();
    }
    return read();
  };
  await expect(stopStintProcesses(attempt, true, fake.control, exited)).rejects.toThrow(
    /No checkpoint or replacement/,
  );
  expect(fake.signal).not.toHaveBeenCalled();
});

test("a missing leader without a delivered local exit stays blocked within the cleanup budget", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  try {
    const fake = processes([]);
    fake.control.exists = () => true;
    const result = stopStintProcesses(
      attempt,
      true,
      fake.control,
      new Promise<void>(() => {}),
    ).catch((error) => error);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBeInstanceOf(Error);
    expect(fake.signal).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test("observing a local exit cannot replace unavailable native writer inspection", async () => {
  const fake = processes([]);
  fake.control.exists = () => true;
  fake.control.read = () => {
    throw new Error("Native inspection unavailable");
  };
  await expect(stopStintProcesses(attempt, true, fake.control, Promise.resolve())).rejects.toThrow(
    /No checkpoint or replacement/,
  );
  expect(fake.signal).not.toHaveBeenCalled();
});

test.each([false, true])(
  "a vanished adapter/group cannot certify a detached writer gone (local owner: %s)",
  async (local) => {
    const fake = processes([
      { pid: 21, parent: 1, group: 21, identity: "detached-tool", command: "tool" },
    ]);
    const read = vi.spyOn(fake.control, "read");
    await expect(stopStintProcesses(attempt, local, fake.control)).rejects.toThrow(
      /No checkpoint or replacement/,
    );
    expect(read).toHaveBeenCalled();
    expect(fake.signal).not.toHaveBeenCalled();
    expect(fake.table.has(21)).toBe(true);
  },
);

test.each(["gone", "reused"] as const)(
  "startup certifies a %s owner/adapter only after inspecting the worktree for other writers",
  async (state) => {
    const fake = processes([
      { pid: 30, group: 30, identity: "editor", command: "unrelated", uid: process.getuid?.() },
      ...(state === "reused"
        ? [
            {
              pid: 10,
              group: 10,
              identity: "new-owner",
              command: "editor",
              uid: process.getuid?.(),
            },
            {
              pid: 20,
              group: 90,
              identity: "new-adapter",
              command: "editor",
              uid: process.getuid?.(),
            },
          ]
        : []),
    ]);
    const directories = vi.fn(
      (pids: readonly number[]) => new Map(pids.map((pid) => [pid, "/outside"])),
    );
    Object.assign(fake.control, { workingDirectories: directories });
    await expect(
      stopStintProcesses(
        {
          ...attempt,
          identity: `${process.getuid?.()}:adapter-start`,
          owner: { ...attempt.owner, identity: `${process.getuid?.()}:owner-start` },
        },
        false,
        fake.control,
        undefined,
        process.cwd(),
      ),
    ).resolves.toBeUndefined();
    expect(directories).toHaveBeenCalled();
    expect(fake.signal).not.toHaveBeenCalled();
    expect(fake.table.has(30)).toBe(true);
  },
);

test.each([
  "cwd",
  "marker",
  "group",
  "unreadable-cwd",
  "new-process",
  "reused-during-scan",
  "missing-uid",
  "unknown-uid",
  "live-owner",
  "live-adapter",
  "inspection-error",
  "scan-budget",
] as const)(
  "startup absence proof blocks %s without signalling a possibly unrelated process",
  async (fault) => {
    const uid = process.getuid?.() as number;
    const recorded = {
      ...attempt,
      identity: `${uid}:adapter`,
      owner: { ...attempt.owner, identity: `${uid}:owner` },
    };
    const writer: ProcessIdentity = {
      pid: 21,
      group: 21,
      parent: 1,
      uid,
      identity: `${uid}:tool`,
      command: "tool",
    };
    const fake = processes([writer]);
    if (fault === "marker") writer.command = `tool --attempt=${attempt.marker}`;
    if (fault === "group") writer.group = 20;
    if (fault === "missing-uid") delete writer.uid;
    if (fault === "unknown-uid") writer.uid = Number.NaN;
    if (fault === "live-owner")
      fake.table.set(10, { ...writer, pid: 10, identity: recorded.owner.identity });
    if (fault === "live-adapter")
      fake.table.set(20, { ...writer, pid: 20, identity: recorded.identity });
    fake.control.workingDirectories = () => {
      if (fault === "new-process") fake.table.set(22, { ...writer, pid: 22 });
      if (fault === "reused-during-scan")
        fake.table.set(21, { ...writer, identity: `${uid}:reused` });
      if (fault === "inspection-error") throw new Error("permission denied");
      if (fault === "scan-budget") vi.advanceTimersByTime(1000);
      return fault === "unreadable-cwd"
        ? new Map()
        : new Map([[21, fault === "cwd" ? `${process.cwd()}/subdirectory` : "/outside"]]);
    };
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    try {
      await expect(
        stopStintProcesses(recorded, false, fake.control, undefined, process.cwd()),
      ).rejects.toThrow(/No checkpoint or replacement/);
      expect(fake.signal).not.toHaveBeenCalled();
      expect(fake.table.has(21)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  },
);

test("a stable same-UID process outside the worktree and another UID inside it do not become owned writers", async () => {
  const uid = process.getuid?.() as number;
  const fake = processes([
    { pid: 21, group: 21, uid, identity: `${uid}:editor`, command: "editor" },
    { pid: 22, group: 22, uid: uid + 1, identity: `${uid + 1}:other-user`, command: "other user" },
  ]);
  fake.control.workingDirectories = (pids) => {
    expect(pids).toEqual([21]);
    return new Map([[21, `${process.cwd()}-sibling`]]);
  };
  await expect(
    stopStintProcesses(
      {
        ...attempt,
        identity: `${uid}:adapter`,
        owner: { ...attempt.owner, identity: `${uid}:owner` },
      },
      false,
      fake.control,
      undefined,
      process.cwd(),
    ),
  ).resolves.toBeUndefined();
  expect(fake.signal).not.toHaveBeenCalled();
});

test.each([
  { cwd: "unrelated/removed-directory", blocked: false },
  { cwd: "unrelated/removed-directory (deleted)", blocked: false },
  { cwd: "canonical/deleted-subdirectory", blocked: true },
  { cwd: "canonical/deleted-subdirectory (deleted)", blocked: true },
  { cwd: "canonical (deleted)", blocked: true },
  { cwd: "recorded/deleted-subdirectory", blocked: true },
  { cwd: "recorded (deleted)", blocked: true },
  { cwd: "recorded/../unrelated/removed-directory", blocked: false },
  { cwd: "unrelated/removed-directory", blocked: false, missing: true },
  { cwd: "recorded/deleted-subdirectory (deleted)", blocked: true, missing: true },
])(
  "deleted cwd $cwd (missing worktree: $missing) is matched lexically against recorded and canonical paths",
  async ({ cwd, blocked, missing }) => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), "stintwork-deleted-cwd-")));
    const canonical = join(parent, "canonical");
    const recorded = join(parent, "recorded");
    mkdirSync(canonical);
    symlinkSync(canonical, recorded, "dir");
    if (missing) rmSync(canonical, { recursive: true });
    const uid = process.getuid?.() as number;
    const fake = processes([{ pid: 21, group: 21, uid, identity: `${uid}:tool`, command: "tool" }]);
    fake.control.workingDirectories = () => new Map([[21, `${parent}/${cwd}`]]);
    try {
      const result = stopStintProcesses(
        {
          ...attempt,
          identity: `${uid}:adapter`,
          owner: { ...attempt.owner, identity: `${uid}:owner` },
        },
        false,
        fake.control,
        undefined,
        recorded,
      );
      if (blocked) await expect(result).rejects.toThrow("Live possible writer: PID 21");
      else await expect(result).resolves.toBeUndefined();
      expect(fake.signal).not.toHaveBeenCalled();
      expect(fake.table.has(21)).toBe(true);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  },
);

test("startup absence proof ignores zombie rows even with old ownership links and no cwd", async () => {
  const uid = process.getuid?.() as number;
  const recorded = {
    ...attempt,
    identity: `${uid}:adapter`,
    owner: { ...attempt.owner, identity: `${uid}:owner` },
  };
  const fake = processes([
    { pid: 10, group: 10, uid, identity: recorded.owner.identity, command: "(server)", state: "Z" },
    { pid: 20, group: 20, uid, identity: recorded.identity, command: "(adapter)", state: "Z+" },
    { pid: 21, group: 20, uid, identity: `${uid}:tool`, command: "stintwork-attempt", state: "Z" },
  ]);
  const cwd = vi.spyOn(fake.control, "workingDirectories");
  await expect(
    stopStintProcesses(recorded, false, fake.control, undefined, process.cwd()),
  ).resolves.toBeUndefined();
  expect(cwd).toHaveBeenCalledWith([]);
  expect(fake.signal).not.toHaveBeenCalled();
});

test.each(["gone", "reused", "zombie", "live", "read-error", "budget", "old-writer"] as const)(
  "an unreadable cwd gets a final identity check before blocking: %s",
  async (outcome) => {
    const uid = process.getuid?.() as number;
    const row = { pid: 21, group: 21, uid, identity: `${uid}:git`, command: "(git)" };
    const fake = processes([row]);
    let afterCwd = 0;
    let inspected = false;
    const read = fake.control.read;
    fake.control.workingDirectories = () => {
      inspected = true;
      return new Map();
    };
    fake.control.read = () => {
      // Keep the process in the post-lsof snapshot; force the exit/reuse only on re-inspection.
      if (inspected && ++afterCwd === 2) {
        if (outcome === "gone") fake.table.delete(21);
        if (outcome === "reused") fake.table.set(21, { ...row, identity: `${uid}:replacement` });
        if (outcome === "zombie") fake.table.set(21, { ...row, state: "Z" });
        if (outcome === "old-writer") {
          fake.table.delete(21);
          fake.table.set(22, { ...row, pid: 22, command: "stintwork-attempt" });
        }
        if (outcome === "read-error") throw new Error("Native inspection unavailable");
        if (outcome === "budget") vi.advanceTimersByTime(1000);
      }
      return read();
    };
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const result = stopStintProcesses(
        {
          ...attempt,
          identity: `${uid}:adapter`,
          owner: { ...attempt.owner, identity: `${uid}:owner` },
        },
        false,
        fake.control,
        undefined,
        process.cwd(),
      );
      if (["live", "read-error", "budget", "old-writer"].includes(outcome))
        await expect(result).rejects.toThrow(/No checkpoint or replacement/);
      else await expect(result).resolves.toBeUndefined();
      expect(afterCwd).toBe(2);
      expect(fake.signal).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  },
);

test.each([
  "stable-tree",
  "new-child",
  "root-reused",
  "parent-reused",
  "reparented-child",
  "foreign-git",
  "missing-root",
] as const)(
  "startup excludes only identity-verified current-server ancestry: %s",
  async (interleaving) => {
    const uid = process.getuid?.() as number;
    const server = {
      pid: process.pid,
      parent: 1,
      group: process.pid,
      uid,
      identity: `${uid}:current-server`,
      command: "server",
    };
    const parent = {
      pid: 31,
      parent: server.pid,
      group: 31,
      uid,
      identity: `${uid}:current-child`,
      command: "arbitrary child",
    };
    const child = {
      pid: 32,
      parent: parent.pid,
      group: 32,
      uid,
      identity: `${uid}:current-grandchild`,
      command: "(git)",
    };
    const fake = processes([server, ...(interleaving === "new-child" ? [] : [parent, child])]);
    if (interleaving === "missing-root") fake.table.delete(server.pid);
    if (interleaving === "foreign-git")
      fake.table.set(21, { ...child, pid: 21, parent: 1, identity: `${uid}:foreign` });
    const cwd = vi.fn(() => {
      if (interleaving === "new-child") {
        fake.table.set(parent.pid, parent);
        fake.table.set(child.pid, child);
      }
      if (interleaving === "root-reused")
        fake.table.set(server.pid, { ...server, identity: `${uid}:reused-server` });
      if (interleaving === "parent-reused")
        fake.table.set(parent.pid, { ...parent, identity: `${uid}:reused-parent` });
      if (interleaving === "reparented-child") fake.table.set(child.pid, { ...child, parent: 1 });
      return new Map<number, string>();
    });
    fake.control.workingDirectories = cwd;
    const result = stopStintProcesses(
      {
        ...attempt,
        identity: `${uid}:adapter`,
        owner: { ...attempt.owner, identity: `${uid}:old-server` },
      },
      false,
      fake.control,
      undefined,
      process.cwd(),
    );
    if (["stable-tree", "new-child"].includes(interleaving))
      await expect(result).resolves.toBeUndefined();
    else await expect(result).rejects.toThrow(/No checkpoint or replacement/);
    // No cwd is needed for our proven tree, regardless of commands or process groups.
    expect(cwd).toHaveBeenCalledWith(
      interleaving === "foreign-git" ? [21] : interleaving === "missing-root" ? [31, 32] : [],
    );
    expect(fake.signal).not.toHaveBeenCalled();
    expect(fake.table.has(child.pid)).toBe(true);
  },
);

test.each([
  { start: "Mon Oct 26 11:08:53 2026", older: true },
  { start: "Mon Oct 26 11:08:54 2026", older: true },
  { start: "Mon Oct 26 11:08:55 2026", older: false },
  { start: "Mon Oct 26 11:08:56 2026", older: false },
  { start: "Sun Oct 25 23:59:59 2026", older: true },
  { start: "Wed Dec 31 23:59:59 2025", older: true },
  { start: "Mon Oct  5 11:08:54 2026", older: true },
  { start: "unparseable", older: false },
  { start: "Mon Oct 26 25:00:00 2026", older: false },
  { start: "Mon Feb 30 11:08:54 2026", older: false },
  { start: "Tue Oct 26 11:08:54 2026", older: false },
  { start: "Mon Oct 26 11:08:54 2026 trailing", older: false },
  { start: "2026-10-25T11:08:54Z", older: false },
  { start: "Mon Oct 26 11:08:54 2026", attemptStart: "unknown", older: false },
  { start: "Mon Oct 26 11:08:54 2026", wrongUid: true, older: false },
])(
  "worktree cwd start $start (attempt: $attemptStart, wrong UID: $wrongUid) predates the attempt only when proven: $older",
  async ({ start, attemptStart = "Mon Oct 26 11:08:55 2026", wrongUid, older }) => {
    const uid = process.getuid?.() as number;
    const row = {
      pid: 21,
      group: 21,
      uid,
      identity: `${wrongUid ? uid + 1 : uid}:${start}`,
      command: "arbitrary terminal/editor/watcher",
    };
    const fake = processes([row]);
    const directory = `${process.cwd()}/subdirectory (deleted)`;
    fake.control.workingDirectories = () => new Map([[row.pid, directory]]);
    const result = stopStintProcesses(
      {
        ...attempt,
        identity: `${uid}:${attemptStart}`,
        owner: { ...attempt.owner, identity: `${uid}:old-server` },
      },
      false,
      fake.control,
      undefined,
      process.cwd(),
    );
    if (older) await expect(result).resolves.toBeUndefined();
    else
      await expect(result).rejects.toThrow(
        `Live possible writer: PID 21 (${row.command}), cwd ${directory}`,
      );
    expect(fake.signal).not.toHaveBeenCalled();
    expect(fake.table.get(21)).toBe(row);
  },
);

test.each(["cwd", "group", "marker", "unreadable-cwd"] as const)(
  "ownership guidance bounds a long suspect command without losing PID/cwd: %s",
  async (link) => {
    const uid = process.getuid?.() as number;
    const command = `writer ${"x".repeat(4000)}${link === "marker" ? " --attempt=stintwork-attempt" : ""}`;
    const fake = processes([
      {
        pid: 21,
        group: link === "group" ? 20 : 21,
        uid,
        identity: `${uid}:Mon Oct 26 11:08:56 2026`,
        command,
      },
    ]);
    const directory = `${process.cwd()}/subdirectory`;
    fake.control.workingDirectories = () =>
      link === "unreadable-cwd" ? new Map() : new Map([[21, directory]]);
    const error = await stopStintProcesses(
      {
        ...attempt,
        identity: `${uid}:Mon Oct 26 11:08:55 2026`,
        owner: { ...attempt.owner, identity: `${uid}:old-server` },
      },
      false,
      fake.control,
      undefined,
      process.cwd(),
    ).catch((error) => error);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(`21 (${command.slice(0, 119)}…)`);
    expect(error.message).not.toContain(command);
    expect(error.message.length).toBeLessThan(800 + directory.length);
    if (link === "cwd") expect(error.message).toContain(`cwd ${directory}`);
    expect(fake.signal).not.toHaveBeenCalled();
  },
);

test("a repeated daylight-saving hour cannot prove which process started first", async () => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  try {
    const uid = process.getuid?.() as number;
    // 01:15 in the second occurrence is later than 01:45 in the first occurrence.
    const fake = processes([
      { pid: 21, group: 21, uid, identity: `${uid}:Sun Nov  1 01:15:00 2026`, command: "writer" },
    ]);
    fake.control.workingDirectories = () => new Map([[21, process.cwd()]]);
    await expect(
      stopStintProcesses(
        {
          ...attempt,
          identity: `${uid}:Sun Nov  1 01:45:00 2026`,
          owner: { ...attempt.owner, identity: `${uid}:old-server` },
        },
        false,
        fake.control,
        undefined,
        process.cwd(),
      ),
    ).rejects.toThrow("Live possible writer: PID 21");
    expect(fake.signal).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});

test.each(["reused", "group", "marker", "later-child"] as const)(
  "a pre-attempt cwd process cannot hide stronger writer evidence or later children: %s",
  async (link) => {
    const uid = process.getuid?.() as number;
    const old = `${uid}:Mon Oct 26 11:08:54 2026`;
    const row = {
      pid: 21,
      group: link === "group" ? 20 : 21,
      uid,
      identity: old,
      command: link === "marker" ? "stintwork-attempt" : "terminal",
    };
    const fake = processes([row]);
    if (link === "later-child")
      fake.table.set(22, {
        ...row,
        pid: 22,
        parent: 21,
        group: 22,
        identity: `${uid}:Mon Oct 26 11:08:56 2026`,
        command: "later child",
      });
    fake.control.workingDirectories = (pids) => {
      if (link === "reused")
        fake.table.set(21, { ...row, identity: `${uid}:Mon Oct 26 11:08:53 2026` });
      return new Map(pids.map((pid) => [pid, process.cwd()]));
    };
    await expect(
      stopStintProcesses(
        {
          ...attempt,
          identity: `${uid}:Mon Oct 26 11:08:55 2026`,
          owner: { ...attempt.owner, identity: `${uid}:old-server` },
        },
        false,
        fake.control,
        undefined,
        process.cwd(),
      ),
    ).rejects.toThrow(
      link === "later-child" ? "Live possible writer: PID 22" : /No checkpoint or replacement/,
    );
    expect(fake.signal).not.toHaveBeenCalled();
  },
);
