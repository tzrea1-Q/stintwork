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
} from "@stintwork/agents";
import {
  foldStintLog,
  indexProject,
  agentUnavailableReason,
  builtInWorkflows,
  type BriefHandoff,
  type ReviewFindings,
  type StintLiveMessage,
  type StintLogEntry,
} from "@stintwork/core";
import {
  commitStintworkSetup,
  createCheckpoint,
  ensureWorktree,
  installWorktreeDependencies,
  worktreeGitDirectories,
} from "@stintwork/git";
import type { Hono } from "hono";
import { prepareStintBrief } from "./brief-preview.js";
import { isPermissionLevel, type PermissionLevel } from "@stintwork/core";
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
};

type ActiveStint = {
  id?: string;
  handle?: AgentStint;
  completion?: Promise<void>;
  preparation?: Promise<void>;
  setupCancellation?: AbortController;
  stopRequested?: boolean;
  ending?: boolean;
};

function prepareLogs(root: string) {
  let directory = root;
  for (const part of [".stintwork", "local", "stints"]) {
    directory = join(directory, part);
    const stat = lstatSync(directory, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
      throw new Error("Stint log directories must be real directories.");
    if (!stat) mkdirSync(directory);
  }
  return { directory, ignoreAdded: ensureLocalIgnore(root) };
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
  app.post("/api/stints/:stintId/stop", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json({ reason: "Origin must match the project server." }, 403);
    const id = context.req.param("stintId");
    const state = [...active.values()].find((candidate) => candidate.id === id);
    if (!state || state.ending)
      return context.json({ reason: "This stint is no longer running." }, 409);
    if (!state.stopRequested) {
      state.stopRequested = true;
      permissions.clear(id, false);
      state.setupCancellation?.abort();
      await state.handle?.cancel();
    }
    return context.json({ stintId: id }, 202);
  });
  app.post("/api/stints", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json({ reason: "Origin must match the project server." }, 403);
    if (
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json({ reason: "A JSON start request is required." }, 400);
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ reason: "Invalid JSON." }, 400);
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
        {
          reason: "Choose a work item, an optional positive ticket number and a registered agent.",
        },
        400,
      );
    }
    if ("agent" in body && !registry.has(body.agent as string))
      return context.json({ reason: `Agent is not registered: ${body.agent}.` }, 400);
    if (closing) return context.json({ reason: "The project server is stopping." }, 503);
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
      return context.json({ reason: result.reason }, result.status === 404 ? 409 : result.status);
    const { workItem, ticket } = result;
    const agentId = "agent" in body ? (body.agent as string) : result.brief.agent;
    const agent = registry.get(agentId);
    if (!agent) return context.json({ reason: `Agent is not registered: ${agentId}.` }, 400);
    await refreshAgentAvailability(agent);
    const unavailable = agentUnavailableReason(agent);
    if (unavailable) return context.json({ reason: unavailable }, 409);
    if (isChecking(workItem.slug))
      return context.json({ reason: "Cancel or finish checks before starting a stint." }, 409);
    if (active.has(workItem.slug) || stageAgents.isWriting(workItem.slug))
      return context.json({ reason: "A stint is already active for this work item." }, 409);
    if (
      indexProject(readProjectFiles().files, { name: "" }).workItems.find(
        ({ slug }) => slug === workItem.slug,
      )?.stage !== workItem.stage
    )
      return context.json(
        { reason: "The stage changed. Refresh the brief before starting a stint." },
        409,
      );
    const state: ActiveStint = { setupCancellation: new AbortController() };
    let prepared: () => void = () => {};
    state.preparation = new Promise<void>((resolvePreparation) => {
      prepared = resolvePreparation;
    });
    active.set(workItem.slug, state);
    try {
      const project = readProjectFiles();
      const discoveryFailure = project.warnings.find(({ path }) => path === ".git");
      if (discoveryFailure) throw new Error(discoveryFailure.message);
      const firstWorktree = !project.worktreePaths.has(workItem.slug);
      const worktree = await ensureWorktree(root, workItem.slug);
      if (closing) throw new Error("The project server is stopping.");
      let inheritedAgents = false;
      if (firstWorktree) {
        for (const stage of builtInWorkflows[workItem.workflow].stages) {
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
      if ("reason" in prepared) throw new Error(prepared.reason);
      const { stage } = prepared;
      let brief = { ...prepared.brief, agent: agent.id };
      const id = randomUUID();
      state.id = id;
      const logs = prepareLogs(root);
      const setupMessages: string[] = [];
      const setupFiles: string[] = [];
      if (inheritedAgents) setupFiles.push(`.scratch/${workItem.slug}/workflow.yaml`);
      let setupError: unknown;
      let setupFailed = false;
      try {
        if (logs.ignoreAdded)
          setupMessages.push("Added .stintwork/local/ to the project's .gitignore.\n");
        if (ensureLocalIgnore(worktree.path)) {
          setupFiles.push(".gitignore");
          setupMessages.push("Added .stintwork/local/ to the worktree's .gitignore.\n");
        }
        if (
          !workItem.stints.length &&
          typeof prepared.workItem.stages[stage.id]?.agent !== "string" &&
          writeFirstStintWorkflow(worktree.path, workItem, stage.id, agent.id)
        ) {
          setupFiles.push(`.scratch/${workItem.slug}/workflow.yaml`);
          setupMessages.push(
            `Wrote workflow.yaml with the workflow, stage and ${agent.displayName} for this stage.\n`,
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
      if (stage.id === "review" && !setupFailed) {
        const review = await prepareStintBrief(
          readProjectFiles,
          workItem.slug,
          ticket?.number ?? null,
          root,
          registry,
          agent.id,
          brief.permissionLevel,
        );
        if ("reason" in review) throw new Error(review.reason);
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
      writeFileSync(path, `${JSON.stringify(started)}\n`, { flag: "wx" });
      activeStintIds.add(id);
      let sequence = 1;
      broadcast({ type: "stint", stintId: id, workItem: workItem.slug, sequence, entry: started });
      refresh();
      function append(entry: StintLogEntry) {
        appendFileSync(path, `${JSON.stringify(entry)}\n`);
        broadcast({
          type: "stint",
          stintId: id,
          workItem: workItem.slug,
          sequence: ++sequence,
          entry,
        });
      }
      async function end(
        status: "finished" | "stopped" | "failed" | "interrupted",
        details: {
          stopReason?: string;
          error?: string;
          handoff?: BriefHandoff | null;
          handoffError?: string;
          findings?: ReviewFindings;
        } = {},
      ) {
        state.ending = true;
        permissions.clear(id);
        let checkpointCommit: string | undefined;
        try {
          checkpointCommit = await createCheckpoint(worktree.path, {
            id,
            workItem: workItem.slug,
            ticket: ticket?.number ?? null,
            status,
          });
        } catch (error) {
          status = "failed";
          details.error = [
            details.error,
            `Checkpoint failed: ${error instanceof Error ? error.message : String(error)}`,
          ]
            .filter(Boolean)
            .join("\n");
        }
        activeStintIds.delete(id);
        if (stage.id === "review" && !details.findings)
          details.findings = {
            commit: baseCommit,
            findings: null,
            error: "The Review stint ended before findings were collected.",
          };
        append({
          type: "ended",
          at: new Date().toISOString(),
          status,
          handoff: null,
          ...details,
          ...(checkpointCommit ? { checkpointCommit } : {}),
        });
        active.delete(workItem.slug);
        refresh();
      }
      try {
        let setupMessage = 0;
        const progress = (text: string) =>
          append({
            type: "event",
            at: new Date().toISOString(),
            event: { type: "message", id: `setup-${++setupMessage}`, text },
          });
        for (const message of setupMessages) progress(message);
        if (setupFailed) throw setupError;
        const previous = workItem.stints[0];
        await installWorktreeDependencies(
          worktree.path,
          progress,
          !!previous && ["failed", "interrupted", "stopped"].includes(previous.status),
          state.setupCancellation?.signal,
        );
        if (closing) throw new Error("The project server is stopping.");
        state.handle = (options.launchAgent ?? agent.launch)({
          agent: agent.id,
          cwd: worktree.path,
          ...(agent.capabilities.additionalDirectories
            ? { additionalDirectories: await worktreeGitDirectories(worktree.path) }
            : {}),
          prompt: brief.prompt,
          permissionLevel: brief.permissionLevel,
          handoffTimeoutMs,
          ...(stage.id === "review"
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
                  ...(handoffError ? { handoffError } : {}),
                  ...(stage.id === "review"
                    ? {
                        findings: {
                          commit: baseCommit,
                          findings:
                            findings?.map((finding, index) => ({
                              ...finding,
                              id: `${id}:${index + 1}`,
                            })) ?? null,
                          ...(findings == null
                            ? { error: findingsError ?? "The findings request did not complete." }
                            : {}),
                          ...(findingsRawReply === undefined ? {} : { rawReply: findingsRawReply }),
                        },
                      }
                    : {}),
                  ...(!state.stopRequested &&
                  stopReason !== "end_turn" &&
                  stopReason !== "cancelled"
                    ? { error: `Agent ended the stint with stop reason: ${stopReason}.` }
                    : {}),
                },
              ),
            (error: unknown) => {
              if (error instanceof AgentAuthenticationError && agent.detectAvailability)
                agent.availability = {
                  available: false,
                  kind: "login-required",
                  reason: error.message,
                  checkedAt: new Date().toISOString(),
                };
              return end(closing ? "interrupted" : "failed", {
                error: error instanceof Error ? error.message : String(error),
              });
            },
          )
          .catch((error: unknown) => {
            console.error("Could not record the end of a stint:", error);
          });
        await state.handle.ready;
      } catch (error) {
        const reason =
          state.stopRequested && !state.handle
            ? "Stint stopped during worktree setup."
            : error instanceof Error
              ? error.message
              : String(error);
        if (state.completion) await state.completion;
        else
          await end(
            closing ? "interrupted" : state.stopRequested ? "stopped" : "failed",
            state.stopRequested ? {} : { error: reason },
          );
        return context.json({ reason }, 503);
      }
      return context.json({ stint: foldStintLog([started]) }, 201);
    } catch (error) {
      active.delete(workItem.slug);
      return context.json({ reason: error instanceof Error ? error.message : String(error) }, 503);
    } finally {
      prepared();
    }
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
