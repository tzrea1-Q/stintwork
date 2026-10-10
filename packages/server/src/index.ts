import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { accessSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createAdaptorServer, type ServerType, upgradeWebSocket } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Health, indexProject, type Warning } from "@stintwork/core";
import { type FSWatcher, watch } from "chokidar";
import { Hono } from "hono";
import { WebSocket, WebSocketServer } from "ws";
import { addBriefPreviewRoute } from "./brief-preview.js";
import { createNodeRepoFiles, projectPaths } from "./repo-files.js";
import { addStintRoutes, type StintServerOptions } from "./stints.js";
import { addStintHistoryRoute, recoverInterruptedStints } from "./stint-history.js";

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
  const name = basename(root);
  function readSnapshot() {
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
    const snapshot = indexProject(files, { name, ...(branch ? { branch } : {}) });
    if (branchWarning) snapshot.warnings.push(branchWarning);
    return snapshot;
  }

  let snapshot = readSnapshot();
  let watcher: FSWatcher | undefined;
  let watcherWarning: Warning | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let starting: Promise<ServerType> | undefined;
  let stopping: Promise<void> | undefined;
  const lifetime = new AbortController();
  const websocket = new WebSocketServer({ noServer: true });
  websocket.on("connection", (socket) => {
    socket.on("error", () => socket.terminate());
    socket.send(JSON.stringify(snapshot));
  });

  function refresh() {
    snapshot = readSnapshot();
    if (watcherWarning) snapshot.warnings.push(watcherWarning);
    const message = JSON.stringify(snapshot);
    for (const client of websocket.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  }

  const app = new Hono();
  let initialization: Promise<void> | undefined;
  function initialize() {
    initialization ??= recoverInterruptedStints(root, files).then(refresh);
    return initialization;
  }
  app.use("/api/*", async (context, next) => {
    try {
      await initialize();
    } catch (error) {
      return context.json({ reason: `Stint recovery failed: ${String(error)}` }, 503);
    }
    await next();
  });
  const health: Health = { ok: true, repo: name };
  app.get("/api/health", (context) => context.json(health));
  app.get("/api/project", (context) => {
    context.header("Cache-Control", "no-store");
    return context.json(snapshot);
  });
  addBriefPreviewRoute(app, files, root);
  addStintHistoryRoute(app, files);
  const stopStints = addStintRoutes(
    app,
    root,
    files,
    options,
    (message) => {
      for (const client of websocket.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
      }
    },
    refresh,
  );
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
    if (stopping) return Promise.reject(new Error("Project server is stopped"));
    starting ??= (async () => {
      await initialize();
      watcher = watch(root, {
        ignoreInitial: true,
        followSymlinks: false,
        ignored: (path, stat) => {
          if (stat?.isSymbolicLink()) return true;
          const repoPath = relative(root, path).split(sep).join("/");
          return (
            repoPath !== "" &&
            !projectPaths.some(
              (scope) =>
                repoPath === scope ||
                repoPath.startsWith(`${scope}/`) ||
                scope.startsWith(`${repoPath}/`),
            )
          );
        },
      });
      watcher.on("all", (_event, path) => {
        if (stopping) return;
        const repoPath = relative(root, path).split(sep).join("/");
        if (!projectPaths.some((scope) => repoPath === scope || repoPath.startsWith(`${scope}/`)))
          return;
        clearTimeout(debounce);
        debounce = setTimeout(refresh, 150);
      });
      watcher.on("error", (error) => {
        if (stopping) return;
        watcherWarning = { path: "", message: `File watcher error: ${String(error)}` };
        refresh();
      });
      try {
        await once(watcher, "ready", { signal: lifetime.signal });
        refresh();
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
      await stopStints();
      for (const client of websocket.clients) client.terminate();
      await Promise.all([
        watcher?.close(),
        new Promise<void>((resolve, reject) => {
          websocket.close((error) => (error ? reject(error) : resolve()));
        }),
        server.listening
          ? new Promise<void>((resolve, reject) => {
              server.close((error) => (error ? reject(error) : resolve()));
            })
          : undefined,
      ]);
    })();
    return stopping;
  }

  return { app, start, stop };
}
