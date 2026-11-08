// SPDX-License-Identifier: Apache-2.0
import {
  errorText,
  coreTextWire,
  coreText,
  briefAvailability,
  compileBrief,
  indexProject,
  readWorkflow,
  createMemoryRepoFiles,
  loadWorkflows,
  indexStints,
  pendingDeveloperNotes,
  parseReviewDeveloperNotes,
  stageAgent,
  projectPermissionLevel,
  permissionPolicy,
  type PermissionLevel,
  type DeveloperNote,
  type ProjectSnapshot,
} from "@stintwork/core";

import { type AgentRegistry, refreshAgentAvailability, findingsFormat } from "@stintwork/agents";
import type { Hono } from "hono";
import { changedSince, workItemDiff, worktreePath } from "@stintwork/git";
import {
  githubRateLimitCoolingDown,
  dependencyOnlyIncomplete,
  readGithubTickets,
  type createDetailPublisher,
} from "./github-tickets.js";
import { classifyGithubError, GithubReadError, type GithubDiscovery } from "./github-discovery.js";
import { requireCurrentGithubApproval } from "./github-gates.js";
import {
  githubSnapshotFiles,
  projectGithubGates,
  resolveGithubWorkflow,
} from "./github-snapshot.js";
import { githubGateIgnoresBody, githubGateIncludesTickets } from "./github-evidence-scope.js";

export type GithubBriefSource = {
  getGithub: () => GithubDiscovery | undefined;
  beginDetail: ReturnType<typeof createDetailPublisher>;
  readDetail?: typeof readGithubTickets;
  getSnapshot: () => ProjectSnapshot;
  discoveryFailed: () => boolean;
  verifyIdentity: (github: GithubDiscovery) => Promise<boolean>;
  detailFailed: (github: GithubDiscovery, number: number, error: unknown) => void;
  registerDetailIdentities: (
    github: GithubDiscovery,
    detail: Awaited<ReturnType<typeof readGithubTickets>>,
  ) => void;
  refresh: () => void;
  detailSucceeded?: (github: GithubDiscovery, number: number) => void;
};

import type { ProjectFilesReader } from "./work-item-files.js";

export function addBriefPreviewRoute(
  app: Hono,
  readProjectFiles: ProjectFilesReader,
  root: string,
  registry: AgentRegistry,
  refresh: () => void = () => {},
  githubSource?: GithubBriefSource,
) {
  app.get("/api/work-items/:slug/brief-preview", async (context) => {
    context.header("Cache-Control", "no-store");
    const result = await prepareStintBrief(
      readProjectFiles,
      context.req.param("slug"),
      null,
      root,
      registry,
      undefined,
      undefined,
      githubSource,
    );
    refresh();
    if ("reason" in result)
      return context.json(coreTextWire({ reason: result.reason }), result.status);
    return context.json(coreTextWire(result.brief));
  });
  app.get("/api/work-items/:slug/tickets/:ticket/brief-preview", async (context) => {
    context.header("Cache-Control", "no-store");
    const number = context.req.param("ticket");
    const result = await prepareStintBrief(
      readProjectFiles,
      context.req.param("slug"),
      /^\d+$/.test(number) ? Number(number) : NaN,
      root,
      registry,
      undefined,
      undefined,
      githubSource,
    );
    refresh();
    if ("reason" in result)
      return context.json(coreTextWire({ reason: result.reason }), result.status);
    return context.json(coreTextWire(result.brief));
  });
}

export async function prepareStintBrief(
  readProjectFiles: ProjectFilesReader,
  slug: string,
  number: number | null,
  root: string,
  registry: AgentRegistry,
  chosenAgent?: string,
  chosenLevel?: PermissionLevel,
  githubSource?: GithubBriefSource,
) {
  const project = readProjectFiles();
  const files = project.files;
  let snapshot = indexProject(files, { name: "" });
  const github = githubSource?.getGithub();
  const remote = github?.items.find((item) => slug === `github-${item.number}`);
  if (/^github-\d+$/.test(slug) && githubSource?.getSnapshot().github?.errorCode === "identity")
    return { reason: coreText({ code: "gate.identityAmbiguous" }), status: 409 as const };
  let ownDetail:
    | (Awaited<ReturnType<typeof readGithubTickets>> & { fetchedAt: string })
    | undefined;
  if (remote && github && githubSource) {
    if (
      !github.repositoryId ||
      github.errorCode === "identity" ||
      githubSource.getSnapshot().github?.errorCode === "identity"
    )
      return { reason: coreText({ code: "gate.identityAmbiguous" }), status: 409 as const };
    if (githubSource.discoveryFailed())
      return { reason: coreText({ code: "gate.detailUnavailable" }), status: 409 as const };
    if (githubRateLimitCoolingDown(github))
      return { reason: coreText({ code: "gate.detailUnavailable" }), status: 409 as const };
    remote.discoveryComplete ??= remote.complete;
    const publish = githubSource.beginDetail(remote.number);
    try {
      const detail = await (githubSource.readDetail ?? readGithubTickets)(
        root,
        github.repository,
        remote.id,
        remote.number,
      );
      if (!detail.complete && !dependencyOnlyIncomplete(detail))
        throw new GithubReadError("incomplete");
      githubSource.registerDetailIdentities(github, detail);
      ownDetail = { ...detail, fetchedAt: new Date().toISOString() };
      const published = publish(() => {
        remote.detail = ownDetail;
        remote.complete = (remote.discoveryComplete ?? remote.complete) && detail.complete;
        githubSource.detailSucceeded?.(github, remote.number);
      });
      if (!published)
        return { reason: coreText({ code: "gate.detailUnavailable" }), status: 409 as const };
    } catch (error) {
      publish(() => githubSource.detailFailed(github, remote.number, error));
      return {
        reason: coreText({
          code:
            classifyGithubError(error).code === "identity"
              ? "gate.identityAmbiguous"
              : "gate.detailUnavailable",
        }),
        status: 409 as const,
      };
    }
    if (!(remote.discoveryComplete ?? remote.complete))
      return { reason: coreText({ code: "gate.detailUnavailable" }), status: 409 as const };
    let valid = false;
    try {
      valid = await githubSource.verifyIdentity(github);
    } catch {
      /* Refuse unverified identity. */
    }
    githubSource.refresh();
    snapshot = githubSource.getSnapshot();
    const item = snapshot.workItems.find((entry) => entry.slug === slug);
    const relative = `.stintwork/github/${github.repository.toLowerCase()}/${remote.number}/workflow.yaml`;
    const record = resolveGithubWorkflow(project, relative, project.worktreePaths.get(slug));
    if (
      !valid ||
      snapshot.github?.errorCode === "identity" ||
      (record !== undefined && !item?.github?.bound)
    )
      return { reason: coreText({ code: "gate.identityAmbiguous" }), status: 409 as const };
    if (
      record !== undefined &&
      !readWorkflow(createMemoryRepoFiles({ [relative]: record }), relative, [], {
        ...loadWorkflows(files),
        workflows: snapshot.workflows,
      })
    )
      return { reason: coreText({ code: "gate.validWorkflowRequired" }), status: 409 as const };
    const ownGithub = {
      ...github,
      items: github.items.map((item) =>
        item.number === remote.number
          ? { ...item, detail: ownDetail, complete: item.discoveryComplete ?? item.complete }
          : item,
      ),
    };
    const ownItem = indexProject(githubSnapshotFiles(project, ownGithub), {
      name: "",
      github: ownGithub,
    }).workItems.find((item) => item.slug === slug);
    snapshot = {
      ...snapshot,
      github: ownGithub,
      workItems: snapshot.workItems.map((item) =>
        item.slug === slug && ownItem
          ? { ...item, tickets: ownItem.tickets, spec: ownItem.spec }
          : item,
      ),
    };
  }
  const workItem = snapshot.workItems.find((item) => item.slug === slug);
  if (!workItem)
    return { reason: coreText({ code: "server.workItemNotFound" }), status: 404 as const };
  const ticket =
    number === null ? null : workItem.tickets.find((candidate) => candidate.number === number);
  if (ticket === undefined)
    return { reason: coreText({ code: "server.ticketNotFound" }), status: 404 as const };
  const stage = snapshot.workflows[workItem.workflow]?.stages.find(
    (candidate) => candidate.id === workItem.stage,
  );
  const implementation =
    stage?.column === "implement" ||
    (workItem.workflow === undefined &&
      workItem.stage !== undefined &&
      ["implement", "fix", "do"].includes(workItem.stage));
  if (remote && ticket?.blocked)
    return {
      reason: ownDetail?.warnings.some(
        (warning) => warning === `Issue #${ticket.number}: text blockers unknown.`,
      )
        ? { text: ownDetail.warnings.join(" ") }
        : coreText({
            code: "brief.blockedBy",
            params: { tickets: ticket.blockedBy.map((n) => String(n).padStart(2, "0")).join(", ") },
          }),
      status: 409 as const,
    };
  if (remote && ticket && implementation && ["cancelled", "unknown"].includes(ticket.status))
    return {
      reason: coreText({
        code: ticket.status === "cancelled" ? "brief.ticketCancelled" : "brief.ticketUnknown",
      }),
      status: 409 as const,
    };
  const unavailable = briefAvailability(workItem, ticket, snapshot.workflows);
  if (unavailable)
    return {
      reason: unavailable,
      status: 409 as const,
    };
  if (remote && github && githubSource) {
    projectGithubGates(snapshot, root, project);
    const stages = snapshot.workflows[workItem.workflow].stages;
    const position = stages.findIndex((stage) => stage.id === workItem.stage);
    const labels = new Map(
      ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"].map(
        (role) => [role, role],
      ),
    );
    for (const line of (files.read("docs/agents/triage-labels.md") ?? "").split(/\r?\n/)) {
      const match = /^\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`/.exec(line);
      if (match && labels.has(match[1])) labels.set(match[1], match[2]);
    }
    for (const prior of stages
      .slice(0, position)
      .filter((stage) => stage.gate === "spec" || stage.gate === "tickets")) {
      const approval = await requireCurrentGithubApproval(
        project.worktreePaths.get(slug) ?? root,
        github.repository,
        remote.id,
        remote.number,
        githubGateIncludesTickets(stages, prior.id),
        [...labels.values()],
        workItem.stages[prior.id],
        (error) => githubSource.detailFailed(github, remote.number, error),
        githubGateIgnoresBody(stages, prior.id),
      );
      if (!approval.ok)
        return {
          reason: coreText({
            code:
              approval.code === "detail-unavailable"
                ? "gate.detailUnavailable"
                : "gate.evidenceChanged",
          }),
          status: 409 as const,
        };
      const projected = workItem.stages[prior.id]?.approved;
      if (
        !projected ||
        typeof projected !== "object" ||
        !("remoteState" in projected) ||
        projected.remoteState !== "current"
      )
        return { reason: coreText({ code: "gate.evidenceChanged" }), status: 409 as const };
    }
  }
  if (workItem.activeStint)
    return {
      reason: coreText({ code: "stint.alreadyActive" }),
      status: 409 as const,
    };
  if (!stage) return { reason: coreText({ code: "server.stageNotFound" }), status: 409 as const };
  const agent =
    chosenAgent ?? stageAgent(workItem, stage.id, [...registry.values()], snapshot.workflows);
  const registered = registry.get(agent);
  if (registered) await refreshAgentAvailability(registered);
  let permissionLevel: PermissionLevel;
  try {
    permissionLevel = chosenLevel ?? projectPermissionLevel(files.read(".stintwork/config"));
  } catch (error) {
    return { reason: errorText(error, true), status: 409 as const };
  }
  // Stints are newest first. Resume from this ticket's last stint; a ticket's first stint
  // starts from the work item's last stint instead (spec: "for that ticket, or the work item").
  const ended = workItem.stints.filter(
    (stint) => stint.status !== "running" && stint.status !== "preparation-failed",
  );
  const previous =
    number === null ? ended[0] : (ended.find((stint) => stint.ticket === number) ?? ended[0]);
  const checkpointCommit = previous?.checkpointCommit ?? null;
  let changedPaths: string[] = [];
  let reviewRange: { mergeBase: string; headCommit: string } | undefined;
  try {
    if (stage.gate === "evidence" && project.worktreePaths.has(slug))
      reviewRange = await workItemDiff(root, slug);
    if (checkpointCommit)
      changedPaths = await changedSince(
        project.worktreePaths.get(slug) ?? root,
        checkpointCommit,
        slug,
      );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      reason: coreText({
        code:
          stage.gate === "evidence" ? "server.reviewDiffFailed" : "server.checkpointCompareFailed",
        params: { detail },
      }),
      status: 503 as const,
    };
  }
  let reviewNotes: DeveloperNote[];
  try {
    reviewNotes =
      stage.column === "implement"
        ? parseReviewDeveloperNotes(files.read(`.scratch/${slug}/review.yaml`))
        : [];
  } catch (error) {
    return { reason: errorText(error, true), status: 409 as const };
  }
  const brief = compileBrief({
    files,
    workItem,
    stage,
    ticket,
    lastHandoff: previous?.handoff,
    developerNotes: pendingDeveloperNotes(
      indexStints(files).stints.filter((stint) => stint.workItem === slug),
      reviewNotes,
    ),
    checkpointCommit,
    changedPaths,
    reviewRange,
    ...(remote && github && ownDetail?.fetchedAt
      ? {
          github: {
            repository: github.repository,
            repositoryId: github.repositoryId,
            parent: { number: remote.number, id: remote.id, url: remote.url },
            ticket: ticket
              ? {
                  number: ticket.number,
                  id: ownDetail.tickets.find((t) => t.number === ticket.number)?.id ?? "",
                  url: ticket.path,
                }
              : null,
            blockers: ticket?.blockedBy ?? [],
            fetchedAt: ownDetail.fetchedAt,
            worktreePath:
              project.worktreePaths.get(slug) ??
              (await worktreePath(root, slug).catch(() => undefined)),
          },
        }
      : {}),
  });
  const policy = registered ? permissionPolicy(registered, permissionLevel) : undefined;
  return {
    workItem,
    ticket,
    stage,
    workflows: snapshot.workflows,
    brief: {
      ...brief,
      agent,
      permissionLevel,
      warnings: policy?.warnings ?? [],
      ...(stage.gate === "evidence"
        ? {
            prompt: `${brief.prompt}\n\nAfter-turn findings format for ${stage.skill}:\n${findingsFormat}`,
          }
        : {}),
    },
  };
}
