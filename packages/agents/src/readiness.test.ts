// SPDX-License-Identifier: Apache-2.0
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import { afterEach, expect, test, vi } from "vitest";
import { createAgentLauncher, ProcessOwnershipError, type PreparedAgent } from "./index.js";
import { systemProcesses } from "./process-ownership.js";
import { fakeAgentProfiles } from "./testing.js";
import { toAcpReadable } from "./stdio.js";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function waitingAgent(
  agent: keyof typeof fakeAgentProfiles,
  phase: "initialize" | "newSession" | "loadSession" | "setSessionMode" = "initialize",
  options: {
    platform?: NodeJS.Platform;
    prepared?: PreparedAgent;
    onCleanup?: (attemptId: string) => void;
    processGroup?: boolean;
  } = {},
) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const profile = fakeAgentProfiles[agent];
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    pid: options.prepared ? 20 : undefined,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    kill: vi.fn(() => {
      queueMicrotask(() => {
        child.signalCode = "SIGTERM";
        child.emit("exit", 0, "SIGTERM");
      });
      return true;
    }),
  });
  let notifyEntered: () => void = () => {};
  let release: () => void = () => {};
  const entered = new Promise<void>((resolve) => {
    notifyEntered = resolve;
  });
  const proceed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prompt = vi.fn(async () => ({ stopReason: "end_turn" as const }));
  async function wait(current: typeof phase) {
    if (current !== phase) return;
    notifyEntered();
    await proceed;
  }
  new AgentSideConnection(
    () => ({
      async initialize() {
        await wait("initialize");
        return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: { loadSession: true } };
      },
      async newSession() {
        await wait("newSession");
        return {
          sessionId: "fake-stint",
          modes: {
            currentModeId: profile.capabilities.defaultMode ?? "default",
            availableModes: profile.capabilities.modes.map((id) => ({ id, name: id })),
          },
        };
      },
      async loadSession() {
        await wait("loadSession");
        return {
          modes: {
            currentModeId: "agent",
            availableModes: [{ id: "workspace-write", name: "Write" }],
          },
        };
      },
      async setSessionMode() {
        await wait("setSessionMode");
        return {};
      },
      async authenticate() {
        throw new Error("Unexpected authentication request.");
      },
      async cancel() {},
      prompt,
    }),
    ndJsonStream(Writable.toWeb(child.stdout), toAcpReadable(child.stdin)),
  );
  const table = new Map<number, ReturnType<typeof systemProcesses.read>[number]>([
    [20, { pid: 20, group: 20, identity: "adapter-start", command: "adapter" }],
    [
      21,
      {
        pid: 21,
        parent: options.platform === "win32" || options.processGroup === false ? 1 : 20,
        group: 21,
        identity: "tool-start",
        command: "tool",
      },
    ],
  ]);
  const signal = vi.fn((pid: number, value: NodeJS.Signals) => {
    for (const row of table.values())
      if (pid === row.pid || -pid === row.group) {
        if (value === "SIGSTOP") row.state = "T";
        else table.delete(row.pid);
      }
  });
  if (options.prepared) {
    vi.spyOn(systemProcesses, "read").mockImplementation(() => [...table.values()]);
    vi.spyOn(systemProcesses, "exists").mockImplementation((pid) => table.has(Math.abs(pid)));
    vi.spyOn(systemProcesses, "signal").mockImplementation(signal);
  }
  if (options.prepared)
    vi.mocked(childProcess.spawn).mockReturnValue(
      child as unknown as ChildProcessWithoutNullStreams,
    );
  const stint = createAgentLauncher(
    () => child as unknown as ChildProcessWithoutNullStreams,
    profile,
    process.env,
    options.platform,
  )({
    agent,
    cwd: process.cwd(),
    prompt: "Work",
    onEvent: () => {},
    ...(options.prepared ? { preparedAgent: options.prepared } : {}),
    onCleanup: options.onCleanup,
    onProcess(attempt) {
      if (options.processGroup === false) delete attempt.processGroup;
      const row = table.get(attempt.pid);
      if (row) row.command = attempt.marker ?? "adapter";
    },
    ...(phase === "loadSession"
      ? { resume: { sessionId: "saved", progress: { phase: "work" as const } } }
      : {}),
  });
  const outcome = stint.done.then(
    (result) => result,
    (error: Error) => error,
  );
  return { stint, entered, release, outcome, child, prompt, table, signal };
}

test.each(["codex", "claude", "grok"] as const)(
  "%s can become ready after 15 seconds but before the 60-second deadline",
  async (agent) => {
    const waiting = waitingAgent(agent);
    await waiting.entered;
    await vi.advanceTimersByTimeAsync(59_999);
    waiting.release();
    await waiting.stint.ready;
    expect(await waiting.outcome).toEqual({ stopReason: "end_turn" });
    expect(waiting.prompt).toHaveBeenCalledOnce();
    expect(waiting.child.kill).toHaveBeenCalledWith("SIGTERM");
  },
);

test.each(["codex", "claude", "grok"] as const)(
  "%s times out at 60 seconds with actionable busy-machine guidance",
  async (agent) => {
    const waiting = waitingAgent(agent);
    let ended = false;
    void waiting.outcome.then(() => {
      ended = true;
    });
    await waiting.entered;
    await vi.advanceTimersByTimeAsync(59_999);
    expect(ended).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const message =
      "The agent took longer than 60 seconds to start; the machine may be busy. Try again.";
    expect(await waiting.outcome).toEqual(new Error(message));
    await expect(waiting.stint.ready).rejects.toThrow(message);
    expect(waiting.prompt).not.toHaveBeenCalled();
    expect(waiting.child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(vi.getTimerCount()).toBe(0);
  },
);

test.each(["initialize", "newSession", "loadSession", "setSessionMode"] as const)(
  "cancellation interrupts the readiness wait during %s",
  async (phase) => {
    const waiting = waitingAgent("codex", phase);
    await waiting.entered;
    await vi.advanceTimersByTimeAsync(20_000);
    await waiting.stint.cancel();
    expect(await waiting.outcome).toEqual({ stopReason: "cancelled" });
    await expect(waiting.stint.ready).rejects.toThrow("Stint ended before Codex became ready.");
    expect(waiting.prompt).not.toHaveBeenCalled();
    expect(waiting.child.kill).toHaveBeenCalledWith("SIGTERM");
    await vi.advanceTimersByTimeAsync(100);
    expect(vi.getTimerCount()).toBe(0);
  },
);

test.each(["initialize", "loadSession", "setSessionMode"] as const)(
  "suspension interrupts %s without a prompt and ignores late setup replies",
  async (phase) => {
    const waiting = waitingAgent("codex", phase);
    await waiting.entered;
    if (!waiting.stint.suspend) throw new Error("Expected suspension support");
    await waiting.stint.suspend();
    expect(await waiting.outcome).toEqual({ stopReason: "cancelled" });
    waiting.release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(waiting.prompt).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  },
);

const prepared: PreparedAgent = {
  agent: "codex",
  source: "installed",
  reason: "compatible",
  executable: { path: "/fake/codex", version: "1.0.0", identity: "cli-start" },
  adapterEntry: "/fake/adapter.mjs",
  adapterVersion: "1.0.0",
  cacheKey: "a".repeat(64),
  lockDigest: "b".repeat(64),
};

test.each(
  (["win32", "missing-group"] as const).flatMap((capability) =>
    (["finish", "failure", "Stop", "suspend"] as const).map((ending) => ({ capability, ending })),
  ),
)(
  "$capability/$ending cannot certify cleanup beside a surviving writer",
  async ({ capability, ending }) => {
    const cleanup = vi.fn();
    const waiting = waitingAgent("codex", "loadSession", {
      prepared,
      platform: capability === "win32" ? "win32" : "linux",
      ...(capability === "missing-group" ? { processGroup: false } : {}),
      onCleanup: cleanup,
    });
    await waiting.entered;
    if (ending === "suspend")
      await expect(waiting.stint.suspend?.()).rejects.toThrow(ProcessOwnershipError);
    else if (ending === "Stop") await waiting.stint.cancel();
    else {
      if (ending === "failure")
        waiting.prompt.mockRejectedValueOnce(new Error("Controlled failure"));
      waiting.release();
    }
    expect(await waiting.outcome).toBeInstanceOf(ProcessOwnershipError);
    expect(waiting.child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(waiting.signal).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    expect(waiting.table.get(21)?.identity).toBe("tool-start");
    waiting.release();
    await vi.advanceTimersByTimeAsync(1000);
    if (ending === "Stop" || ending === "suspend") expect(waiting.prompt).not.toHaveBeenCalled();
  },
);

test.each(
  (["linux", "darwin"] as const).flatMap((platform) =>
    (["finish", "failure", "Stop", "suspend"] as const).map((ending) => ({ platform, ending })),
  ),
)(
  "$platform/$ending reports verified cleanup only after owned tools and the child have exited",
  async ({ platform, ending }) => {
    const cleanup = vi.fn(() => {
      expect(waiting.table.size).toBe(0);
      expect(waiting.child.signalCode).toBe("SIGTERM");
    });
    const waiting = waitingAgent("codex", "loadSession", {
      prepared,
      platform,
      onCleanup: cleanup,
    });
    await waiting.entered;
    if (ending === "suspend") await waiting.stint.suspend?.();
    else if (ending === "Stop") await waiting.stint.cancel();
    else {
      if (ending === "failure")
        waiting.prompt.mockRejectedValueOnce(new Error("Controlled work failure"));
      waiting.release();
    }
    const result = await waiting.outcome;
    if (ending === "failure") {
      expect(result).toBeInstanceOf(Error);
      expect(result).not.toBeInstanceOf(ProcessOwnershipError);
    } else expect(result).toEqual({ stopReason: ending === "finish" ? "end_turn" : "cancelled" });
    expect(cleanup).toHaveBeenCalledWith(expect.any(String));
    expect(cleanup).toHaveBeenCalledOnce();
    waiting.release();
  },
);
