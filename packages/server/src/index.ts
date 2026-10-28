// SPDX-License-Identifier: Apache-2.0
import { coreText, coreTextWire, type Health, indexProject, type Warning } from "@stintwork/core";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { accessSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createAdaptorServer, type ServerType, upgradeWebSocket } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

import { createAgentRegistry, describeAgents } from "@stintwork/agents";
import { type FSWatcher, watch } from "chokidar";
import { Hono } from "hono";
import { WebSocket, WebSocketServer } from "ws";
import { addBriefPreviewRoute } from "./brief-preview.js";
import { addProjectPermissionRoute } from "./project-permissions.js";
import { createNodeRepoFiles } from "./repo-files.js";
import { addStintRoutes, type StintServerOptions } from "./stints.js";
import { createProjectFiles } from "./work-item-files.js";
import {
  addStintHistoryRoute,
  recoverInterruptedStints,
  projectStintPermissions,
} from "./stint-history.js";
import { addAgentAvailabilityRoute, refreshAgentRegistry } from "./agent-availability.js";
import { addHandoffAnswerRoute } from "./handoff-answers.js";
import { addWorkItemDiffRoute } from "./work-item-diff.js";
import { addCheckRoutes, createChecks } from "./checks.js";
import { createReviewEvidenceReader } from "./review-evidence.js";
import { addRoadmapRoute } from "./roadmap.js";
import { addWorkItemCreationRoutes } from "./create-work-item.js";
import { addSetupRoutes } from "./setup.js";
import {
  classifyGithubError,
  GithubReadError,
  validateGithubIdentities,
  discoverGithubWorkItems,
  githubOrigin,
  githubViewer,
  type GithubDiscovery,
} from "./github-discovery.js";
import { addWorkflowCustomisationRoutes } from "./customise-workflow.js";

export { createNodeRepoFiles } from "./repo-files.js";
export type { StintServerOptions } from "./stints.js";

export function createProjectServer(
  repoRoot: string,
  webRoot = fileURLToPath(new URL("../../web/dist/", import.meta.url)),
  options: StintServerOptions = {},
) {
  try {
    accessSync(join(webRoot, "index.html"));
  } catch (cause) {
    throw new Error("Built web app not found. Run pnpm build before starting Stintwork.", {
      cause,
    });
  }

  const root = resolve(repoRoot);
  const files = createNodeRepoFiles(root);
  const readProjectFiles = createProjectFiles(root, files);
  const name = basename(root);
  const agentRegistry = options.agentRegistry ?? createAgentRegistry();
  const checks = createChecks(
    root,
    (message) => {
      for (const client of websocket.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
      }
    },
    () => refresh(),
  );
  const readReviewEvidence = createReviewEvidenceReader(root, checks);
  let hasPermissionBinding = (_stintId: string, _requestId: string, _attemptId?: string) => false;
  let watchedPaths = new Set<string>();
  let github: GithubDiscovery | undefined;
  let cached: { viewer: string; origin: string; data: GithubDiscovery } | undefined;
  let knownRepository: { repository: string; repositoryId: string } | undefined;
  const knownIssues = new Map<number, string>();
  let discoveryRunning = false;
  function bindGithubIdentities(
    data: GithubDiscovery,
    project: ReturnType<typeof readProjectFiles>,
  ) {
    const worktreeNumbers = new Set(
      data.items
        .filter((item) => project.worktreePaths.has(`github-${item.number}`))
        .map((item) => item.number),
    );
    const mainFiles = {
      read: (path: string) => files.read(path),
      list: (prefix: string) =>
        files.list(prefix).filter((path) => {
          const number = /\/([1-9]\d*)\/workflow\.yaml$/.exec(path)?.[1];
          return !number || !worktreeNumbers.has(Number(number));
        }),
    };
    data = validateGithubIdentities(mainFiles, data);
    for (const item of data.items) {
      const worktree = project.worktreePaths.get(`github-${item.number}`);
      if (!worktree) continue;
      const worktreeFiles = createNodeRepoFiles(worktree);
      const path = `.stintwork/github/${data.repository.toLowerCase()}/${item.number}/workflow.yaml`;
      const exactFiles = {
        read: (name: string) => worktreeFiles.read(name),
        list: () => (worktreeFiles.read(path) === undefined ? [] : [path]),
      };
      const validated = validateGithubIdentities(exactFiles, { ...data, items: [item] });
      item.bound = validated.items[0].bound;
    }
    return data;
  }
  function readSnapshot(changedPaths?: readonly string[]) {
    let branch: string | undefined;
    let branchWarning: Warning | undefined;
    try {
      branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 1000,
      }).trim();
    } catch (error) {
      branchWarning = { path: ".git", message: `Cannot read project branch: ${String(error)}` };
    }
    const project = readProjectFiles(changedPaths);
    watchedPaths = new Set(project.watchPaths);
    let safeGithub = github;
    if (safeGithub?.repositoryId) {
      try {
        safeGithub = bindGithubIdentities(safeGithub, project);
      } catch {
        safeGithub = {
          ...safeGithub,
          items: [],
          complete: false,
          error: "GitHub identity is ambiguous. Developer resolution is required.",
          errorCode: "identity",
        };
      }
    }
    const snapshot = indexProject(project.files, {
      name,
      agents: describeAgents(agentRegistry),
      ...(safeGithub ? { github: safeGithub } : {}),
      ...(branch ? { branch } : {}),
    });
    readReviewEvidence(project, snapshot);
    for (const item of snapshot.workItems)
      if (item.activeStint)
        item.activeStint = projectStintPermissions(item.activeStint, hasPermissionBinding);
    for (const item of snapshot.attentionItems)
      if (
        item.kind === "permission" &&
        item.binding === "live" &&
        !hasPermissionBinding(item.stintId, item.requestId, item.attemptId)
      )
        item.binding = "reconnecting";
    snapshot.warnings.push(...project.warnings);
    if (branchWarning) snapshot.warnings.push(branchWarning);
    snapshot.warnings.push(...recoveryWarnings);
    return snapshot;
  }

  const recoveryWarnings: Warning[] = [];
  let snapshot = readSnapshot();
  let lastBroadcast = JSON.stringify(coreTextWire(snapshot));
  let watcher: FSWatcher | undefined;
  let watcherReady = false;
  let watcherWarning: Warning | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let settle: ReturnType<typeof setTimeout> | undefined;
  let metadataPoll: ReturnType<typeof setInterval> | undefined;
  const changedPaths = new Set<string>();
  let starting: Promise<ServerType> | undefined;
  let stopping: Promise<void> | undefined;
  const lifetime = new AbortController();
  const websocket = new WebSocketServer({ noServer: true });
  let websocketClosed = false;
  websocket.once("close", () => {
    websocketClosed = true;
  });
  websocket.on("connection", (socket) => {
    socket.on("error", () => socket.terminate());
    socket.send(JSON.stringify(coreTextWire(snapshot)));
  });

  function refresh(paths?: readonly string[]) {
    const previousPaths = watchedPaths;
    snapshot = readSnapshot(paths);
    for (const path of watchedPaths) {
      if (!previousPaths.has(path)) watcher?.add(path);
    }
    for (const path of previousPaths) {
      if (!watchedPaths.has(path)) void watcher?.unwatch(path);
    }
    if (watcherWarning) snapshot.warnings.push(watcherWarning);
    const message = JSON.stringify(coreTextWire(snapshot));
    // Refreshes can be triggered by events that change nothing visible (new watches reporting
    // their files, metadata probes); clients only hear about snapshots that actually changed.
    if (message === lastBroadcast) return;
    lastBroadcast = message;
    for (const client of websocket.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  }

  const app = new Hono();
  addProjectPermissionRoute(app, root, () => refresh());
  async function refreshGithub(loadMore = false) {
    if (snapshot.setup.tracker !== "github-issues") {
      github = undefined;
      return;
    }
    if (discoveryRunning || (github?.retryAt && Date.parse(github.retryAt) > Date.now())) return;
    discoveryRunning = true;
    let viewer: string | undefined;
    let origin: string | undefined;
    try {
      origin = await githubOrigin(root);
      viewer = await githubViewer(root);
      if (
        cached &&
        (cached.viewer !== viewer || cached.origin.toLowerCase() !== origin.toLowerCase())
      ) {
        cached = undefined;
        github = undefined;
        if (loadMore) throw new GithubReadError("identity");
      }
      const previous = github;
      let next = await discoverGithubWorkItems(root, loadMore ? (previous?.cursor ?? null) : null);
      if (
        knownRepository &&
        (knownRepository.repositoryId !== next.repositoryId ||
          knownRepository.repository.toLowerCase() !== next.repository.toLowerCase())
      )
        throw new GithubReadError("identity");
      for (const item of next.items) {
        const earlier = knownIssues.get(item.number);
        if (earlier && earlier !== item.id) throw new GithubReadError("identity");
      }
      next =
        loadMore && previous
          ? {
              ...next,
              items: [...previous.items, ...next.items].sort((a, b) => a.number - b.number),
              scanned: previous.scanned + next.scanned,
              pages: [...previous.pages, ...next.pages],
              warnings: [...previous.warnings, ...next.warnings],
              complete:
                !previous.error && previous.items.every((item) => item.complete) && next.complete,
            }
          : next;
      next = bindGithubIdentities(next, readProjectFiles());
      knownRepository ??= { repository: next.repository, repositoryId: next.repositoryId };
      for (const item of next.items) knownIssues.set(item.number, item.id);
      github = next;
      if (!github.error) {
        github = { ...github, fetchedAt: new Date().toISOString(), stale: false };
        cached = { viewer, origin, data: github };
      } else if (
        cached &&
        cached.viewer === viewer &&
        cached.origin.toLowerCase() === origin.toLowerCase()
      ) {
        github = {
          ...cached.data,
          stale: true,
          complete: false,
          error: github.error,
          errorCode: github.errorCode,
          ...(github.retryAt ? { retryAt: github.retryAt } : {}),
        };
      }
    } catch (error) {
      const failure = classifyGithubError(error);
      if (
        viewer &&
        origin &&
        cached?.viewer === viewer &&
        cached.origin.toLowerCase() === origin.toLowerCase()
      ) {
        github = {
          ...cached.data,
          stale: true,
          complete: false,
          error: failure.message,
          errorCode: failure.code,
          ...(failure.retryAt ? { retryAt: failure.retryAt } : {}),
        };
      } else
        github = {
          repository: "",
          repositoryId: "",
          items: [],
          scanned: 0,
          cursor: null,
          complete: false,
          pages: [],
          warnings: [],
          error: failure.message,
          errorCode: failure.code,
          ...(failure.retryAt ? { retryAt: failure.retryAt } : {}),
        };
    } finally {
      discoveryRunning = false;
    }
  }
  let initialization: Promise<void> | undefined;
  function initialize() {
    initialization ??= Promise.all([
      Promise.resolve().then(() => checks.recover()),
      recoverInterruptedStints(
        files,
        (stint, entries, valid, path) =>
          stopStints.recover(
            stint,
            entries,
            (warning) => recoveryWarnings.push(warning),
            valid,
            path,
          ),
        (warning) => recoveryWarnings.push(warning),
      ),
      refreshAgentRegistry(agentRegistry),
      refreshGithub(),
    ]).then(() => refresh());
    return initialization;
  }
  app.use("/api/*", async (context, next) => {
    try {
      await initialize();
    } catch (error) {
      return context.json(
        coreTextWire({
          reason: coreText({ code: "server.recoveryFailed", params: { detail: String(error) } }),
        }),
        503,
      );
    }
    await next();
  });
  const health: Health = { ok: true, repo: name };
  app.get("/api/health", (context) => context.json(coreTextWire(health)));
  app.get("/api/project", (context) => {
    context.header("Cache-Control", "no-store");
    return context.json(coreTextWire(snapshot));
  });
  app.post("/api/github/discovery/:action", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.text("Origin mismatch", 403);
    const action = context.req.param("action");
    if (
      snapshot.setup.tracker !== "github-issues" ||
      !["refresh", "load-more"].includes(action) ||
      (action === "load-more" && !github?.cursor)
    )
      return context.text("Discovery unavailable", 409);
    await refreshGithub(action === "load-more");
    refresh();
    return context.json(coreTextWire(snapshot));
  });
  addAgentAvailabilityRoute(app, agentRegistry, () => refresh());
  addBriefPreviewRoute(app, readProjectFiles, root, agentRegistry, refresh);
  addStintHistoryRoute(app, files, (...args) => hasPermissionBinding(...args));
  addHandoffAnswerRoute(app, root, readProjectFiles, refresh);
  addWorkItemDiffRoute(app, root, readProjectFiles);
  addRoadmapRoute(app, root, readProjectFiles, refresh);
  addWorkItemCreationRoutes(app, root, readProjectFiles, refresh);
  addWorkflowCustomisationRoutes(app, root, refresh);
  addSetupRoutes(app, root, files, agentRegistry, refresh, undefined, () => github);
  const stopStints = addStintRoutes(
    app,
    root,
    readProjectFiles,
    { ...options, agentRegistry },
    (message) => {
      for (const client of websocket.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
      }
    },
    refresh,
    checks.isActive,
    readReviewEvidence,
    (warning) => recoveryWarnings.push(warning),
  );
  hasPermissionBinding = stopStints.hasPermissionBinding;
  addCheckRoutes(app, checks, readProjectFiles, stopStints.isActive);
  const live = upgradeWebSocket(() => ({}));
  app.get("/api/live", async (context, next) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin) {
      return context.text("WebSocket origin must match the project server", 403);
    }
    if (context.req.header("upgrade")?.toLowerCase() !== "websocket") {
      return context.text("WebSocket upgrade required", 426);
    }
    return (await live(context, next)) ?? context.text("WebSocket upgrade required", 426);
  });
  app.use("/*", serveStatic({ root: webRoot }));

  const server = createAdaptorServer({ fetch: app.fetch, websocket: { server: websocket } });

  function start(): Promise<ServerType> {
    if (lifetime.signal.aborted) return Promise.reject(new Error("Project server is stopped"));
    starting ??= (async () => {
      await initialize();
      watcher = watch([...watchedPaths], {
        ignoreInitial: false,
        followSymlinks: false,
        ignored: (path, stat) => {
          if (stat?.isSymbolicLink()) return true;
          return ![...watchedPaths].some(
            (scope) =>
              path === scope ||
              path.startsWith(`${scope}${sep}`) ||
              scope.startsWith(`${path}${sep}`),
          );
        },
      });
      watcher.on("all", (_event, path) => {
        if (lifetime.signal.aborted || !watcherReady) return;
        if (![...watchedPaths].some((scope) => path === scope || path.startsWith(`${scope}${sep}`)))
          return;
        clearTimeout(debounce);
        changedPaths.add(path);
        debounce = setTimeout(() => {
          const paths = [...changedPaths];
          changedPaths.clear();
          refresh(paths);
          // A save can arrive as a truncate and a write that the OS reports as one event, so
          // the refresh above may have read a half-written file. Re-read once more shortly
          // after; refresh() only broadcasts if the snapshot actually changed.
          clearTimeout(settle);
          settle = setTimeout(() => {
            if (!lifetime.signal.aborted) refresh(paths);
          }, 400);
        }, 150);
      });
      watcher.on("error", (error) => {
        if (lifetime.signal.aborted) return;
        watcherWarning = { path: "", message: `File watcher error: ${String(error)}` };
        refresh([]);
      });
      try {
        await once(watcher, "ready", { signal: lifetime.signal });
        watcherReady = true;
        refresh();
        metadataPoll = setInterval(() => {
          if (!lifetime.signal.aborted && readProjectFiles.metadataChanged()) refresh([]);
        }, 150).unref();
        return server;
      } catch (error) {
        await stop();
        throw error;
      }
    })();
    return starting;
  }

  function stop(): Promise<void> {
    stopping ??= (async () => {
      lifetime.abort();
      clearTimeout(debounce);
      clearTimeout(settle);
      clearInterval(metadataPoll);
      try {
        const results = await Promise.allSettled([stopStints(), checks.stop()]);
        const failed = results.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
      } finally {
        for (const client of websocket.clients) client.terminate();
        await Promise.all([
          watcher?.close(),
          !websocketClosed
            ? new Promise<void>((resolve, reject) => {
                websocket.close((error) => (error ? reject(error) : resolve()));
              })
            : undefined,
          server.listening
            ? new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
              })
            : undefined,
        ]);
      }
    })().catch((error: unknown) => {
      stopping = undefined;
      throw error;
    });
    return stopping;
  }

  return { app, start, stop };
}
