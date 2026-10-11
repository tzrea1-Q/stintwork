// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import {
  AgentSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  RequestError,
  type SessionUpdate,
} from "@agentclientprotocol/sdk";
import type { FakeAgentStep } from "./testing.js";
import { toAcpReadable } from "./stdio.js";
import { fakeAgentProfiles } from "./profiles.js";

const script: FakeAgentStep[] = JSON.parse(process.env.STINTWORK_FAKE_SCRIPT ?? "[]");
const handoff: FakeAgentStep[] = JSON.parse(process.env.STINTWORK_FAKE_HANDOFF ?? "[]");
const options = JSON.parse(process.env.STINTWORK_FAKE_OPTIONS ?? "{}");
const profile = fakeAgentProfiles[(options.profile ?? "codex") as keyof typeof fakeAgentProfiles];
const briefs = new Map<string, { cwd: string; prompts: number; mode: string | null }>();
const turns = new Map<string, AbortController>();
const modes =
  profile.capabilities.defaultMode === null
    ? undefined
    : {
        currentModeId: profile.capabilities.defaultMode,
        availableModes: profile.capabilities.modes.map((id) => ({ id, name: id })),
      };

new AgentSideConnection(
  (client) => ({
    async initialize(request) {
      assert.equal(request.protocolVersion, PROTOCOL_VERSION);
      return {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: !(
          options.additionalDirectories ?? profile.capabilities.additionalDirectories
        )
          ? {}
          : { sessionCapabilities: { additionalDirectories: {} } },
        authMethods: [],
        agentInfo: { name: "scriptable-fake", version: "1.0.0" },
      };
    },
    async authenticate() {
      throw new Error("Stintwork must never authenticate agents.");
    },
    async newSession({ cwd, mcpServers, additionalDirectories }) {
      assert.ok(isAbsolute(cwd));
      assert.deepEqual(mcpServers, []);
      if (options.authRequired) throw RequestError.authRequired();
      if (options.startupError) throw RequestError.internalError(undefined, options.startupError);
      if (options.verifyGitDirectories) {
        const directories = execFileSync(
          "git",
          ["rev-parse", "--path-format=absolute", "--git-common-dir", "--git-dir"],
          { cwd, encoding: "utf8" },
        )
          .trim()
          .split("\n");
        assert.deepEqual(additionalDirectories, [...new Set(directories)]);
        assert.ok(additionalDirectories?.every(isAbsolute));
      }
      const id = randomUUID();
      briefs.set(id, { cwd, prompts: 0, mode: profile.capabilities.defaultMode });
      return {
        sessionId: id,
        ...(modes ? { modes } : {}),
        configOptions: profile.capabilities.configOptions.map((id) => ({
          id,
          name: id,
          type: "select" as const,
          currentValue: "fake",
          options: [{ value: "fake", name: "Fake value" }],
        })),
      };
    },
    async setSessionMode({ sessionId, modeId }) {
      assert.ok(profile.capabilities.modes.includes(modeId), "Agent must offer the selected mode.");
      const brief = briefs.get(sessionId);
      assert.ok(brief);
      brief.mode = modeId;
      return {};
    },
    async prompt({ sessionId, prompt }) {
      assert.ok(prompt.some((content) => content.type === "text" && content.text.length));
      const brief = briefs.get(sessionId);
      assert.ok(brief, "Follow-up prompts must use the same ACP identifier.");
      const controller = new AbortController();
      turns.set(sessionId, controller);
      try {
        const turn = brief.prompts++;
        if (turn > 0 && turn <= (options.handoffFailures ?? 0))
          throw RequestError.internalError(undefined, "Fake handoff prompt failed.");
        const steps: readonly FakeAgentStep[] | undefined =
          turn === 0
            ? script
            : options.afterTurnRequests
              ? options.afterTurnRequests[turn - 1]
              : handoff;
        assert.ok(steps, "Unexpected after-turn prompt.");
        for (const step of steps) {
          if (controller.signal.aborted) return { stopReason: "cancelled" };
          if (step.type === "delay")
            await delay(step.milliseconds, undefined, { signal: controller.signal });
          else if (step.type === "end")
            return { stopReason: step.stopReason ?? "end_turn" } as { stopReason: "end_turn" };
          else if (step.type === "crash") process.exit(1);
          else if (step.type === "error") throw RequestError.internalError(undefined, step.message);
          else if (step.type === "hang")
            await new Promise<void>((resolveHang) => {
              if (!step.ignoreCancellation)
                controller.signal.addEventListener("abort", () => resolveHang(), { once: true });
            });
          else if (step.type === "expect-mode") assert.equal(brief.mode, step.mode);
          else if (step.type === "expect-prompt")
            assert.ok(
              prompt.some(
                (content) => content.type === "text" && content.text.includes(step.includes),
              ),
            );
          else if (step.type === "write")
            await client.writeTextFile({
              sessionId,
              path: resolve(brief.cwd, step.path),
              content: step.content,
            });
          else if (step.type === "expect-file") {
            const { content } = await client.readTextFile({
              sessionId,
              path: resolve(brief.cwd, step.path),
            });
            assert.ok(content.includes(step.includes));
          } else if (step.type === "commit") {
            execFileSync("git", ["add", "--all"], { cwd: brief.cwd });
            execFileSync(
              "git",
              [
                "-c",
                `user.name=Fake ${profile.displayName}`,
                "-c",
                "user.email=fake@example.invalid",
                "commit",
                "--quiet",
                "-m",
                step.message,
              ],
              { cwd: brief.cwd },
            );
          } else if (step.type === "permission") {
            const permissionOptions = step.options ?? profile.capabilities.permissionOptions;
            assert.ok(permissionOptions?.length, "This profile needs explicit permission options.");
            const response = await client.requestPermission({
              sessionId,
              toolCall: step.toolCall,
              options: [...permissionOptions],
            });
            if (response.outcome.outcome === "cancelled") return { stopReason: "cancelled" };
            const optionId = response.outcome.optionId;
            const option = permissionOptions.find((option) => option.optionId === optionId);
            assert.ok(option);
            if (step.expectedOptionId !== undefined) assert.equal(optionId, step.expectedOptionId);
            if (option.kind.startsWith("reject") && profile.capabilities.declineEndsTurn !== false)
              return { stopReason: "cancelled" };
          } else
            await client.sessionUpdate({
              sessionId,
              update:
                step.type === "update"
                  ? (step.update as SessionUpdate)
                  : {
                      sessionUpdate:
                        step.type === "message" ? "agent_message_chunk" : "agent_thought_chunk",
                      content: { type: "text", text: step.text },
                    },
            });
        }
        return { stopReason: "end_turn" };
      } catch (error) {
        if (!controller.signal.aborted) throw error;
        return { stopReason: "cancelled" };
      } finally {
        turns.delete(sessionId);
      }
    },
    async cancel({ sessionId }) {
      turns.get(sessionId)?.abort();
    },
  }),
  ndJsonStream(Writable.toWeb(process.stdout), toAcpReadable(process.stdin)),
);
