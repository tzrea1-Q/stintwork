// SPDX-License-Identifier: Apache-2.0
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Brief, StintLogEntry } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { createProjectServer } from "./index.js";

const fixtures: { root: string; project: ReturnType<typeof createProjectServer> }[] = [];
const ticketPath = ".scratch/first-stint/issues/02-preview.md";
const endpoint = "/api/work-items/first-stint/tickets/02/brief-preview";

function diagnosticLog(root: string): StintLogEntry {
  return {
    type: "started",
    at: "2026-10-12T10:00:00Z",
    stint: {
      id: "diagnostic",
      workItem: "first-stint",
      stage: "implement",
      ticket: 2,
      agent: "codex",
      worktree: { path: root, branch: "stintwork/first-stint" },
      baseCommit: "base",
      brief: {
        skill: null,
        pointers: [],
        lastHandoff: null,
        changedPaths: [],
        prompt: "Original instructions",
      },
    },
  };
}

test("checkpoint comparison failures preserve the raw diagnostic as a typed parameter", async () => {
  const { root, project } = await fixture();
  await write(
    root,
    ".stintwork/local/stints/diagnostic.jsonl",
    [
      diagnosticLog(root),
      {
        type: "ended",
        at: "2026-10-12T10:01:00Z",
        status: "finished",
        checkpointCommit: "missing-checkpoint",
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n"),
  );
  const response = await project.app.request(endpoint);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    reason: "Could not compare the last checkpoint: Invalid checkpoint commit.",
    reasonMessage: {
      code: "server.checkpointCompareFailed",
      params: { detail: "Invalid checkpoint commit." },
    },
  });
});

test("Review preparation failures identify the operation without translating the diagnostic", async () => {
  const { root, project } = await fixture();
  await write(root, ".scratch/first-stint/workflow.yaml", "workflow: feature\nstage: review\n");
  await write(
    root,
    ".stintwork/local/stints/diagnostic.jsonl",
    [
      diagnosticLog(root),
      {
        type: "ended",
        at: "2026-10-12T10:01:00Z",
        status: "finished",
        checkpointCommit: "missing-checkpoint",
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n"),
  );
  const response = await project.app.request("/api/work-items/first-stint/brief-preview");
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    reason: "Could not prepare the Review diff: Invalid checkpoint commit.",
    reasonMessage: {
      code: "server.reviewDiffFailed",
      params: { detail: "Invalid checkpoint commit." },
    },
  });
});

test("recovery failures return typed metadata alongside the unchanged operational diagnostic", async () => {
  const { root, project } = await fixture();
  await write(
    root,
    ".stintwork/local/stints/diagnostic.jsonl",
    JSON.stringify(diagnosticLog(root)),
  );
  await mkdir(join(root, ".stintwork/local/.gitignore"));
  const response = await project.app.request(endpoint);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    reason: "Stint recovery failed: Error: The local .gitignore must be a regular file.",
    reasonMessage: {
      code: "server.recoveryFailed",
      params: { detail: "Error: The local .gitignore must be a regular file." },
    },
  });
});

async function write(root: string, path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "stintwork-brief-"));
  for (const [path, text] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    "AGENTS.md": "Conventions",
    "CLAUDE.md": "Fallback conventions",
    "GLOSSARY.md": "Terms",
    "docs/adr/0001-files.md": "# Files are the source of truth",
    ".scratch/first-stint/spec.md": "# The first stint",
    [ticketPath]: "# 02 — Brief preview\nStatus: ready-for-agent\nBlocked by: none",
  })) {
    await write(root, path, text);
  }
  const project = createProjectServer(root, join(root, "web"));
  fixtures.push({ root, project });
  return { root, project };
}

afterEach(async () => {
  for (const { root, project } of fixtures.splice(0)) {
    await project.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("preview returns the exact brief from project files without starting a stint", async () => {
  const { root, project } = await fixture();
  const response = await project.app.request(endpoint);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const brief: Brief = await response.json();
  expect(brief.pointers.map((pointer) => pointer.path)).toEqual([
    "AGENTS.md",
    "GLOSSARY.md",
    "docs/adr/0001-files.md",
    ".scratch/first-stint/spec.md",
    ticketPath,
  ]);
  expect(brief.prompt).toMatch(/^\/implement .scratch\/first-stint\/issues\/02-preview.md\n/);
  expect(brief.lastHandoff).toBeNull();
  expect(brief.changedPaths).toEqual([]);
  await write(root, "docs/adr/0002-agents.md", "# Agents use ACP");
  const refreshed: Brief = await (await project.app.request(endpoint)).json();
  expect(refreshed.pointers).toContainEqual({
    path: "docs/adr/0002-agents.md",
    reason: "Decision record: Agents use ACP",
    reasonMessage: { code: "brief.decision", params: { title: "Agents use ACP" } },
  });
});

test("rejects newly blocked or resolved tickets with a reason even before watcher refresh", async () => {
  const { root, project } = await fixture();
  await write(root, ".scratch/first-stint/workflow.yaml", "workflow: feature\nstage: implement");
  await write(root, ticketPath, "# Brief preview\nStatus: open\nBlocked by: 01");
  const blocked = await project.app.request(endpoint);
  expect(blocked.status).toBe(409);
  expect(await blocked.json()).toEqual({
    reason: "Blocked by ticket 01.",
    reasonMessage: { code: "brief.blockedBy", params: { tickets: "01" } },
  });
  await write(root, ticketPath, "# Brief preview\nStatus: closed\nBlocked by: none");
  const resolved = await project.app.request(endpoint);
  expect(resolved.status).toBe(409);
  expect(await resolved.json()).toEqual({
    reason: "This ticket is resolved.",
    reasonMessage: { code: "brief.ticketResolved" },
  });
});

test("HTTP refusals add stable messages without changing status or English", async () => {
  const { project } = await fixture();
  const missing = await project.app.request("/api/work-items/missing/brief-preview");
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({
    reason: "Work item not found.",
    reasonMessage: { code: "server.workItemNotFound" },
  });
  const invalid = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "invalid",
  });
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toEqual({
    reason: "Invalid JSON.",
    reasonMessage: { code: "server.invalidJson" },
  });
});

test("work item title validation returns typed guidance alongside the original English", async () => {
  const { project } = await fixture();
  const response = await project.app.request("/api/work-items/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "", workflow: "feature" }),
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    reason: "Title must be nonempty, single-line text.",
    reasonMessage: { code: "workItem.titleSingleLine" },
  });
});

test("Fix uses /tdd, Do uses /implement, and Review can preview a ticket stint", async () => {
  const { root, project } = await fixture();
  for (const [workflow, stage, skill] of [
    ["bug", "fix", "/tdd"],
    ["quick", "do", "/implement"],
  ]) {
    await write(
      root,
      ".scratch/first-stint/workflow.yaml",
      `workflow: ${workflow}\nstage: ${stage}`,
    );
    const response = await project.app.request(endpoint);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ skill });
  }
  await write(root, ".scratch/first-stint/workflow.yaml", "workflow: feature\nstage: review");
  const response = await project.app.request(endpoint);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ skill: "/code-review" });
});

test("unknown work items and tickets cannot select arbitrary file paths", async () => {
  const { project } = await fixture();
  for (const path of [
    "/api/work-items/missing/tickets/02/brief-preview",
    "/api/work-items/first-stint/tickets/99/brief-preview",
    "/api/work-items/first-stint/tickets/2.0/brief-preview",
    "/api/work-items/first-stint/tickets/AGENTS.md/brief-preview",
    "/api/work-items/first-stint/tickets/%2E%2E%2FAGENTS.md/brief-preview",
  ]) {
    const response = await project.app.request(path);
    expect(response.status).toBe(404);
    expect(await response.json()).toHaveProperty("reason");
  }
});
