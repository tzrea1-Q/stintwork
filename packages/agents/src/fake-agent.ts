import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import {
  AgentSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type SessionUpdate,
} from "@agentclientprotocol/sdk";
import type { FakeAgentStep } from "./testing.js";
import { toAcpReadable } from "./stdio.js";

const script: FakeAgentStep[] = JSON.parse(process.env.STINTWORK_FAKE_SCRIPT ?? "[]");
const handoff: FakeAgentStep[] = JSON.parse(process.env.STINTWORK_FAKE_HANDOFF ?? "[]");
const briefs = new Map<string, { cwd: string; prompts: number }>();
const turns = new Map<string, AbortController>();
const modes = {
  currentModeId: "workspace-write",
  availableModes: [{ id: "workspace-write", name: "Workspace access" }],
};

new AgentSideConnection(
  (client) => ({
    async initialize(request) {
      assert.equal(request.protocolVersion, PROTOCOL_VERSION);
      return {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: {},
        authMethods: [],
        agentInfo: { name: "scriptable-fake", version: "1.0.0" },
      };
    },
    async authenticate() {
      throw new Error("Stintwork must never authenticate agents.");
    },
    async newSession({ cwd, mcpServers }) {
      assert.ok(isAbsolute(cwd));
      assert.deepEqual(mcpServers, []);
      const id = randomUUID();
      briefs.set(id, { cwd, prompts: 0 });
      return { sessionId: id, modes };
    },
    async setSessionMode({ modeId }) {
      assert.equal(modeId, "workspace-write");
      return {};
    },
    async prompt({ sessionId, prompt }) {
      assert.ok(prompt.some((content) => content.type === "text" && content.text.length));
      const brief = briefs.get(sessionId);
      assert.ok(brief, "Follow-up prompts must use the same ACP identifier.");
      const controller = new AbortController();
      turns.set(sessionId, controller);
      try {
        for (const step of brief.prompts++ === 0 ? script : handoff) {
          if (controller.signal.aborted) return { stopReason: "cancelled" };
          if (step.type === "delay")
            await delay(step.milliseconds, undefined, { signal: controller.signal });
          else if (step.type === "end")
            return { stopReason: step.stopReason ?? "end_turn" } as { stopReason: "end_turn" };
          else if (step.type === "crash") process.exit(1);
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
          else if (step.type === "permission") {
            const response = await client.requestPermission({
              sessionId,
              toolCall: step.toolCall,
              options: step.options,
            });
            if (response.outcome.outcome === "cancelled") return { stopReason: "cancelled" };
            const optionId = response.outcome.optionId;
            const option = step.options.find((option) => option.optionId === optionId);
            assert.ok(option);
            if (step.expectedOptionId !== undefined) assert.equal(optionId, step.expectedOptionId);
            if (option.kind.startsWith("reject")) return { stopReason: "cancelled" };
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
