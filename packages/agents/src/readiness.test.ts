// SPDX-License-Identifier: Apache-2.0
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import { afterEach, expect, test, vi } from "vitest";
import { createAgentLauncher } from "./index.js";
import { fakeAgentProfiles } from "./testing.js";
import { toAcpReadable } from "./stdio.js";

afterEach(() => vi.useRealTimers());

function waitingAgent(
  agent: keyof typeof fakeAgentProfiles,
  phase: "initialize" | "newSession" | "loadSession" | "setSessionMode" = "initialize",
) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const profile = fakeAgentProfiles[agent];
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit("exit", 0, "SIGTERM"));
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
  const stint = createAgentLauncher(
    () => child as unknown as ChildProcessWithoutNullStreams,
    profile,
  )({
    agent,
    cwd: process.cwd(),
    prompt: "Work",
    onEvent: () => {},
    ...(phase === "loadSession"
      ? { resume: { sessionId: "saved", progress: { phase: "work" as const } } }
      : {}),
  });
  const outcome = stint.done.then(
    (result) => result,
    (error: Error) => error,
  );
  return { stint, entered, release, outcome, child, prompt };
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
