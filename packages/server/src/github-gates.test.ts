// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { githubEvidenceDigest, indexProject, createMemoryRepoFiles } from "@stintwork/core";
import { Hono } from "hono";
import { afterEach, expect, test } from "vitest";
import { parse } from "yaml";
import { fakeGh, type GhReply } from "../test/fake-gh.js";
import { addGithubGateRoutes } from "./github-gates.js";
import { createNodeRepoFiles } from "./repo-files.js";
import { createProjectFiles } from "./work-item-files.js";
import { saveGithubWorkflow } from "./workflow-writes.js";

const roots: string[] = [];
const oldPath = process.env.PATH;
afterEach(() => {
  process.env.PATH = oldPath;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const parent = {
  node_id: "I_1",
  number: 1,
  title: "Parent",
  body: "Spec",
  html_url: "https://github.com/Example/Project/issues/1",
  repository_url: "https://api.github.com/repos/Example/Project",
  state: "open",
  state_reason: null,
  labels: [],
  comments: 0,
  sub_issues_summary: { total: 0 },
};
const discovery = {
  repository: "Example/Project",
  repositoryId: "R_1",
  items: [{ id: "I_1", number: 1, title: "Parent", url: parent.html_url, complete: true }],
  scanned: 1,
  cursor: null,
  complete: true,
  pages: [],
  warnings: [],
};
const issue = "api repos/Example/Project/issues/1";
async function setup(replies: Record<string, GhReply | GhReply[]> = {}, initialStage?: string) {
  const root = mkdtempSync(join(tmpdir(), "github-gates-"));
  roots.push(root);
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  execFileSync("git", ["init", "-q", root]);
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("commit", "--allow-empty", "-qm", "initial");
  const gh = await fakeGh(join(root, "bin"));
  process.env.PATH = gh.path;
  await gh.script({
    [issue]: { stdout: parent },
    [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [] },
    [`${issue}/comments?per_page=100&page=1`]: { stdout: [] },
    ...replies,
  });
  const app = new Hono();
  const snapshot = indexProject(
    createMemoryRepoFiles({ "docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n" }),
    { name: "test" },
  );
  addGithubGateRoutes(
    app,
    root,
    () => discovery,
    () => snapshot,
    createProjectFiles(root, createNodeRepoFiles(root)),
    () => {},
    () => false,
  );
  if (initialStage) {
    const digest = await githubEvidenceDigest(
      { parentId: "I_1", body: "Spec", tickets: [] },
      false,
    );
    const stages = snapshot.workflows.feature.stages;
    const previous = stages.slice(
      0,
      stages.findIndex(({ id }) => id === initialStage),
    );
    await saveGithubWorkflow(
      root,
      discovery,
      discovery.items[0],
      "feature",
      initialStage,
      (text) =>
        `${text}stages:\n${previous.map(({ id }) => `  ${id}:\n    approved:\n      at: '2026-01-01T00:00:00Z'\n      remote: { version: 1, parentId: I_1, digest: '${digest}' }\n`).join("")}`,
    );
  }
  const reviewedHead = git("rev-parse", "HEAD");
  const reviewedDigest = await githubEvidenceDigest(
    { parentId: "I_1", body: "Spec", tickets: [] },
    false,
  );
  const request = (body = { stage: "clarify", reviewedDigest, reviewedHead }, action = "approve") =>
    app.request(`/api/github/items/1/gates/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { git, request, reviewedHead, reviewedDigest, root };
}
const path = ".stintwork/github/example/project/1/workflow.yaml";

test("reopens an earlier GitHub gate and retains its approval", async () => {
  const { git, request, reviewedHead } = await setup({}, "tickets");
  const reviewedDigest = await githubEvidenceDigest(
    { parentId: "I_1", body: "Spec", tickets: [] },
    true,
  );
  const response = await request({ stage: "spec", reviewedDigest, reviewedHead }, "reopen");
  expect(response.status).toBe(200);
  expect(parse(git("show", `HEAD:${path}`))).toMatchObject({
    stage: "spec",
    stages: {
      spec: { approved: { remote: { parentId: "I_1" } }, reopened: { commit: reviewedHead } },
    },
  });
  const specDigest = await githubEvidenceDigest(
    { parentId: "I_1", body: "Spec", tickets: [] },
    false,
  );
  expect(
    (
      await request({
        stage: "spec",
        reviewedDigest: specDigest,
        reviewedHead: git("rev-parse", "HEAD"),
      })
    ).status,
  ).toBe(409);
});

test("refuses a later approval when an earlier approval is stale or unknown", async () => {
  for (const reply of [{ stdout: { ...parent, body: "Changed" } }, { code: 1 }]) {
    const { git, request, reviewedHead } = await setup({ [issue]: reply }, "spec");
    const reviewedDigest = await githubEvidenceDigest(
      { parentId: "I_1", body: "Changed", tickets: [] },
      false,
    );
    expect((await request({ stage: "spec", reviewedDigest, reviewedHead })).status).toBe(409);
    expect(git("rev-list", "--count", "HEAD")).toBe("2");
  }
});

test("creates and commits a current approval", async () => {
  const { git, request, reviewedHead, reviewedDigest } = await setup();
  const response = await request();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ approval: "current" });
  const yaml = git("show", `HEAD:${path}`);
  expect(parse(yaml)).toEqual({
    workflow: "feature",
    stage: "spec",
    github: {
      host: "github.com",
      repositoryId: "R_1",
      repository: "Example/Project",
      issueId: "I_1",
      number: 1,
      url: parent.html_url,
    },
    stages: {
      clarify: {
        approved: {
          by: "Test",
          at: expect.any(String),
          commit: reviewedHead,
          remote: { version: 1, parentId: "I_1", digest: reviewedDigest },
        },
      },
    },
  });
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});

test("refuses incomplete detail without a commit", async () => {
  const child = {
    ...parent,
    node_id: "I_2",
    number: 2,
    html_url: "https://github.com/Example/Project/issues/2",
    sub_issues_summary: { total: 1 },
    issue_dependencies_summary: { total_blocked_by: 0 },
  };
  const childPath = "api repos/Example/Project/issues/2";
  const { request, git } = await setup({
    [issue]: { stdout: { ...parent, sub_issues_summary: { total: 1 } } },
    [`${issue}/sub_issues?per_page=100&page=1`]: { stdout: [child] },
    [`${childPath}/labels?per_page=100&page=1`]: { stdout: [] },
    [`${childPath}/comments?per_page=100&page=1`]: { stdout: [] },
    [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: { stdout: [] },
  });
  const response = await request();
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe("detail-unavailable");
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
});
test("refuses changed evidence without a commit", async () => {
  const { request, git, reviewedHead } = await setup();
  const response = await request({ stage: "clarify", reviewedDigest: "wrong", reviewedHead });
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe("evidence-changed");
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
});
test("refuses changed HEAD without a commit", async () => {
  const { request, git, reviewedDigest } = await setup();
  const response = await request({ stage: "clarify", reviewedDigest, reviewedHead: "wrong" });
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe("head-changed");
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
});
test("reports stale when remote evidence changes after commit", async () => {
  const { request, git } = await setup({
    [issue]: [{ stdout: parent }, { stdout: { ...parent, body: "Changed" } }],
  });
  expect(await (await request()).json()).toEqual({ approval: "stale" });
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});
test("reports unknown when the post-check fails", async () => {
  const { request, git } = await setup({ [issue]: [{ stdout: parent }, { code: 1 }] });
  expect(await (await request()).json()).toEqual({ approval: "unknown" });
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});
test("concurrent approvals create only one commit", async () => {
  const { request, git } = await setup();
  const responses = await Promise.all([request(), request()]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});

test.each([
  ["spec", "current"],
  ["tickets", "stale"],
] as const)("%s approval observes the right remote evidence", async (stage, expected) => {
  const child = {
    ...parent,
    node_id: "I_2",
    number: 2,
    html_url: "https://github.com/Example/Project/issues/2",
    body: "Ticket",
    issue_dependencies_summary: { total_blocked_by: 0 },
  };
  const childPath = "api repos/Example/Project/issues/2";
  const { request, reviewedHead } = await setup(
    {
      [issue]: { stdout: { ...parent, sub_issues_summary: { total: 1 } } },
      [`${issue}/sub_issues?per_page=100&page=1`]: [
        { stdout: [child] },
        { stdout: [{ ...child, body: "Changed ticket" }] },
      ],
      [`${childPath}/labels?per_page=100&page=1`]: { stdout: [] },
      [`${childPath}/comments?per_page=100&page=1`]: { stdout: [] },
      [`${childPath}/dependencies/blocked_by?per_page=100&page=1`]: { stdout: [] },
    },
    stage,
  );
  const reviewedDigest = await githubEvidenceDigest(
    {
      parentId: "I_1",
      body: "Spec",
      tickets: [
        {
          id: "I_2",
          body: "Ticket",
          state: "open",
          stateReason: null,
          labels: [],
          blockers: [],
          commentRecords: [],
        },
      ],
    },
    stage === "tickets",
  );
  const response = await request({ stage, reviewedHead, reviewedDigest });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ approval: expected });
});
