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
  type StintPhase,
  type StintProcessAttempt,
  type StintProgress,
} from "@stintwork/core";
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, dirname, relative, resolve } from "node:path";
import { Writable } from "node:stream";
import { isDeepStrictEqual } from "node:util";
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
import { processIdentity, stopStintProcesses, ProcessOwnershipError } from "./process-ownership.js";
export {
  stopStintProcesses,
  ProcessOwnershipError,
  processIdentity,
  systemProcesses,
} from "./process-ownership.js";
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
export { verifyRecordedAgent } from "./adapter-cache.js";
export { prepareAgentForStint } from "./prepare-agent.js";
export { selectAgentSource } from "./executable.js";
export { adapterPins, adapterHost } from "./adapter-profiles.js";

export type AgentStintOptions = {
  preparedAgent?: PreparedAgent;
  nativeExecutable?: string;
  env?: NodeJS.ProcessEnv;
  permissionLevel?: PermissionLevel;
  agent: string;
  cwd: string;
  additionalDirectories?: string[];
  prompt: string;
  resume?: {
    sessionId: string;
    progress: StintProgress;
    permissions?: Extract<StintEvent, { type: "permission_request" }>[];
  };
  onEvent: (event: StintLogEvent) => void;
  onProcess?: (attempt: StintProcessAttempt) => void;
  // Reports cleanup of the adapter group and traceable descendants; persistence failure must block the ending.
  onCleanup?: (attemptId: string) => void;
  onSession?: (sessionId: string) => void;
  onPhase?: (phase: StintPhase, result: Partial<AgentStintResult>) => void;
  onPermission?: (
    request: RequestPermissionRequest & {
      requestId: string;
      attemptId?: string;
      forwarded: Promise<void>;
    },
  ) => Promise<RequestPermissionResponse>;
  handoffTimeoutMs?: number;
  afterTurnTimeoutMs?: number;
  afterTurnRequests?: readonly AfterTurnRequest[];
  checkAvailability?: boolean;
};
export type AgentStintResult = {
  stopReason: string;
  handoff?: AgentHandoff | null;
  handoffError?: string;
  findings?: Omit<ReviewFinding, "id">[] | null;
  findingsError?: string;
  findingsRawReply?: string;
  [field: string]: unknown;
};
export type AgentStint = {
  ready?: Promise<void>;
  done: Promise<AgentStintResult>;
  cancel: () => Promise<void>;
  suspend?: () => Promise<void>;
};
export type AgentLauncher = (options: AgentStintOptions) => AgentStint;
export type AdapterLauncher = (
  cwd: string,
  env?: NodeJS.ProcessEnv,
  nativeExecutable?: string,
) => ChildProcessWithoutNullStreams;

export const continuationInstruction =
  "Continue the interrupted turn in this session from the current worktree. Read current project files where needed; they remain authoritative. Do not restart the stage skill or repeat completed work.";

const agentReadyTimeoutMs = 60_000;

export function createAgentLauncher(
  launchAdapter: AdapterLauncher,
  profile: AgentProfile = codexProfile,
  defaultEnv: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): AgentLauncher {
  const processGroups = platform === "linux" || platform === "darwin";
  return ({
    preparedAgent,
    nativeExecutable,
    env = defaultEnv,
    agent,
    cwd,
    additionalDirectories = [],
    prompt,
    resume,
    onEvent: emitEvent,
    onProcess,
    onCleanup,
    onSession,
    onPhase,
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
    const attemptId = randomUUID();
    const onEvent = (event: StintLogEvent) => {
      if (!resume) return emitEvent(event);
      emitEvent({
        ...event,
        ...("id" in event ? { id: `${attemptId}:${event.id}` } : {}),
        ...("toolCallId" in event ? { toolCallId: `${attemptId}:${event.toolCallId}` } : {}),
      });
    };
    let loading = !!resume;
    const savedPermissions = new Map(
      (resume?.permissions ?? []).map((request) => [request.requestId, request]),
    );
    let restoringManualPermission = savedPermissions.size > 0;
    const livePermissions = new Set<Promise<void>>();
    function retirePermissions() {
      for (const request of savedPermissions.values())
        emitEvent({
          type: "permission_delivery",
          requestId: request.requestId,
          attemptId: request.attemptId ?? "legacy",
          outcome: "retired",
        });
      savedPermissions.clear();
    }
    let child: ChildProcessWithoutNullStreams | undefined;
    let processAttempt: StintProcessAttempt | undefined;
    let connection: import("@agentclientprotocol/sdk").ClientSideConnection | undefined;
    let acpId: string | undefined;
    let cancelled = false;
    let suspended = false;
    let writersMayHaveStarted = false;
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
    const afterTurnCancellation = new AbortController();
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
      const marker = preparedAgent ? `stintwork-${attemptId}` : null;
      child = preparedAgent
        ? spawn(process.execPath, [`--title=${marker}`, preparedAgent.adapterEntry], {
            cwd,
            stdio: "pipe",
            detached: processGroups,
            env: preparedAgentEnvironment(preparedAgent, env),
          })
        : launchAdapter(cwd, env, nativeExecutable);
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
            if (settled || suspended || loading) return;
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
            writersMayHaveStarted = true;
            if (settled || suspended) throw new CoreTextError({ code: "agent.stintEnded" });
            chunk = undefined;
            const requestId = randomUUID();
            const receipt = forwarding.prepare();
            const forwarded = receipt.forwarded.then(
              () => {
                if (!suspended)
                  onEvent({
                    type: "permission_delivery",
                    requestId,
                    attemptId,
                    outcome: "written",
                  });
              },
              (error) => {
                if (!suspended)
                  onEvent({ type: "permission_delivery", requestId, attemptId, outcome: "failed" });
                throw error;
              },
            );
            livePermissions.add(forwarded);
            void forwarded.then(
              () => livePermissions.delete(forwarded),
              () => livePermissions.delete(forwarded),
            );
            void forwarded.catch((error) => {
              if (!suspended && !cancelled && event.decision.outcome !== "cancelled") fail(error);
            });
            let previous: Extract<StintEvent, { type: "permission_request" }> | undefined;
            for (const saved of savedPermissions.values()) {
              let details: unknown;
              try {
                details = JSON.parse(saved.details ?? "null");
              } catch {
                /* Unparseable details cannot establish a match. */
              }
              const sorted = (options: typeof saved.options) =>
                [...options].sort((a, b) => a.optionId.localeCompare(b.optionId));
              if (
                isDeepStrictEqual(details, request.toolCall) &&
                isDeepStrictEqual(sorted(saved.options), sorted(request.options))
              ) {
                previous = saved;
                savedPermissions.delete(saved.requestId);
                break;
              }
            }
            const event: Extract<StintEvent, { type: "permission" }> = {
              type: "permission",
              requestId,
              attemptId,
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
                !restoringManualPermission &&
                inside &&
                request.options.find((option) => option.kind === "allow_once");
              event.automatic = !!allowed;
              const answer = allowed
                ? Promise.resolve({
                    outcome: { outcome: "selected" as const, optionId: allowed.optionId },
                  })
                : onPermission
                  ? onPermission({ ...request, requestId, attemptId, forwarded })
                  : permissionCancelled;
              void answer.catch(() => {});
              onEvent({
                type: "permission_request",
                requestId,
                attemptId,
                binding: "live",
                ...(previous
                  ? {
                      logicalRequestId: previous.logicalRequestId ?? previous.requestId,
                      raisedAt: previous.raisedAt,
                    }
                  : {}),
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
              if (!suspended) onEvent(event);
              receipt.respond(response);
            } catch (error) {
              const failure = error instanceof Error ? error : new Error(String(error));
              receipt.failed(failure);
              event.decision = { outcome: "failed", reason: failure.message };
              try {
                if (!suspended) onEvent(event);
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
            writersMayHaveStarted = true;
            if (settled || suspended) throw new CoreTextError({ code: "agent.stintEnded" });
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
        if (child.pid) {
          const identity = preparedAgent ? processIdentity(child.pid) : undefined;
          const ownerIdentity = preparedAgent ? processIdentity(process.pid) : undefined;
          processAttempt = {
            id: attemptId,
            owner: {
              pid: process.pid,
              startedAt: new Date(performance.timeOrigin).toISOString(),
              ...(ownerIdentity ? { identity: ownerIdentity } : {}),
            },
            pid: child.pid,
            marker,
            ...(identity ? { identity } : {}),
            ...(preparedAgent && processGroups ? { processGroup: true } : {}),
          };
          onProcess?.(processAttempt);
        }
        const initialize = (async () => {
          const initialized = await acp.initialize({
            protocolVersion: PROTOCOL_VERSION,
            clientCapabilities: {
              fs: { readTextFile: true, writeTextFile: true },
              terminal: false,
            },
            clientInfo: { name: "stintwork", version: "0.0.0" },
          });
          if (cancelled || settled) throw new CoreTextError({ code: "agent.stintCancelled" });
          if (
            additionalDirectories.length &&
            initialized.agentCapabilities?.sessionCapabilities?.additionalDirectories == null
          )
            throw new Error(
              `${profile.displayName} does not support additional writable directories. ${profile.installationHint}`,
            );
          if (resume && !initialized.agentCapabilities?.loadSession)
            throw new Error(`${profile.displayName} does not support loadSession.`);
          const directories = {
            cwd,
            mcpServers: [],
            ...(additionalDirectories.length ? { additionalDirectories } : {}),
          };
          writersMayHaveStarted = true;
          const opened = resume
            ? await acp.loadSession({ ...directories, sessionId: resume.sessionId })
            : await acp.newSession(directories);
          if (cancelled || settled) throw new CoreTextError({ code: "agent.stintCancelled" });
          acpId = resume ? resume.sessionId : (opened as { sessionId: string }).sessionId;
          // Synchronous persistence is part of opening the session, before even mode setup.
          onSession?.(acpId);
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
          if (cancelled || settled) throw new CoreTextError({ code: "agent.stintCancelled" });
        })();
        const timeout = new Promise<never>((_resolve, reject) => {
          // Recovery's server budget includes warm verification and pauses on live permission waits.
          if (resume) return;
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
        while (livePermissions.size)
          await Promise.race([Promise.all([...livePermissions]), failure]);
        loading = false;
        if (cancelled) return { stopReason: "cancelled" };
        resolveReady();
        if (checkAvailability) return { stopReason: "end_turn" };
        const saved = resume?.progress;
        const completed: Partial<AgentStintResult> = saved
          ? {
              ...(saved.handoff !== undefined ? { handoff: saved.handoff } : {}),
              ...(saved.handoffError ? { handoffError: saved.handoffError } : {}),
              ...(saved.findings
                ? {
                    findings: saved.findings.findings,
                    findingsError: saved.findings.error,
                    findingsRawReply: saved.findings.rawReply,
                  }
                : {}),
            }
          : {};
        let result = { stopReason: saved?.stopReason ?? "end_turn", ...completed };
        if (!saved || saved.phase === "work") {
          onPhase?.("work", {});
          workTurn = acp.prompt({
            sessionId: acpId as string,
            prompt: [{ type: "text", text: resume ? continuationInstruction : prompt }],
          });
          result = { ...result, ...(await Promise.race([workTurn, failure])) };
          if (!suspended) retirePermissions();
          restoringManualPermission = false;
        }
        if (suspended) return { stopReason: "cancelled" };
        if (afterTurnTimeoutMs === undefined) {
          onPhase?.("finalization", result);
          return result;
        }
        permissionCancelled = new Promise<RequestPermissionResponse>((resolvePermission) => {
          cancelPermission = () => resolvePermission({ outcome: { outcome: "cancelled" } });
        });
        const afterTurnResults = await collectAfterTurnRequests(
          afterTurnRequests.filter(
            (request) => !(request.resultField in completed) && !(request.errorField in completed),
          ),
          {
            timeoutMs: afterTurnTimeoutMs,
            failure,
            signal: afterTurnCancellation.signal,
            retryAfterCancel: () => cancelled || result.stopReason === "cancelled",
            onRequest(request, results) {
              if (request.resultField === "handoff" || request.resultField === "findings")
                onPhase?.(request.resultField, { ...result, ...results });
            },
            onResult(request, results) {
              if (!suspended) retirePermissions();
              restoringManualPermission = false;
              if (request.resultField === "handoff" || request.resultField === "findings")
                onPhase?.(request.resultField, { ...result, ...results });
            },
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
          },
        );
        onPhase?.("finalization", { ...result, ...afterTurnResults });
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
        try {
          if (processAttempt?.identity && processAttempt.processGroup)
            await stopStintProcesses(
              processAttempt,
              true,
              undefined,
              writersMayHaveStarted ? undefined : exited,
            );
          child.kill("SIGTERM");
          const killTimer = setTimeout(() => child?.kill("SIGKILL"), 300);
          killTimer.unref();
          child.once("exit", () => clearTimeout(killTimer));
        } catch (error) {
          // Ownership failure still blocks checkpointing, but must not keep the CLI alive.
          child.unref();
          // biome-ignore lint/correctness/noUnsafeFinally: Preserve cleanup uncertainty instead of allowing a successful ending or checkpoint.
          throw error;
        } finally {
          child.stdin.destroy();
          child.stdout.destroy();
          child.stderr.destroy();
        }
        await exited;
        await Promise.allSettled(writes);
        if (processAttempt?.processGroup && !processAttempt.identity)
          await stopStintProcesses(
            processAttempt,
            true,
            undefined,
            writersMayHaveStarted ? undefined : exited,
          );
        if (processAttempt) {
          if (processAttempt.processGroup) onCleanup?.(processAttempt.id);
          else if (preparedAgent || suspended) {
            // biome-ignore lint/correctness/noUnsafeFinally: Cleanup uncertainty must override success/cancellation to prevent an unsafe checkpoint.
            throw new ProcessOwnershipError(
              `Verified process-tree cleanup is unavailable for this attempt on ${platform}. Only Linux and macOS with recorded process-group ownership are supported. The adapter exited, but its tools may still be writing. Verify and stop the old tools before restarting Stintwork. No checkpoint or completed suspension was recorded.`,
            );
          }
        }
      }
    })();
    void done.then(
      () => rejectReady(new Error(`Stint ended before ${profile.displayName} became ready.`)),
      rejectReady,
    );
    return {
      ready,
      done,
      async suspend() {
        suspended = true;
        cancelled = true;
        afterTurnCancellation.abort(new CoreTextError({ code: "agent.stintCancelled" }));
        cancelPermission();
        rejectFailure(new CoreTextError({ code: "agent.stintCancelled" }));
        await done;
      },
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

export const startAgentStint: AgentLauncher = createAgentLauncher(
  (cwd, env = process.env, nativeExecutable) => {
    const executable = findExecutable(nativeExecutable ?? (env.CODEX_PATH || "codex"), env);
    if (!executable) throw new Error(`Codex not found. ${codexProfile.installationHint}`);
    return spawn(process.execPath, [adapterEntry("codex-acp")], {
      cwd,
      stdio: "pipe",
      env: preparedAgentEnvironment({ agent: "codex", executable: { path: executable } }, env),
    });
  },
);

export { installedAgentIdentity, readExecutableIdentity } from "./availability.js";
