import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AgentLauncher, type AgentStint, startAgentStint } from "@stintwork/agents";
import {
  foldStintLog,
  type RepoFiles,
  type StintLiveMessage,
  type StintLogEntry,
} from "@stintwork/core";
import { ensureWorktree } from "@stintwork/git";
import type { Hono } from "hono";
import { prepareStintBrief } from "./brief-preview.js";
import { addStintPermissionRoute } from "./stint-permissions.js";

export type StintServerOptions = { launchAgent?: AgentLauncher };

function prepareLogs(root: string) {
  let directory = root;
  for (const part of [".stintwork", "local", "stints"]) {
    directory = join(directory, part);
    const stat = lstatSync(directory, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
      throw new Error("Stint log directories must be real directories.");
    if (!stat) mkdirSync(directory);
  }
  const ignorePath = join(root, ".gitignore");
  const stat = lstatSync(ignorePath, { throwIfNoEntry: false });
  if (stat && (!stat.isFile() || stat.isSymbolicLink()))
    throw new Error(".gitignore must be a regular file.");
  const ignore = stat ? readFileSync(ignorePath, "utf8") : "";
  if (
    !ignore
      .split(/\r?\n/)
      .some((line) => line === ".stintwork/local/" || line === "/.stintwork/local/")
  ) {
    appendFileSync(
      ignorePath,
      `${ignore && !ignore.endsWith("\n") ? "\n" : ""}.stintwork/local/\n`,
    );
  }
  return directory;
}

export function addStintRoutes(
  app: Hono,
  root: string,
  files: RepoFiles,
  options: StintServerOptions,
  broadcast: (message: StintLiveMessage) => void,
  refresh: () => void,
) {
  const active = new Map<string, { handle?: AgentStint; completion?: Promise<void> }>();
  const permissions = addStintPermissionRoute(app);
  let closing = false;
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
    const result = prepareStintBrief(files, body.workItem, body.ticket as number);
    if ("reason" in result)
      return context.json({ reason: result.reason }, result.status === 404 ? 409 : result.status);
    const { workItem, ticket, stage, brief } = result;
    if (active.has(workItem.slug))
      return context.json({ reason: "A stint is already active for this work item." }, 409);
    const state: { handle?: AgentStint; completion?: Promise<void> } = {};
    active.set(workItem.slug, state);
    try {
      const worktree = await ensureWorktree(root, workItem.slug);
      if (closing) throw new Error("The project server is stopping.");
      const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: worktree.path,
        encoding: "utf8",
      }).trim();
      const id = randomUUID();
      const path = join(prepareLogs(root), `${id}.jsonl`);
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
      function end(
        status: "finished" | "stopped" | "failed" | "interrupted",
        details: { stopReason?: string; error?: string } = {},
      ) {
        permissions.clear(id);
        append({ type: "ended", at: new Date().toISOString(), status, ...details });
        active.delete(workItem.slug);
        refresh();
      }
      try {
        state.handle = (options.launchAgent ?? startAgentStint)({
          agent: "codex",
          cwd: worktree.path,
          prompt: brief.prompt,
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
            ({ stopReason }) =>
              end(
                closing
                  ? "interrupted"
                  : // "stopped" means the developer pressed Stop (ticket 05). An agent that ends
                    // its own turn with "cancelled" (Codex does when a permission request is
                    // declined) has finished its turn; the stop reason stays in the log.
                    stopReason === "end_turn" || stopReason === "cancelled"
                    ? "finished"
                    : "failed",
                { stopReason },
              ),
            (error: unknown) =>
              end(closing ? "interrupted" : "failed", {
                error: error instanceof Error ? error.message : String(error),
              }),
          )
          .catch((error: unknown) => {
            console.error("Could not record the end of a stint:", error);
          });
      } catch (error) {
        end("failed", { error: error instanceof Error ? error.message : String(error) });
      }
      return context.json({ stint: foldStintLog([started]) }, 201);
    } catch (error) {
      active.delete(workItem.slug);
      return context.json({ reason: error instanceof Error ? error.message : String(error) }, 503);
    }
  });
  return async () => {
    closing = true;
    permissions.clear();
    await Promise.all(
      [...active.values()].map(async (state) => {
        await state.handle?.cancel();
        await state.completion;
      }),
    );
  };
}
