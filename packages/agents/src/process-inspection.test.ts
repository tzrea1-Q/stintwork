// SPDX-License-Identifier: Apache-2.0
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
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
afterEach(() => vi.clearAllMocks());

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
    "20 1 20 501 Mon Oct 26 11:08:55 2026 S adapter\n21 1 21 501 Mon Oct 26 11:08:55 2026 Z zombie\n99 1 99 501 Mon Oct 26 11:08:55 2026 R inspector\n";
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
});

test("unsupported platforms cannot certify cwd inspection", () => {
  expect(() => systemProcesses.workingDirectories([20], "win32")).toThrow();
});
