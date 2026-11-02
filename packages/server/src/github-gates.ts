// SPDX-License-Identifier: Apache-2.0
import {
  coreText,
  coreTextWire,
  errorText,
  githubEvidenceDigest,
  githubEvidenceDigestV2,
  githubTicketsDependencyReady,
  orderTickets,
  gateReadiness,
  evidenceStale,
  workflowGate,
  readWorkflow,
  loadWorkflows,
  createMemoryRepoFiles,
  type ProjectSnapshot,
} from "@stintwork/core";
import { execFileSync } from "node:child_process";
import { checkpointChangedPaths } from "@stintwork/git";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Hono } from "hono";
import { parseDocument } from "yaml";
import {
  githubTrackerRepository,
  githubViewer,
  GithubReadError,
  type GithubDiscovery,
} from "./github-discovery.js";
import { dependencyOnlyIncomplete, readGithubTickets } from "./github-tickets.js";
import type { ProjectFilesReader } from "./work-item-files.js";
import { saveGithubWorkflow } from "./workflow-writes.js";
import { resolveGithubWorkflow } from "./github-snapshot.js";
import { githubGateIgnoresBody, githubGateIncludesTickets } from "./github-evidence-scope.js";
import { createMemoryProposalReader } from "./memory-proposals.js";
import type { ReviewEvidenceReader } from "./review-evidence.js";

export async function verifyGithubGateIdentity(
  root: string,
  expected: GithubDiscovery,
  source: { viewer: { id: number; login: string }; origin: string },
  signal?: AbortSignal,
) {
  const viewer = await githubViewer(root, signal);
  if (signal?.aborted) return false;
  const repository = await githubTrackerRepository(root);
  return (
    viewer.id === source.viewer.id &&
    repository.repository.toLowerCase() === source.origin.toLowerCase() &&
    repository.repository.toLowerCase() === expected.repository.toLowerCase() &&
    repository.repositoryId === expected.repositoryId
  );
}

export async function requireCurrentGithubApproval(
  directory: string,
  repository: string,
  parentId: string,
  number: number,
  includeTickets: boolean,
  labels: string[],
  record:
    | {
        approved?: {
          at?: string;
          remote?: { version?: number; parentId?: string; digest?: string };
        };
        reopened?: { at?: string };
      }
    | undefined,
  onFailure?: (error: unknown) => void,
  ignoreBody = false,
): Promise<
  | { ok: true }
  | {
      ok: false;
      code: "detail-unavailable" | "approval-stale" | "approval-unknown" | "approval-missing";
    }
> {
  let digest: string;
  try {
    const detail = await readGithubTickets(directory, repository, parentId, number);
    if (!detail.complete) {
      if (!dependencyOnlyIncomplete(detail)) throw new GithubReadError("incomplete");
      if (includeTickets) return { ok: false, code: "detail-unavailable" };
    }
    digest = await (record?.approved?.remote?.version === 2
      ? githubEvidenceDigestV2
      : githubEvidenceDigest)(
      { parentId, body: detail.spec, tickets: detail.tickets },
      includeTickets,
      labels,
    );
  } catch (error) {
    onFailure?.(error);
    return { ok: false, code: "detail-unavailable" };
  }
  if (!record?.approved) return { ok: false, code: "approval-missing" };
  const approval = record.approved;
  if (
    (approval.remote?.version !== 1 && approval.remote?.version !== 2) ||
    approval.remote.parentId !== parentId ||
    typeof approval.remote.digest !== "string" ||
    (record.reopened?.at && !approval.at)
  )
    return { ok: false, code: "approval-unknown" };
  if (
    (!ignoreBody && approval.remote.digest !== digest) ||
    (record.reopened?.at && approval.at && record.reopened.at >= approval.at)
  )
    return { ok: false, code: "approval-stale" };
  return { ok: true };
}

export function addGithubGateRoutes(
  app: Hono,
  root: string,
  getGithub: () => GithubDiscovery | undefined,
  getSnapshot: () => ProjectSnapshot,
  readProjectFiles: ProjectFilesReader,
  refresh: () => void,
  isStintActive: (slug: string) => boolean,
  writing: Set<string>,
  verifyIdentity: (github: GithubDiscovery) => Promise<boolean>,
  detailFailed: (github: GithubDiscovery, number: number, error: unknown) => void,
  readReviewEvidence?: ReviewEvidenceReader,
  discoveryFailed: () => boolean = () => false,
) {
  const readMemoryProposals = createMemoryProposalReader(root);
  for (const action of ["approve", "reopen"] as const)
    app.post(`/api/github/items/:number/gates/${action}`, async (context) => {
      const origin = context.req.header("origin");
      if (origin && origin !== new URL(context.req.url).origin)
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.originMismatch" }) }),
          403,
        );
      if (
        context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !==
        "application/json"
      )
        return context.json(coreTextWire({ reason: coreText({ code: "server.jsonGate" }) }), 400);
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.invalidJson" }) }),
          400,
        );
      }
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        !("stage" in body) ||
        typeof body.stage !== "string" ||
        !("reviewedDigest" in body) ||
        typeof body.reviewedDigest !== "string" ||
        !("reviewedHead" in body) ||
        typeof body.reviewedHead !== "string"
      )
        return context.json(coreTextWire({ reason: coreText({ code: "server.jsonGate" }) }), 400);
      const github = getGithub();
      const number = Number(context.req.param("number"));
      const item = github?.items.find((entry) => entry.number === number);
      if (getSnapshot().github?.errorCode === "identity")
        return context.json(
          coreTextWire({
            reason: coreText({ code: "gate.identityAmbiguous" }),
            code: "identity",
          }),
          409,
        );
      if (!github || !item || getSnapshot().setup.tracker !== "github-issues")
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.workItemNotFound" }) }),
          404,
        );
      const slug = `github-${number}`;
      if (
        writing.has(slug) ||
        isStintActive(slug) ||
        getSnapshot().workItems.find((entry) => entry.slug === slug)?.activeStint
      )
        return context.json(coreTextWire({ reason: coreText({ code: "gate.activeWrite" }) }), 409);
      writing.add(slug);
      const refuse = (
        code:
          | "gate.detailUnavailable"
          | "gate.evidenceChanged"
          | "gate.headChanged"
          | "gate.notCurrentStage",
      ) =>
        context.json(
          coreTextWire({
            reason: coreText({ code }),
            code: (
              {
                "gate.detailUnavailable": "detail-unavailable",
                "gate.evidenceChanged": "evidence-changed",
                "gate.headChanged": "head-changed",
                "gate.notCurrentStage": "not-current-stage",
              } as const
            )[code],
          }),
          409,
        );
      try {
        if (discoveryFailed()) return refuse("gate.detailUnavailable");
        let identityValid = false;
        try {
          identityValid = await verifyIdentity(github);
        } catch {
          // An unverified identity cannot authorize a write.
        }
        if (discoveryFailed()) return refuse("gate.detailUnavailable");
        if (!identityValid)
          return context.json(
            coreTextWire({
              reason: coreText({ code: "gate.identityAmbiguous" }),
              code: "identity",
            }),
            409,
          );
        const project = readProjectFiles();
        const discoveryFailure = project.warnings.find(({ path }) => path === ".git");
        if (discoveryFailure)
          return context.json(coreTextWire({ reason: discoveryFailure.message }), 503);
        const worktree = project.worktreePaths.get(slug);
        const directory = worktree ?? root;
        const relative = `.stintwork/github/${github.repository.toLowerCase()}/${number}/workflow.yaml`;
        const text = resolveGithubWorkflow(project, relative, worktree);
        if (
          worktree &&
          text !== undefined &&
          !getSnapshot().workItems.find((entry) => entry.slug === slug)?.github?.bound
        )
          return context.json(
            coreTextWire({
              reason: coreText({ code: "gate.identityAmbiguous" }),
              code: "identity",
            }),
            409,
          );
        const targetExists = existsSync(join(directory, relative));
        const workflows = getSnapshot().workflows;
        const declared =
          text === undefined
            ? undefined
            : readWorkflow(createMemoryRepoFiles({ [relative]: text }), relative, [], {
                ...loadWorkflows(project.files),
                workflows,
              });
        if (text !== undefined && !declared)
          return context.json(
            coreTextWire({ reason: coreText({ code: "gate.validWorkflowRequired" }) }),
            409,
          );
        if (
          declared?.merged ||
          getSnapshot().workItems.find((entry) => entry.slug === slug)?.merged
        )
          return context.json(
            coreTextWire({ reason: coreText({ code: "workItem.shipped" }) }),
            409,
          );
        const workflow = declared?.workflow ?? "feature";
        const stages = workflows[workflow].stages;
        const stage = stages.find((entry) => entry.id === body.stage);
        const current = declared?.stage ?? stages[0]?.id;
        const position = stages.findIndex((entry) => entry.id === stage?.id);
        const currentPosition = stages.findIndex((entry) => entry.id === current);
        const records = (declared?.stages ?? {}) as Record<
          string,
          {
            approved?: {
              at?: string;
              commit?: string;
              remote?: { version?: number; parentId?: string; digest?: string };
            };
            reopened?: { at?: string };
          }
        >;
        if (!stage || !current)
          return context.json(
            coreTextWire({ reason: coreText({ code: "server.stageNotFound" }) }),
            400,
          );
        if (action === "reopen" && (position >= currentPosition || !records[stage.id]?.approved))
          return context.json(
            coreTextWire({ reason: coreText({ code: "gate.reopenEarlier" }) }),
            409,
          );
        if (action === "approve" && current !== stage.id) return refuse("gate.notCurrentStage");
        if (action === "approve") {
          const snapshot = getSnapshot();
          const workItem = snapshot.workItems.find((entry) => entry.slug === slug);
          if (stage.gate === "evidence") readReviewEvidence?.(project, snapshot);
          else if (stage.column === "clarify") readMemoryProposals(project.files, snapshot);
          if (!workItem || workItem.stage !== stage.id) return refuse("gate.notCurrentStage");
          const gate = gateReadiness(workItem, workflows);
          if (!gate.ready) {
            refresh();
            return context.json(
              coreTextWire({ reason: gate.reason, conditions: gate.conditions }),
              409,
            );
          }
        }
        const labels = new Map(
          ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"].map(
            (role) => [role, role],
          ),
        );
        const configured = project.files.read("docs/agents/triage-labels.md") ?? "";
        for (const line of configured.split(/\r?\n/)) {
          const match = /^\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`/.exec(line);
          if (match && labels.has(match[1])) labels.set(match[1], match[2]);
        }
        let incompleteDetail = false;
        const readDigests = async () => {
          const detail = await readGithubTickets(directory, github.repository, item.id, number);
          if (!detail.complete) {
            incompleteDetail = dependencyOnlyIncomplete(detail);
            throw new GithubReadError("incomplete");
          }
          if (
            action === "approve" &&
            stage.gate === "tickets" &&
            !githubTicketsDependencyReady(
              orderTickets(
                detail.tickets.map((ticket) => ({
                  ...ticket,
                  slug: `github-${ticket.number}`,
                  status:
                    ticket.state === "open" ||
                    (ticket.state === "closed" &&
                      ["completed", "not_planned"].includes(ticket.stateReason ?? ""))
                      ? ticket.state
                      : "unknown",
                  resolved: ticket.state === "closed",
                  path: ticket.url,
                })),
                [],
                true,
              ),
            )
          )
            throw new GithubReadError("incomplete");
          const input = { parentId: item.id, body: detail.spec, tickets: detail.tickets };
          const [spec, tickets] = await Promise.all([
            githubEvidenceDigestV2(input, false, [...labels.values()]),
            githubEvidenceDigestV2(input, true, [...labels.values()]),
          ]);
          return (stageId: string) => (githubGateIncludesTickets(stages, stageId) ? tickets : spec);
        };
        let observed: string;
        try {
          const digest = await readDigests();
          observed = digest(current as string);
          if (action === "approve") {
            for (const prior of stages.slice(0, position)) {
              const record = records[prior.id];
              const currentApproval = await requireCurrentGithubApproval(
                directory,
                github.repository,
                item.id,
                number,
                githubGateIncludesTickets(stages, prior.id),
                [...labels.values()],
                record,
                (error) => {
                  detailFailed(github, number, error);
                  refresh();
                },
                githubGateIgnoresBody(stages, prior.id),
              );
              if (!currentApproval.ok)
                return refuse(
                  currentApproval.code === "detail-unavailable"
                    ? "gate.detailUnavailable"
                    : "gate.evidenceChanged",
                );
              if (prior.gate === "evidence") {
                const priorCommit = record.approved?.commit;
                if (!priorCommit) return refuse("gate.evidenceChanged");
                const headCommit = execFileSync("git", ["rev-parse", "HEAD"], {
                  cwd: directory,
                  encoding: "utf8",
                }).trim();
                const paths =
                  priorCommit === headCommit
                    ? []
                    : checkpointChangedPaths(directory, priorCommit, headCommit);
                if (
                  evidenceStale(
                    {
                      slug,
                      github: { repository: github.repository, number },
                      headCommit,
                      evidenceChangedPaths: { [priorCommit]: paths },
                    },
                    priorCommit,
                  )
                )
                  return refuse("gate.headChanged");
              }
            }
          }
        } catch (error) {
          if (!incompleteDetail) detailFailed(github, number, error);
          refresh();
          return refuse("gate.detailUnavailable");
        }
        if (observed !== body.reviewedDigest) return refuse("gate.evidenceChanged");
        const head = () =>
          execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
        const commit = head();
        if (commit !== body.reviewedHead) return refuse("gate.headChanged");
        let by = "Developer";
        try {
          by =
            execFileSync("git", ["config", "--get", "user.name"], {
              cwd: directory,
              encoding: "utf8",
            }).trim() || by;
        } catch (error) {
          if ((error as { status?: number }).status !== 1) throw error;
        }
        const record = {
          by,
          at: new Date().toISOString(),
          commit,
          remote: { version: 2 as const, parentId: item.id, digest: observed },
        };
        const workflowCommit = await saveGithubWorkflow(
          directory,
          github,
          item,
          workflow,
          current as string,
          (initial) => {
            const authoritative = resolveGithubWorkflow(project, relative, worktree);
            if (authoritative !== text || existsSync(join(directory, relative)) !== targetExists)
              throw new Error("gate-stage-changed");
            const source = text ?? initial;
            const currentDoc = parseDocument(source);
            if (currentDoc.get("workflow") !== workflow || currentDoc.get("stage") !== current)
              throw new Error("gate-stage-changed");
            if (head() !== commit) throw new Error("gate-head-changed");
            return workflowGate(
              source,
              { workflow, stage: current as string },
              stage.id,
              action,
              record,
              workflows,
            );
          },
          `${action === "approve" ? "Approve" : "Reopen"} ${stage.id} gate for ${slug}`,
        );
        const parent = execFileSync("git", ["rev-parse", `${workflowCommit}^`], {
          cwd: directory,
          encoding: "utf8",
        }).trim();
        let approval: "current" | "stale" | "unknown" = "unknown";
        try {
          approval = (await readDigests())(current as string) === observed ? "current" : "stale";
        } catch (error) {
          detailFailed(github, number, error);
        }
        if (approval !== "current" && item.detail) item.detail.stale = true;
        if (parent !== commit) approval = "stale";
        refresh();
        return context.json({ approval, ...(parent !== commit ? { reason: "head-changed" } : {}) });
      } catch (error) {
        refresh();
        if (error instanceof Error && error.message === "gate-head-changed")
          return refuse("gate.headChanged");
        if (error instanceof Error && error.message === "gate-stage-changed")
          return refuse("gate.notCurrentStage");
        return context.json(coreTextWire({ reason: errorText(error) }), 503);
      } finally {
        writing.delete(slug);
      }
    });
}
