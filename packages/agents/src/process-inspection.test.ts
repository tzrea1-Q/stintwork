// SPDX-License-Identifier: Apache-2.0
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { systemProcesses } from "./process-ownership.js";

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
}));
vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  readlinkSync: vi.fn(),
  realpathSync: vi.fn((path) => String(path)),
}));
beforeEach(() => vi.mocked(fs.realpathSync).mockImplementation((path) => String(path)));
afterEach(() => vi.resetAllMocks());

test("Linux inspects each requested proc cwd and distinguishes disappeared processes from permission errors", () => {
  vi.mocked(fs.readlinkSync).mockImplementation((path) => {
    if (path === "/proc/20/cwd") return "/work tree/中文";
    throw Object.assign(new Error("gone"), { code: "ENOENT" });
  });
  expect(systemProcesses.workingDirectories([20, 21], "linux")).toEqual(
    new Map([[20, "/work tree/中文"]]),
  );
  vi.mocked(fs.readlinkSync).mockImplementation(() => {
    throw Object.assign(new Error("denied"), { code: "EACCES" });
  });
  expect(() => systemProcesses.workingDirectories([20], "linux")).toThrow("denied");
});

test("macOS reads cwd records in one bounded lsof call without splitting spaces or NUL-delimited names", () => {
  vi.mocked(childProcess.execFileSync).mockReturnValue(
    "p20\0\nfcwd\0n/work tree/中文\nline\0\np21\0\nfcwd\0n/outside\0\n",
  );
  expect(systemProcesses.workingDirectories([20, 21], "darwin")).toEqual(
    new Map([
      [20, "/work tree/中文\nline"],
      [21, "/outside"],
    ]),
  );
  expect(childProcess.execFileSync).toHaveBeenCalledWith(
    "/usr/sbin/lsof",
    ["-a", "-p", "20,21", "-d", "cwd", "-F0pn"],
    expect.objectContaining({ timeout: 1000 }),
  );
});

test.each(["p20\0\nfcwd\0nrelative\0\n", "unparseable", "p20\0\nfBAD\0n/outside\0\n"])(
  "macOS fails closed on malformed or unavailable cwd records: %s",
  (output) => {
    vi.mocked(childProcess.execFileSync).mockReturnValue(output);
    expect(() => systemProcesses.workingDirectories([20], "darwin")).toThrow();
  },
);

test("macOS tolerates vanished lsof entries but does not hide native inspection failure", () => {
  vi.mocked(childProcess.execFileSync).mockImplementation(() => {
    throw Object.assign(new Error("gone"), { status: 1, stdout: "", stderr: "" });
  });
  expect(systemProcesses.workingDirectories([20], "darwin")).toEqual(new Map());
  vi.mocked(childProcess.execFileSync).mockImplementation(() => {
    throw Object.assign(new Error("inspection denied"), { code: "EPERM" });
  });
  expect(() => systemProcesses.workingDirectories([20], "darwin")).toThrow("inspection denied");
});

test("native process rows retain UID and omit zombies and the observed inspector child", () => {
  const output =
    "20 1 20 501 Mon Oct 26 11:08:55 2026 S adapter\n21 1 21 501 Mon Oct 26 11:08:55 2026 Z+ (git)\n99 1 99 501 Mon Oct 26 11:08:55 2026 R inspector\n";
  vi.mocked(childProcess.execFileSync).mockReturnValue(output);
  vi.mocked(childProcess.spawnSync).mockReturnValue({
    pid: 99,
    status: 0,
    stdout: output,
    stderr: "",
    output: [],
    signal: null,
  });
  expect(systemProcesses.read()).toEqual([
    {
      pid: 20,
      parent: 1,
      group: 20,
      uid: 501,
      identity: "501:Mon Oct 26 11:08:55 2026",
      state: "S",
      command: "adapter",
    },
  ]);
  expect(childProcess.spawnSync).toHaveBeenCalledWith(
    "/bin/ps",
    ["-axo", "pid=,ppid=,pgid=,uid=,lstart=,stat=,command="],
    expect.objectContaining({ timeout: 1000 }),
  );
});

test("unsupported platforms cannot certify cwd inspection", () => {
  expect(() => systemProcesses.workingDirectories([20], "win32")).toThrow();
});

test.each(["linux", "darwin"] as const)(
  "%s preserves deleted cwd paths without requiring the directories to exist",
  (platform) => {
    const outside = "/unrelated/removed-worktree";
    const inside = `/worktree/removed-subdirectory${platform === "linux" ? " (deleted)" : ""}`;
    vi.mocked(fs.realpathSync).mockImplementation(() => {
      throw Object.assign(new Error("Deleted directory"), { code: "ENOENT" });
    });
    vi.mocked(fs.readlinkSync).mockImplementation((path) =>
      path === "/proc/20/cwd" ? outside : inside,
    );
    // lsof status 1 with complete stdout and no stderr is valid on the coordinator's host.
    vi.mocked(childProcess.execFileSync).mockImplementation(() => {
      throw Object.assign(new Error("Partial process selection"), {
        status: 1,
        stderr: "",
        stdout: `p20\0\nfcwd\0n${outside}\0\np21\0\nfcwd\0n${inside}\0\n`,
      });
    });
    expect(systemProcesses.workingDirectories([20, 21], platform)).toEqual(
      new Map([
        [20, outside],
        [21, inside],
      ]),
    );
  },
);

test.each([
  { status: 1, signal: "SIGTERM", stderr: "", code: "ETIMEDOUT" },
  { status: 1, stderr: "", code: "ETIMEDOUT" },
  { status: 1, stderr: "native inspection denied" },
  { status: 2, stderr: "" },
])(
  "macOS inspection failure still blocks even with parseable partial cwd output: %j",
  (failure) => {
    vi.mocked(childProcess.execFileSync).mockImplementation(() => {
      throw Object.assign(new Error("Native command failed"), {
        stdout: "p20\0\nfcwd\0n/unrelated/deleted\0\n",
        ...failure,
      });
    });
    expect(() => systemProcesses.workingDirectories([20], "darwin")).toThrow(
      "Native command failed",
    );
  },
);

test("native commands use the caller's remaining orphan inspection budget", () => {
  vi.mocked(childProcess.spawnSync).mockReturnValue({
    pid: 99,
    status: 0,
    stdout: "20 1 20 501 Mon Oct 26 11:08:55 2026 S adapter\n",
    stderr: "",
    output: [],
    signal: null,
  });
  systemProcesses.read(250);
  expect(childProcess.spawnSync).toHaveBeenCalledWith(
    "/bin/ps",
    expect.any(Array),
    expect.objectContaining({ timeout: 250 }),
  );
  vi.mocked(childProcess.execFileSync).mockReturnValue("p20\0\nfcwd\0n/outside\0\n");
  systemProcesses.workingDirectories([20], "darwin", 125);
  expect(childProcess.execFileSync).toHaveBeenCalledWith(
    "/usr/sbin/lsof",
    expect.any(Array),
    expect.objectContaining({ timeout: 125 }),
  );
});
