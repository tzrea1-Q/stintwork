// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { StintLogEvent } from "@stintwork/core";
import { afterEach, expect, test, vi } from "vitest";
import { createAgentRegistry, describeAgents, startAgentStint } from "./index.js";
import { toAcpReadable } from "./stdio.js";
import { createFakeAgentLauncher, fakeAgentProfiles, sourceNodeArgs } from "./testing.js";

const fixtures: string[] = [];
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "stintwork-profiles-"));
  fixtures.push(cwd);
  return cwd;
}
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((cwd) => rm(cwd, { recursive: true, force: true })));
  vi.unstubAllEnvs();
});

test("the production registry offers Codex, Claude Code and Grok without private launch or detection hooks", () => {
  const descriptions = describeAgents(createAgentRegistry());
  expect(descriptions).toMatchObject([
    fakeAgentProfiles.codex,
    fakeAgentProfiles.claude,
    fakeAgentProfiles.grok,
  ]);
  for (const profile of descriptions) {
    expect(profile).not.toHaveProperty("launch");
    expect(profile).not.toHaveProperty("prepare");
    expect(profile).not.toHaveProperty("verifyRecovery");
    expect(profile).not.toHaveProperty("detectAvailability");
  }
  expect(descriptions[0].capabilities.defaultMode).toBe("workspace-write");
});

test.each([undefined, "1"])("Codex detection respects the skip flag %s", (skip) => {
  vi.stubEnv("STINTWORK_SKIP_AGENT_DETECTION", skip);
  const agent = createAgentRegistry().get("codex");
  expect(agent?.launch).toBe(startAgentStint);
  if (skip === "1") expect(agent).not.toHaveProperty("detectAvailability");
  else expect(agent?.detectAvailability).toBeTypeOf("function");
});

test("registries reject ambiguous or empty agent identities", () => {
  const agent = { ...fakeAgentProfiles.codex, launch: createFakeAgentLauncher([]) };
  expect(() => createAgentRegistry([agent, agent])).toThrow("already registered");
  for (const id of ["", " codex", "codex "])
    expect(() => createAgentRegistry([{ ...agent, id }])).toThrow("nonempty id");
});

const contracts = [
  {
    id: "codex",
    modes: ["read-only", "workspace-write", "agent", "agent-full-access"],
    defaultMode: "workspace-write",
    additionalDirectories: true,
    configOptions: [],
  },
  {
    id: "claude",
    modes: ["default", "acceptEdits", "plan", "auto", "bypassPermissions"],
    defaultMode: "default",
    additionalDirectories: true,
    configOptions: [],
  },
  {
    id: "grok",
    modes: [],
    defaultMode: null,
    additionalDirectories: false,
    configOptions: ["model", "reasoning_effort"],
  },
] as const;

test.each(contracts)(
  "fake $id advertises its modes and capabilities over ACP",
  async (contract) => {
    const cwd = await fixture();
    const child = spawn(
      process.execPath,
      sourceNodeArgs(fileURLToPath(new URL("./fake-agent.ts", import.meta.url))),
      {
        cwd,
        stdio: "pipe",
        env: { ...process.env, STINTWORK_FAKE_OPTIONS: JSON.stringify({ profile: contract.id }) },
      },
    );
    const closed = new Promise<void>((resolveClose) => child.once("exit", () => resolveClose()));
    child.stderr.resume();
    const connection = new ClientSideConnection(
      () => ({
        async sessionUpdate() {},
        async requestPermission() {
          return { outcome: { outcome: "cancelled" } };
        },
      }),
      ndJsonStream(Writable.toWeb(child.stdin), toAcpReadable(child.stdout)),
    );
    try {
      const initialized = await connection.initialize({ protocolVersion: PROTOCOL_VERSION });
      expect(
        initialized.agentCapabilities?.sessionCapabilities?.additionalDirectories != null,
      ).toBe(contract.additionalDirectories);
      const opened = await connection.newSession({ cwd, mcpServers: [] });
      expect(opened.modes?.availableModes.map(({ id }) => id) ?? []).toEqual(contract.modes);
      expect(opened.modes?.currentModeId ?? null).toBe(contract.defaultMode);
      expect(opened.configOptions?.map(({ id }) => id) ?? []).toEqual(contract.configOptions);
      for (const modeId of contract.modes)
        await connection.setSessionMode({ sessionId: opened.sessionId, modeId });
      await expect(
        connection.setSessionMode({ sessionId: opened.sessionId, modeId: "unoffered" }),
      ).rejects.toThrow();
    } finally {
      child.kill("SIGTERM");
      await closed;
      child.stdin.destroy();
      child.stdout.destroy();
    }
  },
);

test.each([
  {
    profile: "codex",
    decline: "cancel",
    stopReason: "cancelled",
    options: [
      { optionId: "allow_once", kind: "allow_once" },
      { optionId: "allow_always", kind: "allow_always" },
      { optionId: "cancel", kind: "reject_once" },
    ],
  },
  {
    profile: "claude",
    decline: "reject",
    stopReason: "end_turn",
    options: [
      { name: "Yes", kind: "allow_once" },
      { name: "No", kind: "reject_once" },
    ],
  },
] as const)(
  "fake $profile offers its permission shape and reproduces decline behaviour",
  async (contract) => {
    const events: StintLogEvent[] = [];
    const stint = createFakeAgentLauncher(
      [
        {
          type: "permission",
          toolCall: { toolCallId: "command", kind: "execute" },
          expectedOptionId: contract.decline,
        },
        { type: "message", text: "Continued after decline" },
      ],
      [],
      { profile: contract.profile },
    )({
      agent: contract.profile,
      cwd: await fixture(),
      prompt: "Work",
      onEvent: (event) => events.push(event),
      onPermission: async (request) => {
        expect(request.options).toMatchObject(contract.options);
        return { outcome: { outcome: "selected", optionId: contract.decline } };
      },
    });
    expect(await stint.done).toEqual({ stopReason: contract.stopReason });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "permission",
        decision: { outcome: "selected", optionId: contract.decline, kind: "reject_once" },
      }),
    );
    expect(events.some((event) => event.type === "message_delta")).toBe(
      contract.profile === "claude",
    );
  },
);

test.each(contracts)(
  "fake $id accepts work and reports authentication without trying to sign in",
  async ({ id }) => {
    const cwd = await fixture();
    const events: StintLogEvent[] = [];
    const stint = createFakeAgentLauncher([{ type: "message", text: "Working" }], [], {
      profile: id,
    })({
      agent: id,
      cwd,
      prompt: "Work",
      onEvent: (event) => events.push(event),
    });
    await stint.ready;
    expect(await stint.done).toEqual({ stopReason: "end_turn" });
    expect(events).toEqual([{ type: "message_delta", id: "1", text: "Working" }]);
    for (const options of [{ authRequired: true }, { startupError: "Authentication required" }]) {
      const refused = createFakeAgentLauncher([], [], { profile: id, ...options })({
        agent: id,
        cwd,
        prompt: "Work",
        onEvent: () => {},
      });
      await expect(refused.ready).rejects.toThrow("authentication required");
      await expect(refused.done).rejects.toThrow(
        fakeAgentProfiles[id].capabilities.authenticationRequired.loginCommand,
      );
    }
  },
);

test("Grok's unobserved permission behaviour is not invented by the fake profile", () => {
  expect(fakeAgentProfiles.grok.capabilities.permissionOptions).toBeNull();
  expect(fakeAgentProfiles.grok.capabilities.declineEndsTurn).toBeNull();
});
