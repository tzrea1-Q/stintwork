// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createFakeAgentLauncher, type FakeAgentStep } from "@stintwork/agents/testing";
import { gateReadiness, type ProjectSnapshot, type Stint } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { createProjectServer } from "./index.js";

const fixtures: { parent: string; project: ReturnType<typeof createProjectServer> }[] = [];
const folder = ".scratch/planning";
const workflowPath = `${folder}/workflow.yaml`;
const specPath = `${folder}/spec.md`;
const ticketPath = `${folder}/issues/01-first.md`;
const ticket = "# First\nStatus: ready-for-agent\nBlocked by: none";

function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function write(root: string, path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

async function fixture(stage: string, script: readonly FakeAgentStep[] = []) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-gate-output-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  git(root, "config", "user.name", "Developer Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  await write(root, ".gitignore", ".stintwork/local/\n");
  await write(root, "GLOSSARY.md", "# Project vocabulary\n");
  await write(root, workflowPath, `workflow: feature\nstage: ${stage}\n`);
  await write(root, "web/index.html", "<!doctype html><title>Stintwork</title>");
  if (stage === "tickets") await write(root, specPath, "# Planned feature");
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Fixture");
  const project = createProjectServer(root, join(root, "web"), {
    launchAgent: createFakeAgentLauncher(script, [
      {
        type: "message",
        text: "## Where I stopped\nStage finished\n## Unresolved\nNone\n## Suggested next\nApprove",
      },
    ]),
  });
  fixtures.push({ parent, project });
  const response = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "planning", agent: "codex", ticket: null }),
  });
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  let finished: Stint = stint;
  await expect
    .poll(async () => {
      ({ stint: finished } = await (await project.app.request(`/api/stints/${stint.id}`)).json());
      return finished.status;
    })
    .not.toBe("running");
  expect(finished).toMatchObject({
    status: "finished",
    handoff: { stint: stint.id },
    checkpointCommit: expect.any(String),
  });
  return { root, project, stint: finished };
}

afterEach(async () => {
  for (const { parent, project } of fixtures.splice(0)) {
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});

function approve(project: ReturnType<typeof createProjectServer>, stage: string) {
  return project.app.request(`/api/work-items/planning/gates/${stage}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

async function snapshot(project: ReturnType<typeof createProjectServer>): Promise<ProjectSnapshot> {
  return (await project.app.request("/api/project")).json();
}

test.each([
  ["spec", specPath, "# Planned feature", "tickets"],
  ["tickets", ticketPath, ticket, "implement"],
])(
  "%s refuses missing output, accepts valid output from its worktree and commits only its gate",
  async (stage, path, content, nextStage) => {
    const { root, project, stint } = await fixture(stage);
    const worktree = stint.worktree.path;
    const before = await readFile(join(worktree, workflowPath), "utf8");
    const head = git(worktree, "rev-parse", "HEAD");
    await write(root, path, content);
    let response = await approve(project, stage);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      conditions: [
        expect.objectContaining({
          id: "output",
          ready: false,
          action: expect.stringContaining(path === specPath ? specPath : `${folder}/issues/`),
        }),
      ],
    });
    expect(await readFile(join(worktree, workflowPath), "utf8")).toBe(before);
    expect(git(worktree, "rev-parse", "HEAD")).toBe(head);
    expect((await snapshot(project)).attentionItems.some(({ kind }) => kind === "gate-ready")).toBe(
      false,
    );

    await write(worktree, path, content);
    response = await approve(project, stage);
    expect(response.status).toBe(200);
    const approved = await response.json();
    expect(approved).toMatchObject({
      stage: nextStage,
      record: { commit: head },
      commit: expect.any(String),
    });
    expect(git(worktree, "show", "--format=", "--name-only", approved.commit)).toBe(workflowPath);
    expect(git(worktree, "log", "-1", "--format=%s")).toBe(`Approve ${stage} gate for planning`);
    expect(git(worktree, "status", "--porcelain", "--", path)).not.toBe("");
    expect((await snapshot(project)).workItems.find(({ slug }) => slug === "planning")?.stage).toBe(
      nextStage,
    );
  },
);

test.each([
  ["spec", specPath, "No heading"],
  ["spec", ".scratch/wrong/spec.md", "# Wrong folder"],
  ["tickets", ticketPath, "# First\nStatus: ready-for-agent"],
  ["tickets", ".scratch/wrong/issues/01-first.md", ticket],
])(
  "%s output at %s cannot satisfy the gate when invalid or in the wrong folder",
  async (stage, path, content) => {
    const { project, stint } = await fixture(stage, [{ type: "write", path, content }]);
    const expectedPath = stage === "spec" ? specPath : `${folder}/issues/`;
    expect(git(stint.worktree.path, "show", `${stint.checkpointCommit}:${path}`)).toContain(
      content,
    );
    const response = await approve(project, stage);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      reason: expect.stringContaining(expectedPath),
      conditions: [
        expect.objectContaining({
          id: "output",
          ready: false,
          action: expect.stringContaining(expectedPath),
        }),
      ],
    });
    const current = await snapshot(project);
    const item = current.workItems.find(({ slug }) => slug === "planning");
    expect(item?.stage).toBe(stage);
    expect(item && gateReadiness(item).ready).toBe(false);
    expect(current.attentionItems.some(({ kind }) => kind === "gate-ready")).toBe(false);
  },
);

test.each([
  ["spec", specPath, "# Planned feature", "tickets"],
  ["tickets", ticketPath, ticket, "implement"],
])(
  "a fake-agent %s stint checkpoints valid output and makes its gate ready",
  async (stage, path, content, nextStage) => {
    const instruction =
      stage === "spec"
        ? `Write the spec to \`${specPath}\``
        : `Write tickets to \`${folder}/issues/\` as \`NN-<slug>.md\`, numbered from 01 in dependency order, each with \`Status: ready-for-agent\` and a \`Blocked by:\` line`;
    const secondTicket = `${folder}/issues/02-second.md`;
    const { root, project, stint } = await fixture(stage, [
      { type: "expect-prompt", includes: instruction },
      { type: "expect-prompt", includes: "Do not create another work item folder." },
      { type: "write", path, content },
      ...(stage === "tickets"
        ? [{ type: "write" as const, path: secondTicket, content: ticket.replace("none", "01") }]
        : []),
    ]);
    expect(git(root, "ls-tree", "HEAD", "--", path)).toBe("");
    expect(git(stint.worktree.path, "show", `${stint.checkpointCommit}:${path}`)).toContain(
      content,
    );
    const current = (await snapshot(project)).workItems.find(({ slug }) => slug === "planning");
    expect(current && gateReadiness(current).ready).toBe(true);
    if (stage === "tickets") {
      expect(
        current?.tickets.map(({ number, status, blockedBy }) => ({ number, status, blockedBy })),
      ).toEqual([
        { number: 1, status: "ready-for-agent", blockedBy: [] },
        { number: 2, status: "ready-for-agent", blockedBy: [1] },
      ]);
      expect(current?.outputWarnings).toEqual([]);
      expect(
        git(stint.worktree.path, "show", `${stint.checkpointCommit}:${secondTicket}`),
      ).toContain("Blocked by: 01");
      expect(git(root, "ls-tree", "HEAD", "--", secondTicket)).toBe("");
    }
    const response = await approve(project, stage);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stage: nextStage });
  },
);

test("Tickets rechecks warnings and dependency cycles at approval, not just the previous snapshot", async () => {
  const { project, stint } = await fixture("tickets", [
    { type: "write", path: ticketPath, content: ticket },
  ]);
  const worktree = stint.worktree.path;
  for (const invalid of [
    "# First\nStatus: ready-for-agent",
    ticket.replace("none", "99"),
    ticket.replace("none", "01"),
    "# First\n\u0000",
  ]) {
    await write(worktree, ticketPath, invalid);
    expect((await approve(project, "tickets")).status).toBe(409);
  }
  const duplicate = `${folder}/issues/01-duplicate.md`;
  await write(worktree, ticketPath, ticket);
  await write(worktree, duplicate, ticket);
  expect((await approve(project, "tickets")).status).toBe(409);
  await rm(join(worktree, duplicate));
  const second = `${folder}/issues/02-second.md`;
  await write(worktree, ticketPath, ticket.replace("none", "02"));
  await write(worktree, second, ticket.replace("none", "01"));
  expect((await approve(project, "tickets")).status).toBe(409);
  await write(worktree, ticketPath, ticket);
  expect((await approve(project, "tickets")).status).toBe(200);
});

test.each(["accepted", "rejected"])(
  "Clarify refuses an open memory proposal until it is %s",
  async (status) => {
    const { root, project, stint } = await fixture("clarify", [
      { type: "write", path: "GLOSSARY.md", content: "# Project vocabulary\nNew term\n" },
    ]);
    const before = await readFile(join(stint.worktree.path, workflowPath), "utf8");
    const response = await approve(project, "clarify");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      reason: expect.stringContaining("Accept or reject"),
      conditions: expect.arrayContaining([expect.objectContaining({ id: "memory", ready: false })]),
    });
    expect(await readFile(join(stint.worktree.path, workflowPath), "utf8")).toBe(before);
    const item = (await snapshot(project)).workItems[0];
    expect(item.memoryProposals).toHaveLength(1);
    const decision = await project.app.request(
      "/api/work-items/planning/memory-proposals/decision",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.memoryProposals?.[0].id, status }),
      },
    );
    expect(decision.status).toBe(200);
    expect((await approve(project, "clarify")).status).toBe(200);
    expect(await readFile(join(root, "GLOSSARY.md"), "utf8")).toBe("# Project vocabulary\n");
  },
);

test("Clarify refuses unreadable memory decisions and checkpoint comparisons", async () => {
  const { root, project, stint } = await fixture("clarify");
  await write(stint.worktree.path, `${folder}/review.yaml`, "decisions: [");
  expect((await approve(project, "clarify")).status).toBe(409);
  await rm(join(stint.worktree.path, `${folder}/review.yaml`));
  const logPath = `.stintwork/local/stints/${stint.id}.jsonl`;
  const log = await readFile(join(root, logPath), "utf8");
  await write(root, logPath, log.replaceAll(stint.checkpointCommit as string, "f".repeat(40)));
  const response = await approve(project, "clarify");
  expect(response.status).toBe(409);
  expect((await response.json()).reason).toContain("Cannot derive memory proposals");
});
