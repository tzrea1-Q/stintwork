// SPDX-License-Identifier: Apache-2.0
import {
  coreText,
  coreTextFields,
  coreTextWire,
  type Health,
  indexProject,
  indexStints,
  type Warning,
} from "@stintwork/core";
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
  discoverGithubWorkItems,
  githubOrigin,
  githubViewer,
  githubLocalViewer,
  githubTrackerRepository,
  type GithubDiscovery,
} from "./github-discovery.js";
import {
  createDetailPublisher,
  githubRateLimitCoolingDown,
  readGithubTickets,
} from "./github-tickets.js";
import { projectLocalApprovals } from "./approval-head.js";
import {
  bindGithubIdentities,
  githubSnapshotFiles,
  projectGithubGates,
} from "./github-snapshot.js";
import { addGithubGateRoutes, verifyGithubGateIdentity } from "./github-gates.js";
import { addWorkflowCustomisationRoutes } from "./customise-workflow.js";

export { createNodeRepoFiles } from "./repo-files.js";
export type { StintServerOptions } from "./stints.js";

export function createProjectServer(
  repoRoot: string,
  webRoot = fileURLToPath(new URL("../../web/dist/", import.meta.url)),
  options: StintServerOptions & {
    githubViewerIntervalMs?: number;
    githubViewerTtlMs?: number;
    githubViewerRefreshLeadMs?: number;
    githubViewerNow?: () => number;
  } = {},
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
  let gateWriteActive = (_slug: string) => false;
  let watchedPaths = new Set<string>();
  let github: GithubDiscovery | undefined;
  let githubSource: { viewer: { id: number; login: string }; origin: string } | undefined;
  let cached:
    | { viewer: { id: number; login: string }; origin: string; data: GithubDiscovery }
    | undefined;
  let knownRepository: { repository: string; repositoryId: string } | undefined;
  const knownIssues = new Map<number, string>();
  function registerDetailIdentities(detail: Awaited<ReturnType<typeof readGithubTickets>>) {
    const identities = new Map<number, string>();
    for (const ticket of detail.tickets) {
      for (const reference of [{ number: ticket.number, id: ticket.id }, ...ticket.blockers]) {
        const prior = identities.get(reference.number) ?? knownIssues.get(reference.number);
        if (prior && prior !== reference.id) throw new GithubReadError("identity");
        identities.set(reference.number, reference.id);
      }
    }
    for (const [number, id] of identities) knownIssues.set(number, id);
  }
  let discoveryRunning = false;
  const detailRunning = new Set<number>();
  const handoffApprovals = new Map<string, string>();
  const sharedDetails = new Map<number, { read: Promise<number>; generation: number }>();
  const backgroundDetails = new Set<number>();
  const backgroundRunning = new Set<number>();
  const backgroundRetries = new Map<
    number,
    { attempts: number; timer: ReturnType<typeof setTimeout> }
  >();
  let discoveryRequested = false;
  let backgroundTimer: ReturnType<typeof setTimeout> | undefined;
  function drainBackgroundDetails() {
    if (lifetime.signal.aborted || discoveryRunning || discoveryRequested) return;
    for (const number of backgroundDetails) {
      if (githubRateLimitCoolingDown(github)) break;
      if (detailRunning.size >= 2) break;
      if (!github?.items.some((item) => item.number === number && item.detail?.stale)) {
        backgroundDetails.delete(number);
        continue;
      }
      if (gateWriteActive(`github-${number}`)) continue;
      backgroundDetails.delete(number);
      backgroundRunning.add(number);
      const generation = trackerGeneration;
      void refreshGithubDetail(number).then((status) => {
        backgroundRunning.delete(number);
        if (lifetime.signal.aborted || generation !== trackerGeneration) return;
        const item = github?.items.find((entry) => entry.number === number);
        const failure = item && detailFailures.get(item.id);
        const previous = backgroundRetries.get(number);
        if (previous) clearTimeout(previous.timer);
        if (
          (status === 429 ||
            (status === 503 &&
              failure &&
              ["offline", "server-error", "rate-limited"].includes(failure.code))) &&
          (previous?.attempts ?? 0) < 3 &&
          item?.detail?.stale
        ) {
          const attempts = (previous?.attempts ?? 0) + 1;
          const delay = Math.max(
            1000 * 2 ** (attempts - 1),
            github?.retryAt ? Date.parse(github.retryAt) - Date.now() : 0,
          );
          const timer = setTimeout(
            () => {
              if (backgroundRetries.get(number)?.timer !== timer) return;
              backgroundDetails.add(number);
              drainBackgroundDetails();
            },
            Math.min(delay, 2_147_483_647),
          );
          backgroundRetries.set(number, { attempts, timer });
        } else {
          backgroundRetries.delete(number);
        }
        drainBackgroundDetails();
      });
    }
    if (backgroundDetails.size && !backgroundTimer) {
      backgroundTimer = setTimeout(() => {
        backgroundTimer = undefined;
        drainBackgroundDetails();
      }, 1000);
    }
  }
  const pendingStintDetails = new Set<number>();
  const stintDetailTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const stintDetailAttempts = new Map<number, number>();
  function retryStintDetail(number: number, status: number) {
    if (lifetime.signal.aborted) return;
    if (status === 429 || (status === 503 && githubRateLimitCoolingDown(github))) {
      pendingStintDetails.add(number);
      return;
    }
    if (!pendingRecovery.has(number)) return;
    const needsDiscovery = status === 409 && !github?.items.some((item) => item.number === number);
    if ((status !== 503 && !needsDiscovery) || stintDetailTimers.has(number)) return;
    if (needsDiscovery && (github?.complete || github?.errorCode === "identity")) return;
    const attempts = stintDetailAttempts.get(number) ?? 0;
    const delay = [5_000, 30_000, 120_000, 300_000][Math.min(attempts, 3)];
    stintDetailAttempts.set(number, attempts + 1);
    stintDetailTimers.set(
      number,
      setTimeout(() => {
        stintDetailTimers.delete(number);
        if (needsDiscovery) {
          void refreshGithub(!!github?.cursor).then(() => {
            if (!github?.items.some((item) => item.number === number))
              retryStintDetail(number, 409);
          });
        } else {
          pendingStintDetails.add(number);
          drainStintDetails();
        }
      }, delay),
    );
  }
  function drainStintDetails() {
    if (lifetime.signal.aborted || discoveryRunning || detailRunning.size >= 3) return;
    const number = pendingStintDetails.values().next().value;
    if (number === undefined) return;
    if (github?.retryAt && githubRateLimitCoolingDown(github)) {
      if (!stintDetailTimers.has(number)) {
        const delay = Math.min(2_147_483_647, Math.max(1, Date.parse(github.retryAt) - Date.now()));
        stintDetailTimers.set(
          number,
          setTimeout(() => {
            stintDetailTimers.delete(number);
            drainStintDetails();
          }, delay),
        );
      }
      return;
    }
    pendingStintDetails.delete(number);
    void refreshGithubDetail(number)
      .then((status) => {
        retryStintDetail(number, status);
        drainStintDetails();
      })
      .catch((error: unknown) => {
        if (github) {
          failGithubDetail(github, number, error);
          refresh();
        }
        drainStintDetails();
      });
    drainStintDetails();
  }
  const detailFailures = new Map<string, GithubReadError>();
  let discoveryFailure:
    | Pick<GithubDiscovery, "error" | "errorCode" | "retryAt" | "retryable">
    | undefined;
  let viewerFailure: typeof discoveryFailure;
  function updateGithubFreshness() {
    if (!github) return;
    github.discoveryFailed = !!(discoveryFailure || viewerFailure);
    for (const item of github.items) item.detailFailed = detailFailures.has(item.id);
    const detailFailure = github.items.map((item) => detailFailures.get(item.id)).find(Boolean);
    const failure = discoveryFailure ?? viewerFailure ?? detailFailure;
    github.stale =
      (!!(discoveryFailure || viewerFailure) && !!githubSource) ||
      github.items.some((item) => item.detail?.stale || detailFailures.has(item.id));
    if (failure instanceof GithubReadError || failure?.error) {
      github.error = failure instanceof GithubReadError ? failure.message : failure.error;
      github.errorCode = failure instanceof GithubReadError ? failure.code : failure.errorCode;
    } else {
      delete github.error;
      delete github.errorCode;
    }
    const retryAt = [
      discoveryFailure?.errorCode === "rate-limited" ? discoveryFailure.retryAt : undefined,
      viewerFailure?.errorCode === "rate-limited" ? viewerFailure.retryAt : undefined,
      ...github.items.map((item) => {
        const failure = detailFailures.get(item.id);
        return failure?.code === "rate-limited" ? failure.retryAt : undefined;
      }),
    ]
      .filter((value): value is string => !!value)
      .sort()
      .at(-1);
    if (retryAt) {
      github.retryAt = retryAt;
      if (githubRateLimitCoolingDown(github)) viewerVerifiedAt = 0;
    } else delete github.retryAt;
  }
  function failGithubDetail(current: GithubDiscovery, number: number, error: unknown) {
    if (
      github !== current ||
      lifetime.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    )
      return;
    const item = current.items.find((entry) => entry.number === number);
    if (!item) return;
    const failure = classifyGithubError(error);
    if (failure.code === "identity") {
      delete item.detail;
      const cachedItem =
        cached?.viewer.id === githubSource?.viewer.id &&
        cached?.origin.toLowerCase() === githubSource?.origin.toLowerCase()
          ? cached?.data.items.find((entry) => entry.id === item.id && entry.number === item.number)
          : undefined;
      if (cachedItem) delete cachedItem.detail;
    }
    item.discoveryComplete ??= item.complete;
    item.complete = false;
    if (item.detail) item.detail.stale = true;
    detailFailures.set(item.id, failure);
    updateGithubFreshness();
  }
  function readSnapshot(changedPaths?: readonly string[], redactGithub = false) {
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
    if (safeGithub && redactGithub)
      safeGithub = {
        ...safeGithub,
        items: [],
        warnings: [],
        warningMessages: [],
        verifying: true,
        stale: true,
        discoveryFailed: true,
      };
    if (safeGithub?.repositoryId) {
      try {
        safeGithub = bindGithubIdentities(safeGithub, project);
      } catch {
        safeGithub = {
          ...safeGithub,
          items: [],
          complete: false,
          error: new GithubReadError("identity").message,
          errorCode: "identity",
        };
      }
    }
    const snapshot = indexProject(
      safeGithub ? githubSnapshotFiles(project, safeGithub) : project.files,
      {
        name,
        agents: describeAgents(agentRegistry),
        ...(safeGithub ? { github: safeGithub } : {}),
        ...(branch ? { branch } : {}),
      },
    );
    projectGithubGates(snapshot, root, project, handoffApprovals);
    projectLocalApprovals(snapshot, root, project);
    readReviewEvidence(project, snapshot);
    for (const item of snapshot.workItems) item.gateWriteActive = gateWriteActive(item.slug);
    snapshot.attentionItems = snapshot.attentionItems.filter(
      (item) => item.kind !== "gate-ready" || !gateWriteActive(item.workItem),
    );
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
  let viewerPoll: ReturnType<typeof setInterval> | undefined;
  let viewerChecking = false;
  let viewerVerifiedAt = 0;
  let offlineViewer = false;
  const viewerNow = options.githubViewerNow ?? Date.now;
  const viewerTtl = options.githubViewerTtlMs ?? 60_000;
  const viewerRefreshLead = options.githubViewerRefreshLeadMs ?? viewerTtl / 4;
  const localVerificationNeeded = () =>
    offlineViewer ||
    viewerFailure?.errorCode === "offline" ||
    viewerFailure?.errorCode === "server-error" ||
    githubRateLimitCoolingDown(github);
  const viewerFresh = () =>
    !githubRateLimitCoolingDown(github) &&
    viewerVerifiedAt > 0 &&
    viewerNow() - viewerVerifiedAt < viewerTtl;
  const viewerRefreshDue = () =>
    !viewerFresh() || viewerNow() - viewerVerifiedAt >= Math.max(0, viewerTtl - viewerRefreshLead);
  function publicSnapshot(offlineVerified = false) {
    return githubSource && !viewerFresh() && !(localVerificationNeeded() && offlineVerified)
      ? readSnapshot(undefined, true)
      : snapshot;
  }
  const changedPaths = new Set<string>();
  let starting: Promise<ServerType> | undefined;
  let stopping: Promise<void> | undefined;
  const lifetime = new AbortController();
  const websocket = new WebSocketServer({ noServer: true });
  const initializingSockets = new Set<WebSocket>();
  let websocketClosed = false;
  websocket.once("close", () => {
    websocketClosed = true;
  });
  websocket.on("connection", (socket) => {
    socket.on("error", () => socket.terminate());
    initializingSockets.add(socket);
    void (async () => {
      if (!viewerFresh()) await checkGithubViewer();
      const verified = await verifyOfflineViewer();
      initializingSockets.delete(socket);
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify(coreTextWire(publicSnapshot(verified))));
    })();
  });

  let trackerGeneration = 0;
  function clearGithub() {
    github = undefined;
    githubSource = undefined;
    cached = undefined;
    knownRepository = undefined;
    knownIssues.clear();
    handoffApprovals.clear();
    backgroundDetails.clear();
    for (const { timer } of backgroundRetries.values()) clearTimeout(timer);
    backgroundRetries.clear();
    clearTimeout(backgroundTimer);
    backgroundTimer = undefined;
    pendingStintDetails.clear();
    for (const timer of stintDetailTimers.values()) clearTimeout(timer);
    stintDetailTimers.clear();
    stintDetailAttempts.clear();
    discoveryFailure = undefined;
    detailFailures.clear();
    viewerVerifiedAt = 0;
    offlineViewer = false;
    viewerFailure = undefined;
  }

  let localViewerCheck: Promise<string> | undefined;
  function localViewer() {
    if (lifetime.signal.aborted) return Promise.resolve("");
    // Offline only the local login is available; token authentication cannot be verified from config.
    if ("GH_TOKEN" in process.env || "GITHUB_TOKEN" in process.env) return Promise.resolve("");
    localViewerCheck ??= githubLocalViewer(root)
      .catch(() => "")
      .finally(() => {
        localViewerCheck = undefined;
      });
    return localViewerCheck;
  }
  function clearGithubIdentity() {
    const retryAt = github?.retryAt;
    trackerGeneration++;
    clearGithub();
    const failure = new GithubReadError("identity");
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
      ...(retryAt ? { retryAt } : {}),
    };
    refresh();
  }
  function invalidateGithubIdentity() {
    const retained =
      github?.items
        .filter((item) => pendingRecovery.has(item.number))
        .map((item) => {
          const { detail: _detail, ...rest } = item;
          return { ...rest, complete: false };
        }) ?? [];
    clearGithub();
    const failure = new GithubReadError("identity");
    discoveryFailure = { error: failure.message, errorCode: failure.code, retryable: false };
    github = {
      repository: "",
      repositoryId: "",
      items: retained,
      scanned: 0,
      cursor: null,
      complete: false,
      pages: [],
      warnings: [],
      error: failure.message,
      errorCode: failure.code,
    };
    refresh();
  }
  async function verifyOfflineViewer(): Promise<boolean> {
    if (lifetime.signal.aborted || !localVerificationNeeded() || !githubSource) return false;
    const source = githubSource;
    const origin = await githubOrigin(root).catch(() => undefined);
    if (lifetime.signal.aborted || githubSource !== source || !localVerificationNeeded())
      return false;
    if (!origin) return false;
    if (origin.toLowerCase() !== source.origin.toLowerCase()) {
      if (githubRateLimitCoolingDown(github)) {
        clearGithubIdentity();
        return false;
      }
      trackerGeneration++;
      clearGithub();
      refresh();
      return false;
    }
    const local = await localViewer();
    if (lifetime.signal.aborted || githubSource !== source || !localVerificationNeeded())
      return false;
    if (local && local === source.viewer.login) return true;
    if (!local) return false;
    if (githubRateLimitCoolingDown(github)) {
      clearGithubIdentity();
      return false;
    }
    if (!offlineViewer) return false;
    trackerGeneration++;
    clearGithub();
    refresh();
    return false;
  }
  let identityCheck:
    | Promise<{ viewer: Awaited<ReturnType<typeof githubViewer>>; checkedAt: number }>
    | undefined;
  async function verifiedViewer() {
    if (!identityCheck) {
      const source = githubSource;
      const generation = trackerGeneration;
      identityCheck = githubViewer(root, lifetime.signal)
        .then(async (viewer) => {
          const checkedAt = viewerNow();
          const origin = source ? await githubOrigin(root).catch(() => undefined) : undefined;
          if (
            !lifetime.signal.aborted &&
            generation === trackerGeneration &&
            githubSource === source &&
            (!source ||
              (viewer.id === source.viewer.id &&
                viewer.login === source.viewer.login &&
                origin?.toLowerCase() === source.origin.toLowerCase()))
          )
            viewerVerifiedAt = checkedAt;
          return { viewer, checkedAt };
        })
        .finally(() => {
          identityCheck = undefined;
        });
    }
    return identityCheck;
  }
  let viewerCheck: Promise<void> | undefined;
  function checkGithubViewer() {
    if (lifetime.signal.aborted || !viewerRefreshDue() || githubRateLimitCoolingDown(github))
      return Promise.resolve();
    viewerCheck ??= runGithubViewerCheck().finally(() => {
      viewerCheck = undefined;
    });
    return viewerCheck;
  }
  async function runGithubViewerCheck() {
    const source = githubSource;
    if (
      viewerChecking ||
      lifetime.signal.aborted ||
      snapshot.setup.tracker !== "github-issues" ||
      !source
    )
      return;
    viewerChecking = true;
    refresh();
    try {
      const { viewer } = await verifiedViewer();
      if (
        !lifetime.signal.aborted &&
        githubSource === source &&
        (viewer.id !== source.viewer.id || viewer.login !== source.viewer.login)
      ) {
        trackerGeneration++;
        clearGithub();
        refresh();
        if (!discoveryRunning && !detailRunning.size) void refreshGithub().then(() => refresh());
      } else if (!lifetime.signal.aborted && githubSource === source) {
        const origin = await githubOrigin(root);
        if (lifetime.signal.aborted || githubSource !== source) return;
        if (origin.toLowerCase() !== source.origin.toLowerCase()) {
          trackerGeneration++;
          clearGithub();
          refresh();
          if (!discoveryRunning && !detailRunning.size) void refreshGithub().then(() => refresh());
          return;
        }
        source.viewer = viewer;
        if (cached?.viewer.id === viewer.id) cached.viewer = viewer;
        offlineViewer = false;
        viewerFailure = undefined;
        updateGithubFreshness();
        refresh();
      }
    } catch (error) {
      if (lifetime.signal.aborted || githubSource !== source) return;
      const failure = classifyGithubError(error);
      viewerVerifiedAt = 0;
      const wasOffline = offlineViewer;
      offlineViewer = wasOffline && (failure.code === "offline" || failure.code === "server-error");
      const currentViewerFailure = {
        error: failure.message,
        errorCode: failure.code,
        retryAt: failure.retryAt,
        retryable: true,
      };
      viewerFailure = currentViewerFailure;
      updateGithubFreshness();
      refresh();
      if (failure.code === "offline" || failure.code === "server-error") {
        const origin = await githubOrigin(root).catch(() => undefined);
        if (lifetime.signal.aborted || githubSource !== source) return;
        if (origin && origin.toLowerCase() !== source.origin.toLowerCase()) {
          trackerGeneration++;
          clearGithub();
          refresh();
          return;
        }
        const local = origin ? await localViewer() : "";
        if (lifetime.signal.aborted || githubSource !== source) return;
        if (wasOffline && local && local !== source.viewer.login) {
          trackerGeneration++;
          clearGithub();
          refresh();
          return;
        }
        offlineViewer = !!local && local === source.viewer.login;
      }
      if (failure.code === "login" || failure.code === "gh-missing") {
        trackerGeneration++;
        clearGithub();
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
        };
        viewerFailure = currentViewerFailure;
      }
      updateGithubFreshness();
      refresh();
    } finally {
      viewerChecking = false;
    }
  }

  function refresh(paths?: readonly string[], force = false) {
    const previousTracker = snapshot.setup.tracker;
    const previousPaths = watchedPaths;
    snapshot = readSnapshot(paths);
    if (previousTracker !== snapshot.setup.tracker) {
      trackerGeneration++;
      clearGithub();
      snapshot = readSnapshot(paths);
      if (snapshot.setup.tracker === "github-issues" && !discoveryRunning && !detailRunning.size)
        void refreshGithub().then(() => refresh());
    }
    for (const path of watchedPaths) {
      if (!previousPaths.has(path)) watcher?.add(path);
    }
    for (const path of previousPaths) {
      if (!watchedPaths.has(path)) void watcher?.unwatch(path);
    }
    if (watcherWarning) snapshot.warnings.push(watcherWarning);
    const message = JSON.stringify(coreTextWire(publicSnapshot()));
    // Refreshes can be triggered by events that change nothing visible (new watches reporting
    // their files, metadata probes); clients only hear about snapshots that actually changed.
    if (!force && message === lastBroadcast) return;
    lastBroadcast = message;
    for (const client of websocket.clients) {
      if (client.readyState === WebSocket.OPEN && !initializingSockets.has(client))
        client.send(message);
    }
    if (localVerificationNeeded() && websocket.clients.size)
      void verifyOfflineViewer().then((verified) => {
        if (!verified) return;
        const verifiedMessage = JSON.stringify(coreTextWire(publicSnapshot(true)));
        lastBroadcast = verifiedMessage;
        for (const client of websocket.clients)
          if (client.readyState === WebSocket.OPEN && !initializingSockets.has(client))
            client.send(verifiedMessage);
      });
  }

  const app = new Hono();
  addProjectPermissionRoute(app, root, () => refresh());
  async function refreshGithub(loadMore = false) {
    if (lifetime.signal.aborted) return;
    if (snapshot.setup.tracker !== "github-issues") {
      clearGithub();
      return;
    }
    if (discoveryRunning || detailRunning.size > 0 || githubRateLimitCoolingDown(github)) return;
    discoveryRunning = true;
    const generation = trackerGeneration;
    let viewer: Awaited<ReturnType<typeof githubViewer>> | undefined;
    let origin: string | undefined;
    const changedIssues = new Set<number>();
    let repositoryMismatch = false;
    try {
      if (
        lifetime.signal.aborted ||
        generation !== trackerGeneration ||
        githubRateLimitCoolingDown(github)
      )
        return;
      origin = await githubOrigin(root);
      if (lifetime.signal.aborted || generation !== trackerGeneration) return;
      if (githubSource && githubSource.origin.toLowerCase() !== origin.toLowerCase()) {
        clearGithub();
        refresh();
        if (loadMore) throw new GithubReadError("identity");
      }
      const verification = await verifiedViewer();
      viewer = verification.viewer;
      if (lifetime.signal.aborted || generation !== trackerGeneration) return;
      if (
        githubSource &&
        (githubSource.viewer.id !== viewer.id ||
          githubSource.viewer.login !== viewer.login ||
          githubSource.origin.toLowerCase() !== origin.toLowerCase())
      ) {
        clearGithub();
        if (loadMore) throw new GithubReadError("identity");
      }
      offlineViewer = false;
      viewerFailure = undefined;
      const previous = github;
      const priorDiscoveryFailure = discoveryFailure;
      let next = await discoverGithubWorkItems(
        root,
        loadMore ? (previous?.cursor ?? null) : null,
        true,
      );
      if (lifetime.signal.aborted || generation !== trackerGeneration) return;
      if (
        knownRepository &&
        (knownRepository.repositoryId !== next.repositoryId ||
          knownRepository.repository.toLowerCase() !== next.repository.toLowerCase())
      ) {
        repositoryMismatch = true;
        throw new GithubReadError("identity");
      }
      for (const item of next.items) {
        const earlier = knownIssues.get(item.number);
        if (earlier && earlier !== item.id) changedIssues.add(item.number);
      }
      if (changedIssues.size) throw new GithubReadError("identity");
      const retained =
        previous?.items.filter(
          (item) => !item.provisional || (next.retryable && next.cursor === previous.cursor),
        ) ?? [];
      const mergedItems = [
        ...new Map([...retained, ...next.items].map((item) => [item.id, item])).values(),
      ].sort((a, b) => a.number - b.number);
      next =
        loadMore && previous
          ? {
              ...next,
              items: mergedItems,
              scanned: previous.scanned + next.scanned,
              pages: [...previous.pages, ...next.pages],
              ...(previous.discardedPages || next.discardedPages
                ? {
                    discardedPages: [
                      ...(previous.discardedPages ?? []),
                      ...(next.discardedPages ?? []),
                    ],
                  }
                : {}),
              warnings: [...previous.warnings, ...next.warnings],
              warningMessages: [
                ...(previous.warningMessages ?? previous.warnings.map(() => null)),
                ...(next.warningMessages ?? next.warnings.map(() => null)),
              ],
              ...(previous.membershipIncomplete ||
              (priorDiscoveryFailure?.error && !priorDiscoveryFailure.retryable)
                ? { membershipIncomplete: true }
                : {}),
              ...((previous.membershipIncomplete ||
                (priorDiscoveryFailure?.error && !priorDiscoveryFailure.retryable)) &&
              !next.error
                ? {
                    error: "Results are incomplete; dependencies and approvals may be unknown.",
                    errorCode: "incomplete" as const,
                    membershipIncomplete: true,
                  }
                : {}),
              complete:
                !previous.membershipIncomplete &&
                (!priorDiscoveryFailure?.error || priorDiscoveryFailure.retryable === true) &&
                retained.every((item) => item.discoveryComplete ?? item.complete) &&
                next.complete,
            }
          : next;
      if (previous) {
        const previousItems = new Map(previous.items.map((item) => [item.number, item]));
        next.items = next.items.map((item) => {
          const earlier = previousItems.get(item.number);
          return earlier?.id === item.id && earlier.detail
            ? {
                ...item,
                discoveryComplete: item.discoveryComplete ?? item.complete,
                complete:
                  item.complete &&
                  earlier.detail.complete !== false &&
                  !detailFailures.has(earlier.id),
                detail: { ...earlier.detail, stale: true },
              }
            : item;
        });
      }
      next = bindGithubIdentities(next, readProjectFiles());
      knownRepository ??= { repository: next.repository, repositoryId: next.repositoryId };
      for (const item of next.items) knownIssues.set(item.number, item.id);
      github = next;
      for (const id of detailFailures.keys()) {
        if (!github.items.some((item) => item.id === id)) detailFailures.delete(id);
      }
      discoveryFailure = github.error
        ? {
            error: github.error,
            errorCode: github.errorCode,
            retryAt: github.retryAt,
            retryable: github.retryable,
          }
        : undefined;
      githubSource = { viewer, origin };
      viewerVerifiedAt = verification.checkedAt;
      if (!github.error) {
        github = { ...github, fetchedAt: new Date().toISOString(), stale: false };
        cached = { viewer, origin, data: github };
      } else if (
        github.retryable &&
        cached &&
        cached.viewer.id === viewer.id &&
        cached.origin.toLowerCase() === origin.toLowerCase()
      ) {
        github = {
          ...cached.data,
          items: [
            ...new Map(
              [...cached.data.items, ...github.items.filter((item) => item.provisional)].map(
                (item) => [item.id, item],
              ),
            ).values(),
          ].sort((a, b) => a.number - b.number),
          stale: true,
          complete: false,
          warnings: github.warnings,
          warningMessages: github.warningMessages,
          error: github.error,
          errorCode: github.errorCode,
          retryable: true,
          discardedPages: [
            ...(github.discardedPages ?? []),
            ...github.pages.slice(cached.data.pages.length),
          ],
          ...(github.retryAt ? { retryAt: github.retryAt } : {}),
        };
      }
    } catch (error) {
      if (lifetime.signal.aborted || generation !== trackerGeneration) return;
      const failure = classifyGithubError(error);
      if (repositoryMismatch) {
        invalidateGithubIdentity();
        return;
      }
      discoveryFailure = {
        error: failure.message,
        errorCode: failure.code,
        retryAt: failure.retryAt,
        retryable: failure.code !== "identity",
      };
      if (
        !viewer &&
        cached &&
        githubSource &&
        failure.code !== "login" &&
        failure.code !== "gh-missing"
      ) {
        viewerVerifiedAt = 0;
        const wasOffline = offlineViewer;
        offlineViewer = false;
        viewerFailure = { ...discoveryFailure };
        updateGithubFreshness();
        refresh();
        if (failure.code === "offline" || failure.code === "server-error") {
          const local = await localViewer();
          if (lifetime.signal.aborted || generation !== trackerGeneration) return;
          if (wasOffline && local && local !== githubSource.viewer.login) {
            trackerGeneration++;
            clearGithub();
            return;
          }
          offlineViewer = !!local && local === githubSource.viewer.login;
        }
        github = {
          ...cached.data,
          stale: true,
          complete: false,
          error: failure.message,
          errorCode: failure.code,
        };
      } else if (
        viewer &&
        origin &&
        cached?.viewer.id === viewer.id &&
        cached.origin.toLowerCase() === origin.toLowerCase()
      ) {
        githubSource = { viewer, origin };
        if (failure.code === "identity") {
          cached = {
            ...cached,
            data: {
              ...cached.data,
              items: cached.data.items.map((item) => {
                if (changedIssues.size && !changedIssues.has(item.number)) return item;
                const { detail: _detail, ...rest } = item;
                return rest;
              }),
            },
          };
        }
        github = {
          ...cached.data,
          stale: true,
          complete: false,
          error: failure.message,
          errorCode: failure.code,
          ...(failure.code !== "identity" ? { retryable: true } : {}),
          ...(failure.retryAt ? { retryAt: failure.retryAt } : {}),
        };
      } else {
        clearGithub();
        discoveryFailure = {
          error: failure.message,
          errorCode: failure.code,
          retryAt: failure.retryAt,
          retryable: failure.code !== "identity",
        };
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
      }
    } finally {
      if (generation !== trackerGeneration) clearGithub();
      updateGithubFreshness();
      discoveryRunning = false;
      refresh(undefined, true);
      if (generation !== trackerGeneration && snapshot.setup.tracker === "github-issues")
        void refreshGithub().then(() => refresh());
      for (const number of pendingRecovery.keys()) pendingStintDetails.add(number);
      drainStintDetails();
      if (!discoveryFailure && !viewerFailure && generation === trackerGeneration) {
        for (const item of github?.items ?? [])
          if (item.detail?.stale) backgroundDetails.add(item.number);
        drainBackgroundDetails();
      }
    }
  }
  const pendingRecovery = new Map<number, Array<() => void>>();
  const pendingRecoveryWarnings = new Map<number, Warning>();
  let initialization: Promise<void> | undefined;
  let localRecovery: Promise<void> | undefined;
  function initialize() {
    if (!initialization) {
      localRecovery = Promise.resolve().then(() => {
        recoverInterruptedStints(
          files,
          (stint, entries, valid, path) => {
            const match = /^github-([1-9]\d*)$/.exec(stint.workItem);
            if (snapshot.setup.tracker === "github-issues" && match && stint.ticket !== null) {
              const number = Number(match[1]);
              stopStints.recover(
                stint,
                entries,
                (warning) => recoveryWarnings.push(warning),
                valid,
                path,
                (signal) =>
                  new Promise<void>((resolve) => {
                    const finish = () => {
                      signal.removeEventListener("abort", finish);
                      const candidates = pendingRecovery
                        .get(number)
                        ?.filter((candidate) => candidate !== finish);
                      if (candidates?.length) pendingRecovery.set(number, candidates);
                      else {
                        pendingRecovery.delete(number);
                        pendingStintDetails.delete(number);
                        const timer = stintDetailTimers.get(number);
                        if (timer) clearTimeout(timer);
                        stintDetailTimers.delete(number);
                        stintDetailAttempts.delete(number);
                        const warning = pendingRecoveryWarnings.get(number);
                        if (warning) recoveryWarnings.splice(recoveryWarnings.indexOf(warning), 1);
                        pendingRecoveryWarnings.delete(number);
                      }
                      resolve();
                    };
                    const candidates = pendingRecovery.get(number) ?? [];
                    candidates.push(finish);
                    pendingRecovery.set(number, candidates);
                    if (!pendingRecoveryWarnings.has(number)) {
                      const warning = {
                        path,
                        ...coreTextFields(
                          "message",
                          coreText({
                            code: "recovery.blocked",
                            params: {
                              detail: "Recovery is waiting for verified GitHub item details.",
                            },
                          }),
                        ),
                      };
                      pendingRecoveryWarnings.set(number, warning);
                      recoveryWarnings.push(warning);
                    }
                    if (signal.aborted) finish();
                    else signal.addEventListener("abort", finish, { once: true });
                  }),
              );
            } else
              stopStints.recover(
                stint,
                entries,
                (warning) => recoveryWarnings.push(warning),
                valid,
                path,
              );
          },
          (warning) => recoveryWarnings.push(warning),
        );
      });
      initialization = Promise.all([
        Promise.resolve().then(() => checks.recover()),
        localRecovery.then(async () => {
          await refreshGithub();
          for (const number of pendingRecovery.keys()) pendingStintDetails.add(number);
          drainStintDetails();
        }),
        refreshAgentRegistry(agentRegistry),
      ]).then(() => refresh());
    }
    return initialization;
  }
  app.use("/api/*", async (context, next) => {
    try {
      const ready = initialize();
      if (
        context.req.method === "POST" &&
        /^\/api\/stints\/[^/]+\/stop$/.test(new URL(context.req.url).pathname)
      ) {
        void ready.catch(() => {});
        await localRecovery;
      } else await ready;
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
  app.use("/api/*", async (context, next) => {
    const path = new URL(context.req.url).pathname;
    if (
      githubRateLimitCoolingDown(github) &&
      githubSource &&
      (path === "/api/stints" || path.includes("/brief-preview") || path.includes("/gates/"))
    ) {
      if (!(await verifyOfflineViewer())) return context.json(coreTextWire(publicSnapshot()), 503);
    }
    await next();
  });
  app.use("/api/*", async (context, next) => {
    if (context.req.method !== "POST") return next();
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin) return next();
    const path = new URL(context.req.url).pathname;
    if (/^\/api\/stints\/[^/]+\/(?:stop|permissions\/[^/]+)$/.test(path)) return next();
    const workItem = /^\/api\/work-items\/(github-\d+)\//.exec(path)?.[1];
    const gate = /^\/api\/github\/items\/(\d+)\/gates\//.exec(path)?.[1];
    const stint = /^\/api\/stints\/([^/]+)\//.exec(path)?.[1];
    let slug = workItem ?? (gate ? `github-${gate}` : undefined);
    if (stint) slug = indexStints(files).stints.find((entry) => entry.id === stint)?.workItem;
    if (path === "/api/stints" || path === "/api/roadmap") {
      const body = await context.req.raw
        .clone()
        .json()
        .catch(() => undefined);
      if (body && typeof body.workItem === "string") slug = body.workItem;
    }
    const readOnlyShip = /\/ship\/(?:preview-pr|preview-merge-pr|pr-checks)$/.test(path);
    if (slug?.match(/^github-\d+$/) && !readOnlyShip) {
      const current = github;
      let valid = false;
      try {
        valid = !!current && (await githubBriefSource.verifyIdentity(current, true));
      } catch {
        // An unverified identity cannot authorize a write.
      }
      if (!valid)
        return context.json(
          coreTextWire({ reason: coreText({ code: "gate.identityAmbiguous" }), code: "identity" }),
          409,
        );
    }
    await next();
  });
  const health: Health = { ok: true, repo: name };
  app.get("/api/health", (context) => context.json(coreTextWire(health)));
  app.get("/api/project", async (context) => {
    context.header("Cache-Control", "no-store");
    if (viewerRefreshDue()) void checkGithubViewer();
    const result = publicSnapshot(await verifyOfflineViewer());
    return context.json(coreTextWire(result));
  });
  app.post("/api/github/discovery/:action", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.text("Origin mismatch", 403);
    const action = context.req.param("action");
    if (
      snapshot.setup.tracker !== "github-issues" ||
      !["refresh", "load-more"].includes(action) ||
      (action === "load-more" && !github?.cursor && !github?.retryable)
    )
      return context.text("Discovery unavailable", 409);
    if (
      discoveryRunning ||
      discoveryRequested ||
      [...detailRunning].some((number) => !backgroundRunning.has(number))
    )
      return context.text("Discovery busy", 409);
    discoveryRequested = true;
    try {
      await Promise.all([...backgroundRunning].map((number) => sharedDetails.get(number)?.read));
      await refreshGithub(action === "load-more");
    } finally {
      discoveryRequested = false;
      drainBackgroundDetails();
    }
    refresh();
    return context.json(coreTextWire(publicSnapshot()));
  });
  const beginDetail = createDetailPublisher();
  function refreshGithubDetail(number: number): Promise<number> {
    const existing = sharedDetails.get(number);
    if (existing)
      return existing.generation === trackerGeneration
        ? existing.read
        : existing.read.then(() => refreshGithubDetail(number));
    const read = readGithubDetail(number);
    sharedDetails.set(number, { read, generation: trackerGeneration });
    void read.finally(() => {
      if (sharedDetails.get(number)?.read === read) sharedDetails.delete(number);
    });
    return read;
  }
  async function readGithubDetail(number: number) {
    if (lifetime.signal.aborted) return 409;
    const item = github?.items.find((entry) => entry.number === number);
    if (
      !item ||
      !github ||
      !githubSource ||
      snapshot.setup.tracker !== "github-issues" ||
      detailRunning.has(number) ||
      detailRunning.size >= 3 ||
      discoveryRunning
    )
      return 409;
    if (githubRateLimitCoolingDown(github)) {
      return (await verifyOfflineViewer()) ? 429 : lifetime.signal.aborted ? 409 : 503;
    }
    detailRunning.add(number);
    const source = githubSource;
    const generation = trackerGeneration;
    const current = github;
    item.discoveryComplete ??= item.complete;
    let verified = false;
    let repositoryMismatch = false;
    let publish: ReturnType<typeof beginDetail> | undefined;
    try {
      if (lifetime.signal.aborted || generation !== trackerGeneration || githubSource !== source)
        return 409;
      if (githubRateLimitCoolingDown(github))
        return (await verifyOfflineViewer()) ? 429 : lifetime.signal.aborted ? 409 : 503;
      const currentOrigin = await githubOrigin(root);
      if (lifetime.signal.aborted || generation !== trackerGeneration || githubSource !== source)
        return 409;
      if (currentOrigin.toLowerCase() !== source.origin.toLowerCase()) {
        clearGithub();
        refresh();
        throw new GithubReadError("identity");
      }
      const viewer = viewerFresh() ? source.viewer : (await verifiedViewer()).viewer;
      if (
        currentOrigin.toLowerCase() !== githubSource.origin.toLowerCase() ||
        viewer.id !== githubSource.viewer.id ||
        viewer.login !== githubSource.viewer.login
      ) {
        clearGithub();
        throw new GithubReadError("identity");
      }
      offlineViewer = false;
      viewerFailure = undefined;
      updateGithubFreshness();
      verified = true;
      if (githubRateLimitCoolingDown(github)) return 429;
      publish = beginDetail(number);
      const [repositoryResult, detailResult] = await Promise.allSettled([
        githubTrackerRepository(root, true),
        readGithubTickets(root, current.repository, item.id, number),
      ]);
      if (repositoryResult.status === "rejected") throw repositoryResult.reason;
      const repository = repositoryResult.value;
      if (
        repository.repositoryId !== current.repositoryId ||
        repository.repository.toLowerCase() !== current.repository.toLowerCase()
      ) {
        repositoryMismatch = true;
        throw new GithubReadError("identity");
      }
      if (detailResult.status === "rejected") throw detailResult.reason;
      const detail = detailResult.value;
      if (github !== current || githubSource !== source) throw new GithubReadError("identity");
      registerDetailIdentities(detail);
      publish(() => {
        item.detail = { ...detail, fetchedAt: new Date().toISOString() };
        item.complete = (item.discoveryComplete ?? item.complete) && detail.complete;
        detailFailures.delete(item.id);
        updateGithubFreshness();
      });
      refresh(undefined, true);
      if (detail.complete) {
        const timer = stintDetailTimers.get(number);
        if (timer) clearTimeout(timer);
        stintDetailTimers.delete(number);
        stintDetailAttempts.delete(number);
        const candidates = pendingRecovery.get(number);
        pendingRecovery.delete(number);
        const warning = pendingRecoveryWarnings.get(number);
        if (warning) recoveryWarnings.splice(recoveryWarnings.indexOf(warning), 1);
        pendingRecoveryWarnings.delete(number);
        for (const adopt of candidates ?? []) adopt();
      } else retryStintDetail(number, 503);
      return 200;
    } catch (error) {
      if (
        lifetime.signal.aborted ||
        generation !== trackerGeneration ||
        (error instanceof Error && error.name === "AbortError")
      )
        return 409;
      const failure = classifyGithubError(error);
      if (failure.code === "identity") {
        if (pendingRecovery.has(number)) {
          const previous = pendingRecoveryWarnings.get(number);
          if (previous) recoveryWarnings.splice(recoveryWarnings.indexOf(previous), 1);
          const warning = {
            path: `.stintwork/local/stints`,
            ...coreTextFields(
              "message",
              coreText({ code: "recovery.blocked", params: { detail: failure.message } }),
            ),
          };
          pendingRecoveryWarnings.set(number, warning);
          recoveryWarnings.push(warning);
        }
        if (repositoryMismatch && github === current) {
          invalidateGithubIdentity();
          return 503;
        }
        if (pendingRecovery.has(number) && verified && github === current) {
          current.error = failure.message;
          current.errorCode = "identity";
          current.complete = false;
          current.stale = true;
        }
        pendingStintDetails.delete(number);
        const timer = stintDetailTimers.get(number);
        if (timer) clearTimeout(timer);
        stintDetailTimers.delete(number);
        stintDetailAttempts.delete(number);
      }
      if (
        !verified &&
        failure.code !== "login" &&
        failure.code !== "gh-missing" &&
        failure.code !== "identity"
      ) {
        viewerVerifiedAt = 0;
        const wasOffline = offlineViewer;
        offlineViewer = false;
        viewerFailure = {
          error: failure.message,
          errorCode: failure.code,
          retryAt: failure.retryAt,
          retryable: true,
        };
        updateGithubFreshness();
        refresh();
        if (failure.code === "offline" || failure.code === "server-error") {
          const local = await localViewer();
          if (
            lifetime.signal.aborted ||
            generation !== trackerGeneration ||
            githubSource !== source
          )
            return 409;
          if (wasOffline && local && local !== source.viewer.login) {
            trackerGeneration++;
            clearGithub();
            return 409;
          }
          offlineViewer = !!local && local === source.viewer.login;
        }
        updateGithubFreshness();
      } else if (!verified) clearGithub();
      if (github) {
        if (publish) publish(() => failGithubDetail(current, number, failure));
        else failGithubDetail(current, number, failure);
      } else {
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
      }
      return 503;
    } finally {
      detailRunning.delete(number);
      refresh(undefined, true);
      if (
        generation !== trackerGeneration &&
        github?.errorCode !== "identity" &&
        snapshot.setup.tracker === "github-issues"
      )
        void refreshGithub().then(() => refresh());
      drainStintDetails();
    }
  }
  app.post("/api/github/items/:number/refresh", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.text("Origin mismatch", 403);
    const status = await refreshGithubDetail(Number(context.req.param("number")));
    if (status === 409) return context.text("Work item unavailable", 409);
    if (status === 429)
      return context.json(
        coreTextWire({
          ...publicSnapshot(),
          reason: new GithubReadError("rate-limited", github?.retryAt).message,
        }),
        429,
      );
    return context.json(coreTextWire(publicSnapshot()), status as 200 | 429 | 503);
  });
  addAgentAvailabilityRoute(app, agentRegistry, () => refresh());
  const githubBriefSource = {
    beginDetail,
    getGithub: () => github,
    getSnapshot: () => snapshot,
    discoveryFailed: () => !!(discoveryFailure || viewerFailure),
    verifyIdentity: async (expected: GithubDiscovery, fresh = false) => {
      const source = githubSource;
      if (!source || github !== expected) return false;
      const valid = await verifyGithubGateIdentity(
        root,
        expected,
        source,
        lifetime.signal,
        async () =>
          fresh
            ? githubViewer(root, lifetime.signal)
            : viewerFresh()
              ? source.viewer
              : (await verifiedViewer()).viewer,
      );
      if (!valid && github === expected && githubSource === source) invalidateGithubIdentity();
      return valid && github === expected && githubSource === source;
    },
    detailFailed: failGithubDetail,
    registerDetailIdentities: (
      current: GithubDiscovery,
      detail: Awaited<ReturnType<typeof readGithubTickets>>,
    ) => {
      if (github !== current) throw new GithubReadError("identity");
      registerDetailIdentities(detail);
    },
    detailSucceeded: (current: GithubDiscovery, number: number) => {
      if (github !== current) return;
      const item = current.items.find((entry) => entry.number === number);
      if (item) detailFailures.delete(item.id);
      updateGithubFreshness();
    },
    refresh,
  };
  addBriefPreviewRoute(app, readProjectFiles, root, agentRegistry, refresh, githubBriefSource);
  addStintHistoryRoute(app, files, (...args) => hasPermissionBinding(...args));
  addWorkItemDiffRoute(app, root, readProjectFiles, () => snapshot);
  addRoadmapRoute(app, root, readProjectFiles, refresh, () => snapshot);
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
    githubBriefSource,
    async (number) => {
      pendingStintDetails.add(number);
      drainStintDetails();
    },
  );
  gateWriteActive = (slug) => stopStints.workflowWrites.has(slug) || checks.isActive(slug);
  addHandoffAnswerRoute(
    app,
    root,
    readProjectFiles,
    refresh,
    (slug) => stopStints.isActive(slug) || checks.isActive(slug),
    stopStints.workflowWrites,
    () => snapshot,
  );
  addGithubGateRoutes(
    app,
    root,
    () => github,
    () => snapshot,
    readProjectFiles,
    refresh,
    (slug) => stopStints.isActive(slug) || checks.isActive(slug),
    stopStints.workflowWrites,
    async (expected) => {
      const source = githubSource;
      if (!source || github !== expected) return false;
      const valid = await verifyGithubGateIdentity(
        root,
        expected,
        source,
        lifetime.signal,
        async () => (await verifiedViewer()).viewer,
      );
      if (!valid && github === expected && githubSource === source) invalidateGithubIdentity();
      return valid && github === expected && githubSource === source;
    },
    failGithubDetail,
    readReviewEvidence,
    () => githubBriefSource.discoveryFailed() || githubRateLimitCoolingDown(github),
  );
  hasPermissionBinding = stopStints.hasPermissionBinding;
  addCheckRoutes(app, checks, readProjectFiles, stopStints.isActive, () => snapshot);
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
      if (lifetime.signal.aborted) throw new Error("Project server is stopped");
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
        if (lifetime.signal.aborted) throw new Error("Project server is stopped");
        watcherReady = true;
        refresh();
        metadataPoll = setInterval(() => {
          if (!lifetime.signal.aborted && readProjectFiles.metadataChanged()) refresh([]);
        }, 150).unref();
        viewerPoll = setInterval(
          () => {
            if ([...websocket.clients].some((client) => client.readyState === WebSocket.OPEN))
              void checkGithubViewer();
          },
          options.githubViewerIntervalMs ?? Math.max(1, Math.min(15_000, viewerRefreshLead / 2)),
        ).unref();
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
      for (const { timer } of backgroundRetries.values()) clearTimeout(timer);
      backgroundRetries.clear();
      clearTimeout(debounce);
      clearTimeout(settle);
      clearInterval(metadataPoll);
      clearInterval(viewerPoll);
      clearTimeout(backgroundTimer);
      for (const timer of stintDetailTimers.values()) clearTimeout(timer);
      stintDetailTimers.clear();
      try {
        const results = await Promise.allSettled([stopStints(), checks.stop(), viewerCheck]);
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
