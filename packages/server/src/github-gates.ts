// SPDX-License-Identifier: Apache-2.0
import {
  coreText,
  coreTextWire,
  errorText,
  githubEvidenceDigest,
  workflowGate,
  type ProjectSnapshot,
} from "@stintwork/core";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Hono } from "hono";
import { parseDocument } from "yaml";
import type { GithubDiscovery } from "./github-discovery.js";
import { readGithubTickets } from "./github-tickets.js";
import type { ProjectFilesReader } from "./work-item-files.js";
import { saveGithubWorkflow } from "./workflow-writes.js";

export function addGithubGateRoutes(
  app: Hono,
  root: string,
  getGithub: () => GithubDiscovery | undefined,
  getSnapshot: () => ProjectSnapshot,
  readProjectFiles: ProjectFilesReader,
  refresh: () => void,
  isStintActive: (slug: string) => boolean,
) {
  const writing = new Set<string>();
  app.post("/api/github/items/:number/gates/approve", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.originMismatch" }) }),
        403,
      );
    if (
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json(coreTextWire({ reason: coreText({ code: "server.jsonGate" }) }), 400);
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json(coreTextWire({ reason: coreText({ code: "server.invalidJson" }) }), 400);
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
    if (!github || !item || getSnapshot().setup.tracker !== "github-issues")
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.workItemNotFound" }) }),
        404,
      );
    const slug = `github-${number}`;
    if (writing.has(slug) || isStintActive(slug))
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
      const project = readProjectFiles();
      const directory = project.worktreePaths.get(slug) ?? root;
      const relative = `.stintwork/github/${github.repository.toLowerCase()}/${number}/workflow.yaml`;
      let text: string | undefined;
      try {
        text = readFileSync(join(directory, relative), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const doc = parseDocument(text ?? "");
      if (doc.errors.length || doc.warnings.length) throw new Error("Invalid workflow.yaml");
      const workflows = getSnapshot().workflows;
      const workflow = text === undefined ? "feature" : doc.get("workflow");
      if (typeof workflow !== "string" || !workflows[workflow])
        return refuse("gate.notCurrentStage");
      const stages = workflows[workflow].stages;
      const stage = stages.find((entry) => entry.id === body.stage);
      const current = text === undefined ? stages[0]?.id : doc.get("stage");
      if (!stage || current !== stage.id || stages.at(-1)?.id === stage.id)
        return refuse("gate.notCurrentStage");
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
      const includeTickets =
        stages.findIndex((entry) => entry.id === stage.id) >
        stages.findIndex((entry) => entry.column === "spec");
      const digest = async () => {
        const detail = await readGithubTickets(directory, github.repository, item.id, number);
        if (!detail.complete) throw new Error("Incomplete detail");
        return githubEvidenceDigest(
          { parentId: item.id, body: detail.spec, tickets: detail.tickets },
          includeTickets,
          [...labels.values()],
        );
      };
      let observed: string;
      try {
        observed = await digest();
      } catch {
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
        remote: { version: 1 as const, parentId: item.id, digest: observed },
      };
      await saveGithubWorkflow(
        directory,
        github,
        item,
        workflow,
        current as string,
        (initial) => {
          const currentDoc = parseDocument(initial);
          if (currentDoc.get("workflow") !== workflow || currentDoc.get("stage") !== stage.id)
            throw new Error("gate-stage-changed");
          if (head() !== commit) throw new Error("gate-head-changed");
          return workflowGate(
            initial,
            { workflow, stage: stage.id },
            stage.id,
            "approve",
            record,
            workflows,
          );
        },
        `Approve ${stage.id} gate for ${slug}`,
      );
      refresh();
      let approval: "current" | "stale" | "unknown" = "unknown";
      try {
        approval = (await digest()) === observed ? "current" : "stale";
      } catch {
        /* The committed approval remains unverified. */
      }
      return context.json({ approval });
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
