// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  githubEvidenceJson,
  type GithubEvidenceInput,
  type ProjectSnapshot,
} from "@stintwork/core";
import { createNodeRepoFiles } from "./repo-files.js";
import type { ProjectFilesReader } from "./work-item-files.js";

export function projectGithubGates(
  snapshot: ProjectSnapshot,
  root: string,
  project: ReturnType<ProjectFilesReader>,
) {
  const labels = new Map(
    ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"].map((role) => [
      role,
      role,
    ]),
  );
  let configured: string;
  let triageReadable = true;
  try {
    configured = project.files.read("docs/agents/triage-labels.md") ?? "";
  } catch {
    configured = "";
    triageReadable = false;
  }
  for (const line of configured.split(/\r?\n/)) {
    const match = /^\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`/.exec(line);
    if (match && labels.has(match[1])) labels.set(match[1], match[2]);
  }
  for (const item of snapshot.workItems) {
    if (!item.github) continue;
    const remote = snapshot.github?.items.find((entry) => entry.id === item.github?.issueId);
    const detail = remote?.detail;
    const valid =
      triageReadable &&
      detail &&
      detail.complete === true &&
      !detail.stale &&
      detail.tickets.every(
        (ticket) =>
          typeof ticket.id === "string" &&
          Array.isArray(ticket.blockers) &&
          Array.isArray(ticket.commentRecords),
      );
    const stages = snapshot.workflows[item.workflow].stages;
    const digest = (stage: string) => {
      if (!valid || !remote) return undefined;
      const includeTickets =
        stages.findIndex((entry) => entry.id === stage) >
        stages.findIndex((entry) => entry.column === "spec");
      return `sha256:${createHash("sha256")
        .update(
          githubEvidenceJson(
            {
              parentId: remote.id,
              body: detail.spec,
              tickets: detail.tickets,
            } as GithubEvidenceInput,
            includeTickets,
            [...labels.values()],
          ),
        )
        .digest("hex")}`;
    };
    for (const [stage, record] of Object.entries(item.stages)) {
      const approval = record.approved;
      if (!approval || typeof approval !== "object" || Array.isArray(approval)) continue;
      const evidence =
        "remote" in approval && approval.remote && typeof approval.remote === "object"
          ? approval.remote
          : undefined;
      const current = digest(stage);
      const state =
        !current ||
        !evidence ||
        !("version" in evidence) ||
        evidence.version !== 1 ||
        !("digest" in evidence) ||
        !("parentId" in evidence) ||
        evidence.parentId !== remote?.id
          ? "unknown"
          : evidence.digest === current
            ? "current"
            : "stale";
      record.approved = { ...approval, remoteState: state };
    }
    const reviewDigest = item.stage ? digest(item.stage) : undefined;
    if (reviewDigest) {
      try {
        const reviewHead = execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: project.worktreePaths.get(item.slug) ?? root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }).trim();
        item.github.reviewDigest = reviewDigest;
        item.github.reviewHead = reviewHead;
      } catch {
        /* Approval requires a readable HEAD. */
      }
    }
  }
}

export function githubSnapshotFiles(
  project: ReturnType<ProjectFilesReader>,
  github: NonNullable<ProjectSnapshot["github"]>,
) {
  const overrides = new Map<string, string>();
  for (const item of github.items) {
    const worktree = project.worktreePaths.get(`github-${item.number}`);
    if (!worktree) continue;
    const path = `.stintwork/github/${github.repository.toLowerCase()}/${item.number}/workflow.yaml`;
    const text = createNodeRepoFiles(worktree).read(path);
    if (text !== undefined) overrides.set(path, text);
  }
  return {
    ...project.files,
    read: (path: string) => overrides.get(path) ?? project.files.read(path),
  };
}
