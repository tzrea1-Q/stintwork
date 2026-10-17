// SPDX-License-Identifier: Apache-2.0
import {
  coreTextWire,
  errorText,
  CoreTextError,
  coreText,
  foldStintLog,
  indexProject,
  agentUnavailable,
  type BriefHandoff,
  type ReviewFindings,
  type StintLiveMessage,
  type StintLogEntry,
  type CheckpointWarning,
  coreTextFields,
  type CoreText,
  isPermissionLevel,
  type PermissionLevel,
  type AgentPreparationProgress,
  type AgentSelection,
} from "@stintwork/core";

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AgentLauncher,
  type AgentRegistry,
  type AgentStint,
  createAgentRegistry,
  AgentAuthenticationError,
  refreshAgentAvailability,
  handoffRequest,
  findingsRequest,
  readExecutableIdentity,
  type PreparedAgent,
  type AgentPreparationOptions,
} from "@stintwork/agents";

import {
  commitStintworkSetup,
  createCheckpoint,
  committedRiskyPaths,
  ensureWorktree,
  installWorktreeDependencies,
  worktreeGitDirectories,
} from "@stintwork/git";
import type { Hono } from "hono";
import { stream } from "hono/streaming";
import { prepareStintBrief } from "./brief-preview.js";

import { addStintPermissionRoute } from "./stint-permissions.js";
import type { ProjectFilesReader } from "./work-item-files.js";
import { activeStintIds } from "./stint-history.js";
import { ensureLocalIgnore, writeFirstStintWorkflow } from "./stint-repo-writes.js";
import { addStageAgentRoute, writeStageAgentWorkflow } from "./stage-agent.js";
import { addGateRoutes } from "./gates.js";
import { addMemoryProposalRoutes } from "./memory-proposals.js";
import { addFindingDecisionRoutes } from "./finding-decisions.js";
import { addShipRoutes } from "./ship.js";
import type { ReviewEvidenceReader } from "./review-evidence.js";

export type StintServerOptions = {
  launchAgent?: AgentLauncher;
  agentRegistry?: AgentRegistry;
  handoffTimeoutMs?: number;
  prepareAgent?: (options: AgentPreparationOptions) => Promise<PreparedAgent>;
};

type ActiveStint = {
  id?: string;
  handle?: AgentStint;
  completion?: Promise<void>;
  preparation?: Promise<void>;
  setupCancellation?: AbortController;
  stopRequested?: boolean;
  ending?: boolean;
  confirmSource?: () => void;
};

function prepareLogs(root: string) {
  ensureLocalIgnore(root);
  let directory = root;
  for (const part of [".stintwork", "local", "stints"]) {
    directory = join(directory, part);
    const stat = lstatSync(directory, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
      throw new CoreTextError({ code: "stint.logDirectories" });
    if (!stat) mkdirSync(directory);
  }
  return { directory };
}

export function addStintRoutes(
  app: Hono,
  root: string,
  readProjectFiles: ProjectFilesReader,
  options: StintServerOptions,
  broadcast: (message: StintLiveMessage) => void,
  refresh: () => void,
  isChecking: (slug: string) => boolean = () => false,
  readReviewEvidence?: ReviewEvidenceReader,
) {
  const registry = options.agentRegistry ?? createAgentRegistry();
  const handoffTimeoutMs = options.handoffTimeoutMs ?? 90_000;
  if (!Number.isFinite(handoffTimeoutMs) || handoffTimeoutMs < 0)
    throw new Error("Handoff timeout must be a non-negative number of milliseconds.");
  const active = new Map<string, ActiveStint>();
  const workflowWrites = new Set<string>();
  const stageAgents = addStageAgentRoute(
    app,
    readProjectFiles,
    root,
    registry,
    refresh,
    (slug) => active.has(slug),
    workflowWrites,
  );
  addGateRoutes(
    app,
    readProjectFiles,
    root,
    refresh,
    (slug) => active.has(slug) || isChecking(slug),
    workflowWrites,
    readReviewEvidence,
  );
  addFindingDecisionRoutes(
    app,
    readProjectFiles,
    refresh,
    (slug) => active.has(slug),
    workflowWrites,
    isChecking,
    readReviewEvidence,
  );
  addMemoryProposalRoutes(
    app,
    root,
    readProjectFiles,
    refresh,
    (slug) => active.has(slug),
    workflowWrites,
  );
  const permissions = addStintPermissionRoute(app);
  addShipRoutes(
    app,
    root,
    readProjectFiles,
    refresh,
    (slug) => active.has(slug),
    workflowWrites,
    isChecking,
    readReviewEvidence,
  );
  let closing = false;
  app.post("/api/stints/:stintId/confirm-agent", (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.originMismatch" }) }),
        403,
      );
    const state = [...active.values()].find(
      (candidate) => candidate.id === context.req.param("stintId"),
    );
    if (!state?.confirmSource || state.stopRequested)
      return context.json(coreTextWire({ reason: coreText({ code: "stint.notRunning" }) }), 409);
    state.confirmSource();
    return context.json({ ok: true });
  });
  app.post("/api/stints/:stintId/stop", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.originMismatch" }) }),
        403,
      );
    const id = context.req.param("stintId");
    const state = [...active.values()].find((candidate) => candidate.id === id);
    if (!state || state.ending)
      return context.json(coreTextWire({ reason: coreText({ code: "stint.notRunning" }) }), 409);
    if (!state.stopRequested) {
      state.stopRequested = true;
      permissions.clear(id, false);
      state.setupCancellation?.abort();
      await state.handle?.cancel();
    }
    return context.json(coreTextWire({ stintId: id }), 202);
  });
  app.post("/api/stints", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.originMismatch" }) }),
        403,
      );
    if (
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json(coreTextWire({ reason: coreText({ code: "server.jsonStart" }) }), 400);
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json(coreTextWire({ reason: coreText({ code: "server.invalidJson" }) }), 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("workItem" in body) ||
      typeof body.workItem !== "string" ||
      ("ticket" in body &&
        body.ticket !== null &&
        (!Number.isSafeInteger(body.ticket) || (body.ticket as number) <= 0)) ||
      ("agent" in body && typeof body.agent !== "string") ||
      ("permissionLevel" in body && !isPermissionLevel(body.permissionLevel))
    ) {
      return context.json(
        coreTextWire({
          reason: coreText({ code: "stint.chooseStart" }),
        }),
        400,
      );
    }
    if ("agent" in body && !registry.has(body.agent as string))
      return context.json(
        coreTextWire({
          reason: coreText({
            code: "agent.notRegistered",
            params: { agent: body.agent as string },
          }),
        }),
        400,
      );
    if (closing)
      return context.json(coreTextWire({ reason: coreText({ code: "server.stopping" }) }), 503);
    const result = await prepareStintBrief(
      readProjectFiles,
      body.workItem,
      "ticket" in body ? (body.ticket as number | null) : null,
      root,
      registry,
      "agent" in body ? (body.agent as string) : undefined,
      "permissionLevel" in body ? (body.permissionLevel as PermissionLevel) : undefined,
    );
    refresh();
    if ("reason" in result)
      return context.json(
        coreTextWire({ reason: result.reason }),
        result.status === 404 ? 409 : result.status,
      );
    const { workItem, ticket } = result;
    const agentId = "agent" in body ? (body.agent as string) : result.brief.agent;
    const agent = registry.get(agentId);
    if (!agent)
      return context.json(
        coreTextWire({
          reason: coreText({ code: "agent.notRegistered", params: { agent: agentId } }),
        }),
        400,
      );
    await refreshAgentAvailability(agent, true);
    const unavailable = agentUnavailable(agent);
    if (unavailable) return context.json(coreTextWire({ reason: unavailable }), 409);
    if (isChecking(workItem.slug))
      return context.json(coreTextWire({ reason: coreText({ code: "stint.checksActive" }) }), 409);
    if (active.has(workItem.slug) || stageAgents.isWriting(workItem.slug))
      return context.json(coreTextWire({ reason: coreText({ code: "stint.alreadyActive" }) }), 409);
    if (
      indexProject(readProjectFiles().files, { name: "" }).workItems.find(
        ({ slug }) => slug === workItem.slug,
      )?.stage !== workItem.stage
    )
      return context.json(coreTextWire({ reason: coreText({ code: "stint.stageChanged" }) }), 409);
    const state: ActiveStint = { id: randomUUID(), setupCancellation: new AbortController() };
    const streaming = context.req.header("accept") === "application/x-ndjson";
    let send: (message: unknown) => void = () => {};
    function progress(event: AgentPreparationProgress) {
      send({ type: "preparation", stintId: state.id, progress: event });
    }
    active.set(workItem.slug, state);
    const runStart = async () => {
      let prepared: () => void = () => {};
      state.preparation = new Promise<void>((resolvePreparation) => {
        prepared = resolvePreparation;
      });
      try {
        let preparedAgent: PreparedAgent | undefined;
        let selected: AgentSelection | PreparedAgent | undefined;
        const prepareOverride = options.prepareAgent;
        const cachedAgent = agent.id === "claude" || agent.id === "codex" ? agent.id : undefined;
        const prepareAgent =
          prepareOverride && cachedAgent
            ? (preparation: Omit<AgentPreparationOptions, "agent">) =>
                prepareOverride({ ...preparation, agent: cachedAgent })
            : options.launchAgent
              ? undefined
              : agent.prepare;
        if (prepareAgent) {
          try {
            selected = await prepareAgent({
              cwd: root,
              signal: state.setupCancellation?.signal,
              onProgress: (event) => {
                progress(event);
                agent.availability = {
                  available: false,
                  canStart: true,
                  kind:
                    event.reason === "incompatible" || event.reason === "below-tested-range"
                      ? "incompatible"
                      : "not-prepared",
                  selection: event,
                  installedIdentity:
                    (event.source === "installed" ? event.executable?.identity : undefined) ??
                    agent.availability?.installedIdentity,
                };
              },
              ...(streaming
                ? {
                    beforePrepare: (event, signal) =>
                      new Promise<void>((resolve, reject) => {
                        const abort = () => {
                          state.confirmSource = undefined;
                          reject(signal.reason);
                        };
                        if (signal.aborted) {
                          abort();
                          return;
                        }
                        signal.addEventListener("abort", abort, { once: true });
                        state.confirmSource = () => {
                          signal.removeEventListener("abort", abort);
                          state.confirmSource = undefined;
                          resolve();
                        };
                        progress({ ...event, phase: "confirm" });
                      }),
                  }
                : {}),
            });
            if ("adapterEntry" in selected) preparedAgent = selected;
            agent.availability = {
              ...agent.availability,
              available: false,
              canStart: true,
              kind: "not-prepared",
              selection: selected,
            };
            progress({ ...selected, phase: "ready" });
          } catch (error) {
            const auth =
              error instanceof AgentAuthenticationError ||
              (error instanceof Error &&
                (("code" in error && error.code === -32000) ||
                  /authentication required/i.test(error.message)))
                ? new AgentAuthenticationError(agent)
                : undefined;
            agent.availability = {
              ...agent.availability,
              available: false,
              canStart: true,
              kind: auth
                ? "login-required"
                : state.stopRequested
                  ? "not-prepared"
                  : "preparation-failed",
              reason: auth ? auth.coreText : errorText(error),
              checkedAt: new Date().toISOString(),
            };
            send({ type: "availability", agent: agent.id, availability: agent.availability });
            refresh();
            throw auth ?? error;
          }
        }
        state.setupCancellation?.signal.throwIfAborted();
        const project = readProjectFiles();
        const discoveryFailure = project.warnings.find(({ path }) => path === ".git");
        if (discoveryFailure) throw new Error(discoveryFailure.message);
        const firstWorktree = !project.worktreePaths.has(workItem.slug);
        const worktree = await ensureWorktree(root, workItem.slug);
        if (closing) throw new CoreTextError({ code: "server.stopping" });
        let inheritedAgents = false;
        if (firstWorktree) {
          for (const stage of result.workflows[workItem.workflow].stages) {
            const choice = workItem.stages[stage.id]?.agent;
            if (
              typeof choice === "string" &&
              writeStageAgentWorkflow(worktree.path, workItem, stage.id, choice)
            )
              inheritedAgents = true;
          }
        }
        const prepared = await prepareStintBrief(
          readProjectFiles,
          workItem.slug,
          ticket?.number ?? null,
          root,
          registry,
          agent.id,
          result.brief.permissionLevel,
        );
        if (prepared.reason) throw new CoreTextError(prepared.reason);
        const { stage } = prepared;
        let brief = { ...prepared.brief, agent: agent.id };
        const id = state.id as string;
        const logs = prepareLogs(root);
        const setupMessages: CoreText[] = [];
        const setupFiles: string[] = [];
        if (inheritedAgents) setupFiles.push(`.scratch/${workItem.slug}/workflow.yaml`);
        let setupError: unknown;
        let setupFailed = false;
        try {
          ensureLocalIgnore(worktree.path);
          if (
            !workItem.stints.length &&
            typeof prepared.workItem.stages[stage.id]?.agent !== "string" &&
            writeFirstStintWorkflow(worktree.path, workItem, stage.id, agent.id)
          ) {
            setupFiles.push(`.scratch/${workItem.slug}/workflow.yaml`);
            setupMessages.push(
              coreText({ code: "stream.wroteWorkflow", params: { agent: agent.displayName } }),
            );
          }
          await commitStintworkSetup(worktree.path, workItem.slug, setupFiles);
        } catch (error) {
          setupFailed = true;
          setupError = error;
        }
        const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: worktree.path,
          encoding: "utf8",
        }).trim();
        if (stage.gate === "evidence" && !setupFailed) {
          const review = await prepareStintBrief(
            readProjectFiles,
            workItem.slug,
            ticket?.number ?? null,
            root,
            registry,
            agent.id,
            brief.permissionLevel,
          );
          if (review.reason) throw new CoreTextError(review.reason);
          brief = { ...review.brief, agent: agent.id };
        }
        const path = join(logs.directory, `${id}.jsonl`);
        const started: StintLogEntry = {
          type: "started",
          at: new Date().toISOString(),
          stint: {
            id,
            workItem: workItem.slug,
            stage: stage.id,
            ticket: ticket?.number ?? null,
            agent: agent.id,
            worktree,
            baseCommit,
            brief,
          },
        };
        writeFileSync(path, `${JSON.stringify(coreTextWire(started))}\n`, { flag: "wx" });
        activeStintIds.add(id);
        let sequence = 1;
        broadcast(
          coreTextWire({
            type: "stint",
            stintId: id,
            workItem: workItem.slug,
            sequence,
            entry: started,
          }) as StintLiveMessage,
        );
        refresh();
        function append(entry: StintLogEntry) {
          appendFileSync(path, `${JSON.stringify(coreTextWire(entry))}\n`);
          broadcast({
            type: "stint",
            stintId: id,
            workItem: workItem.slug,
            sequence: ++sequence,
            entry,
          });
        }
        if (selected) {
          const event = selected;
          const messages = [
            coreText({ code: `agent.source.${event.source}` }),
            coreText({ code: `agent.reason.${event.reason}` }),
            coreText({
              code: "agent.executableDetails",
              params: {
                path: event.executable?.path ?? "",
                version: event.executable?.version ?? "",
                adapter: event.adapterVersion ?? "",
              },
            }),
          ];
          for (const [index, text] of messages.entries())
            append({
              type: "event",
              at: new Date().toISOString(),
              event: {
                type: "message",
                id: `agent-preparation-${sequence}-${index}`,
                ...coreTextFields("text", text),
              },
            });
        }
        async function end(
          status: "finished" | "stopped" | "failed" | "interrupted",
          details: {
            stopReason?: string;
            error?: CoreText;
            handoff?: BriefHandoff | null;
            handoffError?: CoreText;
            findings?: ReviewFindings;
          } = {},
        ) {
          state.ending = true;
          permissions.clear(id);
          let checkpointCommit: string | undefined;
          let checkpointWarnings: CheckpointWarning[] = [];
          try {
            checkpointCommit = await createCheckpoint(
              worktree.path,
              {
                id,
                workItem: workItem.slug,
                ticket: ticket?.number ?? null,
                status,
              },
              (warnings) => {
                checkpointWarnings = warnings;
              },
            );
          } catch (error) {
            status = "failed";
            details.error = {
              text: [
                details.error?.text,
                `Checkpoint failed: ${error instanceof Error ? error.message : String(error)}`,
              ]
                .filter(Boolean)
                .join("\n"),
            };
          }
          try {
            checkpointWarnings.push(...committedRiskyPaths(worktree.path, baseCommit));
          } catch (error) {
            status = "failed";
            details.error = {
              text: [details.error?.text, `Cannot inspect stint commits: ${String(error)}`]
                .filter(Boolean)
                .join("\n"),
            };
          }
          activeStintIds.delete(id);
          if (stage.gate === "evidence" && !details.findings)
            details.findings = {
              commit: baseCommit,
              findings: null,
              error: coreText({ code: "stint.reviewEndedEarly" }).text,
            };
          const { error, handoffError, ...rest } = details;
          append({
            type: "ended",
            at: new Date().toISOString(),
            status,
            handoff: null,
            ...rest,
            ...(error ? coreTextFields("error", error) : {}),
            ...(handoffError ? coreTextFields("handoffError", handoffError) : {}),
            ...(checkpointCommit ? { checkpointCommit } : {}),
            ...(checkpointWarnings.length ? { checkpointWarnings } : {}),
          });
          active.delete(workItem.slug);
          refresh();
        }
        try {
          let setupMessage = 0;
          const progress = (text: CoreText) =>
            append({
              type: "event",
              at: new Date().toISOString(),
              event: {
                type: "message",
                id: `setup-${++setupMessage}`,
                ...coreTextFields("text", text),
              },
            });
          for (const text of setupMessages) progress(text);
          if (setupFailed) throw setupError;
          const previous = workItem.stints[0];
          await installWorktreeDependencies(
            worktree.path,
            progress,
            !!previous && ["failed", "interrupted", "stopped"].includes(previous.status),
            state.setupCancellation?.signal,
          );
          if (closing) throw new CoreTextError({ code: "server.stopping" });
          const additionalDirectories = agent.capabilities.additionalDirectories
            ? await worktreeGitDirectories(worktree.path)
            : undefined;
          state.setupCancellation?.signal.throwIfAborted();
          if (
            selected?.executable?.identity &&
            selected.executable.identity !==
              readExecutableIdentity(selected.executable.path)?.identity
          )
            throw new CoreTextError({ code: "agent.cliChanged" });
          state.handle = (options.launchAgent ?? agent.launch)({
            agent: agent.id,
            cwd: worktree.path,
            ...(preparedAgent
              ? { preparedAgent }
              : selected?.executable
                ? { nativeExecutable: selected.executable.path }
                : {}),
            ...(additionalDirectories ? { additionalDirectories } : {}),
            prompt: brief.prompt,
            permissionLevel: brief.permissionLevel,
            handoffTimeoutMs,
            ...(stage.gate === "evidence"
              ? { afterTurnRequests: [handoffRequest, findingsRequest] }
              : {}),
            onEvent: (event) => {
              append({ type: "event", at: new Date().toISOString(), event });
              if (event.type === "permission_request" || event.type === "permission") refresh();
            },
            onPermission: (request) =>
              closing
                ? Promise.resolve({ outcome: { outcome: "cancelled" as const } })
                : permissions.wait(id, request),
          });
          state.completion = state.handle.done
            .then(
              ({ stopReason, handoff, handoffError, findings, findingsError, findingsRawReply }) =>
                end(
                  closing
                    ? "interrupted"
                    : state.stopRequested
                      ? "stopped"
                      : stopReason === "end_turn" || stopReason === "cancelled"
                        ? "finished"
                        : "failed",
                  {
                    stopReason,
                    handoff: handoff ? { ...handoff, stint: id, agent: agent.id } : null,
                    ...(handoffError ? { handoffError: { text: handoffError } } : {}),
                    ...(stage.gate === "evidence"
                      ? {
                          findings: {
                            commit: baseCommit,
                            findings:
                              findings?.map((finding, index) => ({
                                ...finding,
                                id: `${id}:${index + 1}`,
                              })) ?? null,
                            ...(findings == null
                              ? {
                                  error:
                                    findingsError ??
                                    coreText({ code: "stint.findingsIncomplete" }).text,
                                }
                              : {}),
                            ...(findingsRawReply === undefined
                              ? {}
                              : { rawReply: findingsRawReply }),
                          },
                        }
                      : {}),
                    ...(!state.stopRequested &&
                    stopReason !== "end_turn" &&
                    stopReason !== "cancelled"
                      ? {
                          error: coreText({
                            code: "stint.stopReason",
                            params: { reason: stopReason },
                          }),
                        }
                      : {}),
                  },
                ),
              (error: unknown) => {
                if (error instanceof AgentAuthenticationError && agent.detectAvailability)
                  agent.availability = {
                    available: false,
                    kind: "login-required",
                    canStart: true,
                    selection: agent.availability?.selection,
                    installedIdentity: agent.availability?.installedIdentity,
                    reason: error.coreText,
                    checkedAt: new Date().toISOString(),
                  };
                return end(closing ? "interrupted" : "failed", {
                  error: errorText(error),
                });
              },
            )
            .catch((error: unknown) => {
              console.error("Could not record the end of a stint:", error);
            });
          await state.handle.ready;
          if (agent.detectAvailability) {
            agent.availability = {
              ...agent.availability,
              available: true,
              canStart: true,
              kind: undefined,
              reason: undefined,
              checkedAt: new Date().toISOString(),
            };
            send({ type: "availability", agent: agent.id, availability: agent.availability });
            refresh();
          }
        } catch (error) {
          const reason =
            state.stopRequested && !state.handle
              ? coreText({ code: "agent.preparationCancelled" })
              : errorText(error);
          if (state.completion) await state.completion;
          else
            await end(
              closing ? "interrupted" : state.stopRequested ? "stopped" : "failed",
              state.stopRequested
                ? {}
                : {
                    error: reason,
                  },
            );
          if (agent.detectAvailability && agent.availability?.kind !== "login-required")
            agent.availability = {
              ...agent.availability,
              available: false,
              canStart: true,
              kind: state.stopRequested ? "not-prepared" : "preparation-failed",
              reason,
            };
          send({ type: "availability", agent: agent.id, availability: agent.availability });
          refresh();
          return context.json(
            coreTextWire({
              reason,
            }),
            503,
          );
        }
        return context.json(coreTextWire({ stint: foldStintLog([started]) }), 201);
      } catch (error) {
        active.delete(workItem.slug);
        return context.json(
          coreTextWire({
            reason: state.stopRequested
              ? coreText({ code: "agent.preparationCancelled" })
              : errorText(error),
          }),
          503,
        );
      } finally {
        prepared();
      }
    };
    if (!streaming) return runStart();
    context.header("Content-Type", "application/x-ndjson");
    context.header("Cache-Control", "no-store");
    return stream(context, async (output) => {
      send = (message) => {
        void output.write(`${JSON.stringify(coreTextWire(message))}\n`).catch(() => {});
      };
      output.onAbort(() => {
        state.stopRequested = true;
        state.setupCancellation?.abort();
        void state.handle?.cancel();
      });
      send({ type: "starting", stintId: state.id });
      const response = await runStart();
      await output.write(
        `${JSON.stringify({ type: "result", status: response.status, body: await response.json() })}\n`,
      );
    });
  });
  return Object.assign(
    async () => {
      closing = true;
      permissions.clear();
      await Promise.all(
        [...active.values()].map(async (state) => {
          state.setupCancellation?.abort();
          await state.preparation;
          await state.handle?.cancel();
          await state.completion;
        }),
      );
    },
    { isActive: (slug: string) => active.has(slug) || workflowWrites.has(slug) },
  );
}
