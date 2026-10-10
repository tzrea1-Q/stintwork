import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  defaultCheckCommands,
  indexProject,
  isCheckExecution,
  latestCheckResults,
  readProjectConfig,
  type CheckExecution,
  type CheckLiveMessage,
  type WorkItemChecks,
} from "@stintwork/core";
import type { Hono } from "hono";
import { createNodeRepoFiles } from "./repo-files.js";
import type { ProjectFilesReader } from "./work-item-files.js";
import { readEvidenceChangedPaths } from "./review-evidence.js";

const excerptLimit = 8192;
function git(worktree: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: worktree,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function readRegular(root: string, path: string) {
  let absolute = root;
  for (const [index, part] of path.split("/").entries()) {
    absolute = join(absolute, part);
    const stat = lstatSync(absolute, { throwIfNoEntry: false });
    if (!stat) return undefined;
    if (
      stat.isSymbolicLink() ||
      (index < path.split("/").length - 1 ? !stat.isDirectory() : !stat.isFile())
    )
      throw new Error(`${path} must be a regular file in real directories.`);
  }
  return readFileSync(absolute, "utf8");
}
function commands(root: string) {
  const config = readProjectConfig(readRegular(root, ".stintwork/config"));
  if (config.checks !== undefined) return config.checks;
  const text = readRegular(root, "package.json");
  const declared = text === undefined ? undefined : JSON.parse(text)?.packageManager;
  const manager =
    typeof declared === "string" && /^(pnpm|npm|yarn)@/.test(declared)
      ? declared.split("@")[0]
      : readRegular(root, "pnpm-lock.yaml") !== undefined
        ? "pnpm"
        : readRegular(root, "yarn.lock") !== undefined
          ? "yarn"
          : "npm";
  return defaultCheckCommands(text, manager);
}
function prepareLog(root: string, id: string) {
  let directory = root;
  for (const part of [".stintwork", "local", "checks"]) {
    directory = join(directory, part);
    const stat = lstatSync(directory, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
      throw new Error("Check log directories must be real directories.");
    if (!stat) mkdirSync(directory);
  }
  return join(directory, `${id}.jsonl`);
}

export function createChecks(
  root: string,
  broadcast: (message: CheckLiveMessage) => void,
  refresh: () => void,
) {
  const files = createNodeRepoFiles(root);
  const active = new Map<
    string,
    { execution: CheckExecution; cancel: () => void; completion: Promise<void> }
  >();
  let closing = false;

  function history() {
    // ponytail: scan local logs per read; index them if long histories make refreshes slow.
    const executions: CheckExecution[] = [];
    for (const path of files
      .list(".stintwork/local/checks/")
      .filter((path) => path.endsWith(".jsonl"))) {
      let latest: CheckExecution | undefined;
      for (const line of (files.read(path) ?? "").split("\n").filter(Boolean)) {
        const entry: unknown = JSON.parse(line);
        if (isCheckExecution(entry)) latest = entry;
      }
      if (latest) executions.push(latest);
    }
    return executions.sort((first, second) => first.startedAt.localeCompare(second.startedAt));
  }
  function evidence(slug: string) {
    const executions = history().filter((execution) => execution.workItem === slug);
    const current = active.get(slug)?.execution;
    if (current) {
      const index = executions.findIndex(({ id }) => id === current.id);
      if (index >= 0) executions[index] = current;
      else executions.push(current);
    }
    return { checks: latestCheckResults(executions), checkExecution: current ?? null };
  }
  function recover() {
    for (const execution of history()) {
      if (execution.endedAt !== null || active.has(execution.workItem)) continue;
      execution.endedAt = new Date().toISOString();
      for (const result of execution.results)
        if (["pending", "running"].includes(result.status)) {
          result.status = "cancelled";
          result.outputExcerpt =
            `${result.outputExcerpt}\nChecks interrupted by a project server restart.`.slice(
              -excerptLimit,
            );
        }
      appendFileSync(prepareLog(root, execution.id), `${JSON.stringify(execution)}\n`);
    }
  }
  function start(slug: string, worktree: string): CheckExecution {
    if (closing) throw new Error("The project server is stopping.");
    if (active.has(slug)) throw new Error("Checks are already active for this work item.");
    if (git(worktree, "symbolic-ref", "--short", "HEAD") !== `stintwork/${slug}`)
      throw new Error("The worktree is not on the work item branch.");
    if (git(worktree, "status", "--porcelain", "--untracked-files=all"))
      throw new Error("Commit worktree changes before checking a commit.");
    const configured = commands(root);
    if (!configured.length) throw new Error("No checks are configured for this project.");
    const commit = git(worktree, "rev-parse", "HEAD");
    const execution: CheckExecution = {
      id: randomUUID(),
      workItem: slug,
      commit,
      startedAt: new Date().toISOString(),
      endedAt: null,
      results: configured.map((command) => ({
        ...command,
        commit,
        status: "pending",
        durationMs: 0,
        outputExcerpt: "",
      })),
    };
    const path = prepareLog(root, execution.id);
    writeFileSync(path, `${JSON.stringify(execution)}\n`, { flag: "wx", mode: 0o600 });
    let cancelled = false;
    let child: ChildProcess | undefined;
    let forceKilled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    function kill(signal: NodeJS.Signals) {
      if (!child?.pid) return;
      if (signal === "SIGKILL") {
        if (forceKilled) return;
        forceKilled = true;
      }
      try {
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
    function cancel() {
      cancelled = true;
      kill("SIGTERM");
      killTimer ??= setTimeout(() => kill("SIGKILL"), 500);
    }
    function publish(persist = true) {
      if (persist) appendFileSync(path, `${JSON.stringify(execution)}\n`);
      broadcast({ type: "checks", execution });
    }
    function unchanged() {
      if (
        git(worktree, "rev-parse", "HEAD") !== commit ||
        git(worktree, "status", "--porcelain", "--untracked-files=all")
      )
        throw new Error("The worktree changed during checks; commit the changes and check again.");
    }
    async function executeChecks() {
      for (const result of execution.results) {
        if (cancelled) {
          result.status = "cancelled";
          continue;
        }
        const started = performance.now();
        try {
          unchanged();
          result.status = "running";
          publish();
          child = spawn(result.command, {
            cwd: worktree,
            shell: true,
            detached: process.platform !== "win32",
            stdio: ["ignore", "pipe", "pipe"],
          });
          let outputError: unknown;
          const output = (text: string) => {
            result.outputExcerpt = (result.outputExcerpt + text).slice(-excerptLimit);
            try {
              appendFileSync(
                path,
                `${JSON.stringify({ type: "output", name: result.name, text })}\n`,
              );
              publish(false);
            } catch (error) {
              outputError = error;
              cancel();
            }
          };
          child.stdout?.setEncoding("utf8").on("data", output);
          child.stderr?.setEncoding("utf8").on("data", output);
          const code = await new Promise<number | null>((resolve, reject) => {
            child?.once("error", reject);
            child?.once("close", resolve);
          });
          if (outputError) throw outputError;
          if (!cancelled) {
            unchanged();
            if (code !== 0) throw new Error(`Command exited with status ${code ?? "signal"}.`);
          }
          result.status = cancelled ? "cancelled" : "passed";
        } catch (error) {
          result.status = cancelled ? "cancelled" : "failed";
          result.outputExcerpt =
            `${result.outputExcerpt}\n${error instanceof Error ? error.message : String(error)}`.slice(
              -excerptLimit,
            );
        } finally {
          if (cancelled) kill("SIGKILL");
          clearTimeout(killTimer);
          killTimer = undefined;
          child = undefined;
          result.durationMs = Math.round(performance.now() - started);
          publish();
        }
      }
    }
    const state = { execution, cancel, completion: Promise.resolve() };
    active.set(slug, state);
    publish(false);
    refresh();
    state.completion = executeChecks()
      .catch((error) => {
        for (const result of execution.results)
          if (["pending", "running"].includes(result.status)) {
            result.status = "failed";
            result.outputExcerpt = String(error).slice(-excerptLimit);
          }
      })
      .finally(() => {
        clearTimeout(killTimer);
        execution.endedAt = new Date().toISOString();
        try {
          publish();
        } finally {
          active.delete(slug);
          refresh();
        }
      });
    void state.completion.catch((error) => console.error("Could not record checks:", error));
    return execution;
  }
  return {
    evidence,
    recover,
    start,
    commands: () => commands(root),
    isActive: (slug: string) => active.has(slug),
    cancel: (slug: string) => {
      const state = active.get(slug);
      state?.cancel();
      return state?.execution;
    },
    stop: async () => {
      closing = true;
      for (const state of active.values()) state.cancel();
      await Promise.allSettled([...active.values()].map(({ completion }) => completion));
    },
  };
}

export function addCheckRoutes(
  app: Hono,
  checks: ReturnType<typeof createChecks>,
  readProjectFiles: ProjectFilesReader,
  isStintActive: (slug: string) => boolean,
) {
  app.use("/api/work-items/:slug/checks*", async (context, next) => {
    context.header("Cache-Control", "no-store");
    const origin = context.req.header("origin");
    if (context.req.method !== "GET" && origin && origin !== new URL(context.req.url).origin)
      return context.json({ reason: "Origin must match the project server." }, 403);
    await next();
  });
  function locate(slug: string) {
    const project = readProjectFiles();
    const failure = project.warnings.find(({ path }) => path === ".git");
    if (failure) return { reason: failure.message, status: 503 as const };
    if (!indexProject(project.files, { name: "" }).workItems.some((item) => item.slug === slug))
      return { reason: "Work item not found.", status: 404 as const };
    const worktree = project.worktreePaths.get(slug);
    return worktree
      ? { worktree }
      : { reason: "This work item has no worktree to check.", status: 409 as const };
  }
  app.get("/api/work-items/:slug/checks", (context) => {
    const slug = context.req.param("slug");
    const located = locate(slug);
    if ("reason" in located) return context.json({ reason: located.reason }, located.status);
    try {
      const body: WorkItemChecks = {
        headCommit: git(located.worktree, "rev-parse", "HEAD"),
        commands: checks.commands(),
        ...checks.evidence(slug),
      };
      body.evidenceChangedPaths = readEvidenceChangedPaths(
        located.worktree,
        body.headCommit,
        body.checks.map((result) => result.commit),
      );
      return context.json(body);
    } catch (error) {
      return context.json({ reason: String(error) }, 503);
    }
  });
  app.post("/api/work-items/:slug/checks", (context) => {
    const slug = context.req.param("slug");
    const located = locate(slug);
    if ("reason" in located) return context.json({ reason: located.reason }, located.status);
    if (isStintActive(slug))
      return context.json(
        { reason: "Finish or stop the active stint before checking a commit." },
        409,
      );
    try {
      return context.json({ execution: checks.start(slug, located.worktree) }, 202);
    } catch (error) {
      return context.json({ reason: String(error) }, 409);
    }
  });
  app.post("/api/work-items/:slug/checks/cancel", (context) => {
    const execution = checks.cancel(context.req.param("slug"));
    return execution
      ? context.json({ execution }, 202)
      : context.json({ reason: "No active checks for this work item." }, 409);
  });
}
