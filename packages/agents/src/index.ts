// SPDX-License-Identifier: Apache-2.0
import {
  CoreTextError,
  coreText,
  permissionPaths,
  permissionPolicy,
  type PermissionLevel,
  type AgentProfile,
  type StintEvent,
  type StintLogEvent,
  type ReviewFinding,
} from "@stintwork/core";
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, dirname, relative, resolve } from "node:path";
import { Writable } from "node:stream";
import type { RequestPermissionRequest, RequestPermissionResponse } from "@agentclientprotocol/sdk";

import { toAcpReadable } from "./stdio.js";
import { normalizeStintUpdate } from "./stint-events.js";
import { type AgentHandoff, handoffRequest } from "./handoff.js";
import {
  type AfterTurnRequest,
  collectAfterTurnRequests,
  joinAfterTurnMessages,
} from "./after-turn.js";
import { createPermissionForwarding } from "./permission-forwarding.js";
import { codexProfile } from "./profiles.js";
import { AgentAuthenticationError } from "./authentication.js";
import { adapterEntry } from "./adapter-entry.js";
import { preparedAgentEnvironment, type PreparedAgent } from "./adapter-cache.js";
import { findExecutable } from "./executable.js";

export { AgentAuthenticationError } from "./authentication.js";
export { createCodexAgent } from "./codex.js";
export { createClaudeCodeAgent } from "./claude-code.js";
export { claudeProfile } from "./profiles.js";

export {
  type AgentRegistry,
  type RegisteredAgent,
  createAgentRegistry,
  describeAgents,
  refreshAgentAvailability,
} from "./registry.js";
export { createGrokAgent } from "./grok.js";
export { grokProfile } from "./profiles.js";
export type { AfterTurnRequest } from "./after-turn.js";
export { handoffRequest } from "./handoff.js";
export { findingsFormat, findingsRequest, parseFindings } from "./findings.js";
export {
  prepareAgent,
  inspectInstalledAgent,
  agentCacheDirectory,
  preparedAgentEnvironment,
  type PreparedAgent,
  type AgentPreparationOptions,
  type AgentPreparationEvent,
  type AgentSourceReason,
} from "./adapter-cache.js";
export { prepareAgentForStint } from "./prepare-agent.js";
export { selectAgentSource } from "./executable.js";
export { adapterPins } from "./adapter-profiles.js";

export type AgentStintOptions = {
  preparedAgent?: PreparedAgent;
  env?: NodeJS.ProcessEnv;
  permissionLevel?: PermissionLevel;
  agent: string;
  cwd: string;
  additionalDirectories?: string[];
  prompt: string;
  onEvent: (event: StintLogEvent) => void;
  onPermission?: (
    request: RequestPermissionRequest & { requestId: string; forwarded: Promise<void> },
  ) => Promise<RequestPermissionResponse>;
  handoffTimeoutMs?: number;
  afterTurnTimeoutMs?: number;
  afterTurnRequests?: readonly AfterTurnRequest[];
  checkAvailability?: boolean;
};
export type AgentStint = {
  ready?: Promise<void>;
  done: Promise<{
    stopReason: string;
    handoff?: AgentHandoff | null;
    handoffError?: string;
    findings?: Omit<ReviewFinding, "id">[] | null;
    findingsError?: string;
    findingsRawReply?: string;
    [field: string]: unknown;
  }>;
  cancel: () => Promise<void>;
};
export type AgentLauncher = (options: AgentStintOptions) => AgentStint;
export type AdapterLauncher = (
  cwd: string,
  env?: NodeJS.ProcessEnv,
) => ChildProcessWithoutNullStreams;

const agentReadyTimeoutMs = 60_000;

export function createAgentLauncher(
  launchAdapter: AdapterLauncher,
  profile: AgentProfile = codexProfile,
  defaultEnv: NodeJS.ProcessEnv = process.env,
): AgentLauncher {
  return ({
    preparedAgent,
    env = defaultEnv,
    agent,
    cwd,
    additionalDirectories = [],
    prompt,
    onEvent,
    onPermission,
    handoffTimeoutMs,
    afterTurnTimeoutMs = handoffTimeoutMs,
    afterTurnRequests = [handoffRequest],
    checkAvailability = false,
    permissionLevel = "edit-freely",
  }) => {
    let resolveReady: () => void = () => {};
    let rejectReady: (error: unknown) => void = () => {};
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    void ready.catch(() => {});
    let child: ChildProcessWithoutNullStreams | undefined;
    let connection: import("@agentclientprotocol/sdk").ClientSideConnection | undefined;
    let acpId: string | undefined;
    let cancelled = false;
    let settled = false;
    let cancelPermission: () => void = () => {};
    let permissionCancelled = new Promise<RequestPermissionResponse>((resolvePermission) => {
      cancelPermission = () => resolvePermission({ outcome: { outcome: "cancelled" } });
    });
    let rejectFailure: (error: Error) => void = () => {};
    const failure = new Promise<never>((_resolve, reject) => {
      rejectFailure = reject;
    });
    void failure.catch(() => {});
    let chunk: { type: "message_delta" | "thought_delta"; id: string } | undefined;
    let nextMessage = 0;
    const toolKinds = new Map<string, string>();
    let afterTurnMessages: string[] | undefined;
    let workTurn: Promise<{ stopReason: string }> | undefined;
    const writes = new Set<Promise<void>>();

    const policy = permissionPolicy(profile, permissionLevel);

    async function safePath(path: string, directories = [cwd, ...additionalDirectories]) {
      if (!isAbsolute(path)) throw new CoreTextError({ code: "agent.absolutePaths" });
      const target = resolve(path);
      let existing = target;
      while (
        !(await lstat(existing).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
          return undefined;
        }))
      )
        existing = dirname(existing);
      const realExisting = await realpath(existing);
      for (const directory of directories) {
        const inside = relative(resolve(directory), target);
        const realInside = relative(await realpath(directory), realExisting);
        if (
          [inside, realInside].every(
            (part) => part !== ".." && !part.startsWith("../") && !isAbsolute(part),
          )
        )
          return target;
      }
      throw new CoreTextError({ code: "agent.pathOutside" });
    }

    const done = (async () => {
      if (agent !== profile.id)
        throw new Error(`This launcher supports ${profile.displayName}, not agent ${agent}.`);
      const { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION, RequestError } = await import(
        "@agentclientprotocol/sdk"
      );
      if (cancelled) return { stopReason: "cancelled" };
      if (preparedAgent && preparedAgent.agent !== agent)
        throw new Error("Prepared agent does not match the requested stint.");
      child = preparedAgent
        ? spawn(process.execPath, [preparedAgent.adapterEntry], {
            cwd,
            stdio: "pipe",
            env: preparedAgentEnvironment(preparedAgent, env),
          })
        : launchAdapter(cwd, env);
      const forwarding = createPermissionForwarding(
        ndJsonStream(Writable.toWeb(child.stdin), toAcpReadable(child.stdout)),
      );
      const fail = (error: Error) => {
        if (!settled) {
          forwarding.close(error);
          rejectFailure(error);
        }
      };
      child.on("error", (error: NodeJS.ErrnoException) =>
        fail(
          error.code === "ENOENT"
            ? new Error(`${profile.displayName} adapter not found. ${profile.installationHint}`)
            : error,
        ),
      );
      child.on("exit", (code, signal) =>
        fail(
          new Error(`${profile.displayName} exited before the stint ended (${code ?? signal}).`),
        ),
      );
      child.stdin.on("error", fail);
      child.stdout.on("error", fail);
      child.stderr.resume();
      const acp = new ClientSideConnection(
        () => ({
          async sessionUpdate({ update }) {
            if (settled) return;
            try {
              const kind = update.sessionUpdate;
              if (
                (kind === "agent_message_chunk" || kind === "agent_thought_chunk") &&
                update.content.type === "text"
              ) {
                if (kind === "agent_message_chunk" && afterTurnMessages !== undefined) {
                  if (chunk?.type !== "message_delta") afterTurnMessages.push("");
                  afterTurnMessages[afterTurnMessages.length - 1] += update.content.text;
                }
                const type = kind === "agent_message_chunk" ? "message_delta" : "thought_delta";
                chunk = chunk?.type === type ? chunk : { type, id: String(++nextMessage) };
                onEvent({ ...chunk, text: update.content.text });
              } else {
                chunk = undefined;
                for (const event of normalizeStintUpdate(update, toolKinds)) onEvent(event);
              }
            } catch (error) {
              fail(error instanceof Error ? error : new Error(String(error)));
            }
          },
          async requestPermission(request) {
            if (settled) throw new CoreTextError({ code: "agent.stintEnded" });
            chunk = undefined;
            const requestId = randomUUID();
            const receipt = forwarding.prepare();
            const event: Extract<StintEvent, { type: "permission" }> = {
              type: "permission",
              requestId,
              toolCallId: request.toolCall.toolCallId,
              title: request.toolCall.title ?? null,
              kind: request.toolCall.kind ?? null,
              automatic: false,
              decision: {
                outcome: "failed",
                reason: coreText({ code: "permission.undecided" }).text,
              },
            };
            let response: RequestPermissionResponse;
            try {
              const targets = permissionPaths(policy.autoAnswer, request.toolCall, cwd);
              const inside =
                targets &&
                (await Promise.all(targets.map((path) => safePath(path, [cwd]))).then(
                  () => true,
                  () => false,
                ));
              const allowed =
                inside && request.options.find((option) => option.kind === "allow_once");
              event.automatic = !!allowed;
              const answer = allowed
                ? Promise.resolve({
                    outcome: { outcome: "selected" as const, optionId: allowed.optionId },
                  })
                : onPermission
                  ? onPermission({ ...request, requestId, forwarded: receipt.forwarded })
                  : permissionCancelled;
              void answer.catch(() => {});
              onEvent({
                type: "permission_request",
                requestId,
                details: JSON.stringify(request.toolCall, null, 2),
                toolCallId: event.toolCallId,
                title: event.title,
                kind: event.kind,
                automatic: event.automatic,
                options: request.options.map(({ optionId, name, kind }) => ({
                  optionId,
                  name,
                  kind,
                })),
              });
              const selectedResponse = await Promise.race([answer, permissionCancelled, failure]);
              response = { outcome: { ...selectedResponse.outcome } };
              if (response.outcome.outcome === "selected") {
                const optionId = response.outcome.optionId;
                const selected = request.options.find((option) => option.optionId === optionId);
                if (!selected) throw new CoreTextError({ code: "agent.permissionOption" });
                event.decision = { outcome: "selected", optionId, kind: selected.kind };
              } else {
                event.decision = { outcome: "cancelled" };
                receipt.failed(new CoreTextError({ code: "agent.permissionCancelled" }));
              }
              onEvent(event);
              receipt.respond(response);
            } catch (error) {
              const failure = error instanceof Error ? error : new Error(String(error));
              receipt.failed(failure);
              event.decision = { outcome: "failed", reason: failure.message };
              try {
                onEvent(event);
              } finally {
                fail(failure);
              }
              throw failure;
            }
            return response;
          },
          async readTextFile({ path, line, limit }) {
            if (line != null && (!Number.isInteger(line) || line < 1))
              throw new Error("line must be positive");
            if (limit != null && (!Number.isInteger(limit) || limit < 0))
              throw new Error("limit must be non-negative");
            const content = await readFile(await safePath(path), "utf8");
            if (line == null && limit == null) return { content };
            const start = (line ?? 1) - 1;
            return {
              content: (content.match(/[^\n]*\n|[^\n]+$/g) ?? [])
                .slice(start, limit == null ? undefined : start + limit)
                .join(""),
            };
          },
          async writeTextFile({ path, content }) {
            if (settled) throw new CoreTextError({ code: "agent.stintEnded" });
            const writing = (async () => {
              const target = await safePath(path);
              await mkdir(dirname(target), { recursive: true });
              await writeFile(target, content, "utf8");
            })();
            writes.add(writing);
            try {
              await writing;
            } finally {
              writes.delete(writing);
            }
            return {};
          },
        }),
        forwarding.stream,
      );
      connection = acp;
      void acp.closed.then(
        () =>
          fail(new Error(`${profile.displayName} ACP transport closed before the stint ended.`)),
        fail,
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const initialize = (async () => {
          const initialized = await acp.initialize({
            protocolVersion: PROTOCOL_VERSION,
            clientCapabilities: {
              fs: { readTextFile: true, writeTextFile: true },
              terminal: false,
            },
            clientInfo: { name: "stintwork", version: "0.0.0" },
          });
          if (
            additionalDirectories.length &&
            initialized.agentCapabilities?.sessionCapabilities?.additionalDirectories == null
          )
            throw new Error(
              `${profile.displayName} does not support additional writable directories. ${profile.installationHint}`,
            );
          const opened = await acp.newSession({
            cwd,
            mcpServers: [],
            ...(additionalDirectories.length ? { additionalDirectories } : {}),
          });
          acpId = opened.sessionId;
          if (policy.mode !== null) {
            if (!opened.modes?.availableModes.some(({ id }) => id === policy.mode))
              throw new Error(
                `${profile.displayName} does not offer the required ${policy.mode} mode.`,
              );
            await acp.setSessionMode({
              sessionId: acpId,
              modeId: policy.mode,
            });
          }
        })();
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `The agent took longer than ${agentReadyTimeoutMs / 1000} seconds to start; the machine may be busy. Try again.`,
                ),
              ),
            agentReadyTimeoutMs,
          );
        });
        await Promise.race([initialize, failure, timeout]);
        clearTimeout(timer);
        if (cancelled) return { stopReason: "cancelled" };
        resolveReady();
        if (checkAvailability) return { stopReason: "end_turn" };
        workTurn = acp.prompt({
          sessionId: acpId as string,
          prompt: [{ type: "text", text: prompt }],
        });
        const result = await Promise.race([workTurn, failure]);
        if (afterTurnTimeoutMs === undefined) return result;
        permissionCancelled = new Promise<RequestPermissionResponse>((resolvePermission) => {
          cancelPermission = () => resolvePermission({ outcome: { outcome: "cancelled" } });
        });
        const afterTurnResults = await collectAfterTurnRequests(afterTurnRequests, {
          timeoutMs: afterTurnTimeoutMs,
          failure,
          retryAfterCancel: () => cancelled || result.stopReason === "cancelled",
          async prompt(text) {
            chunk = undefined;
            afterTurnMessages = [];
            await acp.prompt({
              sessionId: acpId as string,
              prompt: [{ type: "text", text }],
            });
            return joinAfterTurnMessages(afterTurnMessages);
          },
          async cancel() {
            cancelPermission();
            await Promise.race([
              acp.cancel({ sessionId: acpId as string }).catch(() => {}),
              new Promise<void>((resolveCancel) => setTimeout(resolveCancel, 100)),
            ]);
            permissionCancelled = new Promise<RequestPermissionResponse>((resolvePermission) => {
              cancelPermission = () => resolvePermission({ outcome: { outcome: "cancelled" } });
            });
          },
        });
        return { ...result, ...afterTurnResults };
      } catch (error) {
        if (cancelled) return { stopReason: "cancelled" };
        const message = error instanceof Error ? error.message : String(error);
        if (
          (error instanceof RequestError && error.code === RequestError.authRequired().code) ||
          /auth(?:entication)?[ _-]required/i.test(message)
        )
          throw new AgentAuthenticationError(profile);
        if (
          /(?:ENOENT|not found)/i.test(message) &&
          [profile.id, "spawn"].some((name) => message.toLowerCase().includes(name))
        )
          throw new Error(`${profile.displayName} not found. ${profile.installationHint}`);
        const internal = RequestError.internalError();
        if (
          error instanceof RequestError &&
          error.code === internal.code &&
          message.startsWith(internal.message)
        ) {
          const detail = message.slice(internal.message.length);
          throw new CoreTextError(
            detail
              ? { code: "agent.internalErrorDetail", params: { detail } }
              : { code: "agent.internalError" },
          );
        }
        if (error instanceof CoreTextError) throw error;
        throw new Error(message);
      } finally {
        clearTimeout(timer);
        settled = true;
        forwarding.close(new CoreTextError({ code: "agent.permissionForwardingEnded" }));
        const exited = new Promise<void>((resolveExit) => {
          if (!child?.pid || child.exitCode !== null || child.signalCode !== null) resolveExit();
          else child.once("exit", () => resolveExit());
        });
        child.kill("SIGTERM");
        const killTimer = setTimeout(() => child?.kill("SIGKILL"), 300);
        killTimer.unref();
        child.once("exit", () => clearTimeout(killTimer));
        child.stdin.destroy();
        child.stdout.destroy();
        await exited;
        await Promise.allSettled(writes);
      }
    })();
    void done.then(
      () => rejectReady(new Error(`Stint ended before ${profile.displayName} became ready.`)),
      rejectReady,
    );
    return {
      ready,
      done,
      async cancel() {
        cancelled = true;
        cancelPermission();
        if (connection && acpId) {
          await Promise.race([
            connection.cancel({ sessionId: acpId }).catch(() => {}),
            new Promise<void>((resolveCancel) => setTimeout(resolveCancel, 100)),
          ]);
        }
        let acknowledged = false;
        if (workTurn)
          await Promise.race([
            workTurn.then(
              () => {
                acknowledged = true;
              },
              () => {},
            ),
            new Promise<void>((resolveCancel) => setTimeout(resolveCancel, 100)),
          ]);
        if (!acknowledged) rejectFailure(new CoreTextError({ code: "agent.stintCancelled" }));
      },
    };
  };
}

export const startAgentStint: AgentLauncher = createAgentLauncher((cwd, env = process.env) => {
  const executable = env.CODEX_PATH ? findExecutable(env.CODEX_PATH, env) : undefined;
  return spawn(process.execPath, [adapterEntry("codex-acp")], {
    cwd,
    stdio: "pipe",
    env: {
      ...env,
      ...(executable ? { CODEX_PATH: executable } : {}),
    },
  });
});
