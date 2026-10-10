import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AgentLauncher, type AgentStint, startAgentStint } from "@stintwork/agents";
import {
  foldStintLog,
  type BriefHandoff,
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
import { addStintPermissionRoute } from "./stint-permissions.js";
import type { ProjectFilesReader } from "./work-item-files.js";
import { activeStintIds } from "./stint-history.js";
import { ensureLocalIgnore, writeFirstStintWorkflow } from "./stint-repo-writes.js";

export type StintServerOptions = { launchAgent?: AgentLauncher; handoffTimeoutMs?: number };

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
) {
  const handoffTimeoutMs = options.handoffTimeoutMs ?? 90_000;
  if (!Number.isFinite(handoffTimeoutMs) || handoffTimeoutMs < 0)
    throw new Error("Handoff timeout must be a non-negative number of milliseconds.");
  const active = new Map<string, ActiveStint>();
  const permissions = addStintPermissionRoute(app);
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
      permissions.clear(id);
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
      !("ticket" in body) ||
      !Number.isSafeInteger(body.ticket) ||
      !("agent" in body) ||
      body.agent !== "codex"
    ) {
      return context.json({ reason: "Choose a work item, ticket number and Codex." }, 400);
    }
    if (closing) return context.json({ reason: "The project server is stopping." }, 503);
    const result = await prepareStintBrief(
      readProjectFiles,
      body.workItem,
      body.ticket as number,
      root,
    );
    if ("reason" in result)
      return context.json({ reason: result.reason }, result.status === 404 ? 409 : result.status);
    const { workItem, ticket } = result;
    if (active.has(workItem.slug))
      return context.json({ reason: "A stint is already active for this work item." }, 409);
    const state: ActiveStint = { setupCancellation: new AbortController() };
    let prepared: () => void = () => {};
    state.preparation = new Promise<void>((resolvePreparation) => {
      prepared = resolvePreparation;
    });
    active.set(workItem.slug, state);
    try {
      const worktree = await ensureWorktree(root, workItem.slug);
      if (closing) throw new Error("The project server is stopping.");
      const prepared = await prepareStintBrief(
        readProjectFiles,
        workItem.slug,
        ticket.number,
        root,
      );
      if ("reason" in prepared) throw new Error(prepared.reason);
      const { brief, stage } = prepared;
      const id = randomUUID();
      state.id = id;
      const logs = prepareLogs(root);
      const setupMessages: string[] = [];
      const setupFiles: string[] = [];
      let setupError: unknown;
      let setupFailed = false;
      try {
        if (logs.ignoreAdded) setupMessages.push("Added .stintwork/local/ to the project's .gitignore.\n");
        if (ensureLocalIgnore(worktree.path)) {
          setupFiles.push(".gitignore");
          setupMessages.push("Added .stintwork/local/ to the worktree's .gitignore.\n");
        }
        if (!workItem.stints.length && writeFirstStintWorkflow(worktree.path, workItem, stage.id)) {
          setupFiles.push(`.scratch/${workItem.slug}/workflow.yaml`);
          setupMessages.push("Wrote workflow.yaml with the workflow, stage and Codex for this stage.\n");
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
      const path = join(logs.directory, `${id}.jsonl`);
      const started: StintLogEntry = {
        type: "started",
        at: new Date().toISOString(),
        stint: {
          id,
          workItem: workItem.slug,
          stage: stage.id,
          ticket: ticket.number,
          agent: "codex",
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
        details: { stopReason?: string; error?: string; handoff?: BriefHandoff | null } = {},
      ) {
        state.ending = true;
        permissions.clear(id);
        let checkpointCommit: string | undefined;
        try {
          checkpointCommit = await createCheckpoint(worktree.path, {
            id,
            workItem: workItem.slug,
            ticket: ticket.number,
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
        state.handle = (options.launchAgent ?? startAgentStint)({
          agent: "codex",
          cwd: worktree.path,
          additionalDirectories: await worktreeGitDirectories(worktree.path),
          prompt: brief.prompt,
          handoffTimeoutMs,
          onEvent: (event) => {
            if (event.type === "permission" && event.requestId)
              permissions.clearRequest(event.requestId);
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
            ({ stopReason, handoff }) =>
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
                  handoff: handoff ? { ...handoff, stint: id, agent: "codex" } : null,
                  ...(!state.stopRequested &&
                  stopReason !== "end_turn" &&
                  stopReason !== "cancelled"
                    ? { error: `Agent ended the stint with stop reason: ${stopReason}.` }
                    : {}),
                },
              ),
            (error: unknown) =>
              end(closing ? "interrupted" : "failed", {
                error: error instanceof Error ? error.message : String(error),
              }),
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
  return async () => {
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
  };
}
