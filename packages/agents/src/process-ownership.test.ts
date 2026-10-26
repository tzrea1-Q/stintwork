// SPDX-License-Identifier: Apache-2.0
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
      /Stop the old processes/,
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
    /Stop the old processes/,
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
    /Stop the old processes/,
  );
  expect(fake.signal.mock.calls.some(([pid]) => pid === 22)).toBe(false);
});
