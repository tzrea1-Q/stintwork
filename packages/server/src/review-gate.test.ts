import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAgentRegistry } from "@stintwork/agents";
import {
  createFakeAgentLauncher,
  fakeAgentProfiles,
  type FakeAgentStep,
} from "@stintwork/agents/testing";
import {
  evidenceStale,
  gateReadiness,
  type ProjectSnapshot,
  type Stint,
  type WorkItemChecks,
} from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { createProjectServer } from "./index.js";

const fixtures: { parent: string; project: ReturnType<typeof createProjectServer> }[] = [];
const endpoint = "/api/work-items/first";
const findingReply =
  "## Finding\nAxis: Spec\nSeverity: major\nPath: src/example.ts\nLine: 1\nTitle: Missing limit\n### Body\nBound the input.";
const handoff =
  "## Where I stopped\nFinished.\n## Unresolved\nNone\n## Suggested next\nReview the evidence.";
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
async function write(root: string, path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}
async function fixture(
  replies = [findingReply, "No findings"],
  work: readonly FakeAgentStep[] = [],
) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-review-gate-"));
  const root = join(parent, "project");
  git(parent, "init", "--quiet", "--initial-branch=main", root);
  git(root, "config", "user.name", "Developer Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  for (const [path, text] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    "AGENTS.md": "Conventions",
    "GLOSSARY.md": "Original glossary\n",
    ".gitignore": ".stintwork/local/\n",
    ".stintwork/config": "checks:\n  - name: Test\n    command: node check.cjs\n",
    "check.cjs": "console.log('passed');\n",
    ".scratch/first/spec.md": "# First\nBound the input.",
    ".scratch/first/issues/01-limit.md": "# Limit\nStatus: resolved\nBlocked by: none",
    ".scratch/first/workflow.yaml": "workflow: feature\nstage: review\n",
    "src/example.ts": "export const limit = 1;\n",
  }))
    await write(root, path, text);
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "Fixture");
  let reviewCount = 0;
  const project = createProjectServer(root, join(root, "web"), {
    agentRegistry: createAgentRegistry([
      { ...fakeAgentProfiles.codex, launch: createFakeAgentLauncher([]) },
      { ...fakeAgentProfiles.claude, launch: createFakeAgentLauncher([]) },
    ]),
    handoffTimeoutMs: 3000,
    launchAgent: (options) => {
      const isReview = options.prompt.includes("/code-review");
      const reply = isReview ? (replies[reviewCount++] ?? "No findings") : "No findings";
      return createFakeAgentLauncher(reviewCount === 1 ? work : [], [], {
        profile: options.agent === "claude" ? "claude" : "codex",
        afterTurnRequests: [
          [{ type: "message", text: handoff }],
          [{ type: "message", text: reply }],
        ],
      })(options);
    },
  });
  fixtures.push({ parent, project });
  return { root, project };
}
afterEach(async () => {
  for (const { parent, project } of fixtures.splice(0)) {
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});
function post(project: ReturnType<typeof createProjectServer>, path: string, body = {}) {
  return project.app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function item(project: ReturnType<typeof createProjectServer>) {
  const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  return snapshot.workItems[0];
}
async function stint(project: ReturnType<typeof createProjectServer>) {
  const response = await post(project, "/api/stints", { workItem: "first" });
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(201);
  const { stint: started } = body;
  let result: Stint | undefined;
  await expect
    .poll(async () => {
      ({ stint: result } = await (await project.app.request(`/api/stints/${started.id}`)).json());
      return result?.status;
    })
    .toBe("finished");
  return result as Stint;
}
async function checks(project: ReturnType<typeof createProjectServer>) {
  expect((await post(project, `${endpoint}/checks`)).status).toBe(202);
  let result: WorkItemChecks | undefined;
  await expect
    .poll(async () => {
      result = await (await project.app.request(`${endpoint}/checks`)).json();
      return result?.checkExecution;
    })
    .toBeNull();
  expect(result?.checks.every(({ status }) => status === "passed")).toBe(true);
  return result as WorkItemChecks;
}
async function refused(project: ReturnType<typeof createProjectServer>) {
  const response = await post(project, `${endpoint}/gates/review/approve`);
  expect(response.status).toBe(409);
  expect((await item(project)).stage).toBe("review");
  return response.json();
}

test("server refuses missing evidence, keeps decisions and gate-agent commits fresh, and requires fresh evidence after code changes", async () => {
  const { project } = await fixture();
  await refused(project);
  const review = await stint(project);
  const report = review.findings;
  await checks(project);
  expect((await refused(project)).conditions).toContainEqual(
    expect.objectContaining({ id: "findings", ready: false }),
  );
  const decision = await post(project, `${endpoint}/findings/decision`, {
    id: report?.findings?.[0].id,
    status: "accepted",
    reason: "Intentional",
  });
  expect(decision.status).toBe(200);
  const accepted = await item(project);
  expect(accepted.headCommit).not.toBe(report?.commit);
  expect(accepted.evidenceChangedPaths?.[report?.commit as string]).toEqual([
    ".scratch/first/review.yaml",
  ]);
  expect(evidenceStale(accepted, report?.commit as string)).toBe(false);
  expect(gateReadiness(accepted).ready).toBe(true);
  const agent = await post(project, `${endpoint}/stages/review/agent`, { agent: "claude" });
  expect(agent.status).toBe(200);
  const selected = await item(project);
  expect(selected.headCommit).not.toBe(accepted.headCommit);
  expect(gateReadiness(selected).ready).toBe(true);
  const checkEvidence: WorkItemChecks = await (
    await project.app.request(`${endpoint}/checks`)
  ).json();
  expect(evidenceStale({ slug: "first", ...checkEvidence }, checkEvidence.checks[0].commit)).toBe(
    false,
  );
  const readySnapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  expect(readySnapshot.attentionItems).toContainEqual(
    expect.objectContaining({ kind: "gate-ready", stage: "review" }),
  );
  await write(review.worktree.path, "src/example.ts", "export const limit = 2;\n");
  git(review.worktree.path, "add", "src/example.ts");
  git(review.worktree.path, "commit", "--quiet", "-m", "Change code");
  const codeHead = git(review.worktree.path, "rev-parse", "HEAD");
  expect((await refused(project)).conditions).toContainEqual(
    expect.objectContaining({ id: "freshness", ready: false }),
  );
  const stale = await item(project);
  expect(evidenceStale(stale, report?.commit as string)).toBe(true);
  expect(evidenceStale(stale, stale.checks?.[0].commit as string)).toBe(true);
  expect(git(review.worktree.path, "rev-parse", "HEAD")).toBe(codeHead);
  await checks(project);
  await refused(project);
  const fresh = await stint(project);
  expect(fresh.findings).toMatchObject({ commit: codeHead, findings: [] });
  expect((await item(project)).stints).toHaveLength(2);
  expect(gateReadiness(await item(project)).ready).toBe(true);
  const approved = await post(project, `${endpoint}/gates/review/approve`);
  expect(approved.status).toBe(200);
  expect(await approved.json()).toMatchObject({ stage: "ship", record: { commit: codeHead } });
  expect(
    await readFile(join(review.worktree.path, ".scratch/first/workflow.yaml"), "utf8"),
  ).toContain("stage: ship");
  expect((await item(project)).stage).toBe("ship");
});

test("sent-back findings are not decided evidence; after Implement a new Review replaces their history", async () => {
  const { project } = await fixture();
  await stint(project);
  await checks(project);
  const sentBack = await post(project, `${endpoint}/findings/send-back`);
  expect(sentBack.status).toBe(200);
  expect((await item(project)).stage).toBe("implement");
  await stint(project);
  expect((await post(project, `${endpoint}/gates/implement/approve`)).status).toBe(200);
  const previous = await item(project);
  expect(previous.reviewDecisions?.[0].status).toBe("sent-back");
  expect((await refused(project)).reason).toContain("stage stint must finish");
  await stint(project);
  expect(gateReadiness(await item(project)).ready).toBe(true);
  expect((await post(project, `${endpoint}/findings/send-back`)).status).toBe(409);
  expect((await post(project, `${endpoint}/gates/review/approve`)).status).toBe(200);
});

test("parse failure cannot substitute for a no-findings report", async () => {
  const { project } = await fixture(["Invalid findings", "No findings"]);
  await stint(project);
  await checks(project);
  expect((await refused(project)).conditions).toContainEqual(
    expect.objectContaining({ id: "review", ready: false }),
  );
  await stint(project);
  expect((await post(project, `${endpoint}/gates/review/approve`)).status).toBe(200);
});

test("fresh findings still need passing evidence for the current configured command", async () => {
  const { project, root } = await fixture(["No findings"]);
  const review = await stint(project);
  expect((await refused(project)).conditions).toContainEqual(
    expect.objectContaining({ id: "checks", ready: false }),
  );
  await checks(project);
  await write(
    root,
    ".stintwork/config",
    "checks:\n  - name: Test\n    command: node -e 'process.exit(1)'\n",
  );
  expect((await refused(project)).conditions).toContainEqual(
    expect.objectContaining({ id: "checks", ready: false }),
  );
  expect((await post(project, `${endpoint}/checks`)).status).toBe(202);
  await expect.poll(async () => (await item(project)).checks?.[0].status).toBe("failed");
  await refused(project);
  expect(git(review.worktree.path, "rev-parse", "HEAD")).toBe(review.baseCommit);
});

test.each(["accepted", "rejected"] as const)(
  "open memory proposals block approval until %s",
  async (status) => {
    const { project } = await fixture(
      ["No findings", "No findings"],
      [{ type: "write", path: "GLOSSARY.md", content: "Proposed glossary\n" }],
    );
    await stint(project);
    await stint(project);
    await checks(project);
    const before = await item(project);
    const proposal = before.memoryProposals?.[0];
    expect(proposal).toBeDefined();
    const condition = (await refused(project)).conditions.find(
      (entry: { id: string }) => entry.id === "memory",
    );
    expect(condition).toMatchObject({ ready: false });
    expect(
      (await post(project, `${endpoint}/memory-proposals/decision`, { id: proposal?.id, status }))
        .status,
    ).toBe(200);
    if (status === "rejected") {
      expect((await refused(project)).conditions).toContainEqual(
        expect.objectContaining({ id: "freshness", ready: false }),
      );
      await stint(project);
      await checks(project);
    }
    expect(gateReadiness(await item(project)).ready).toBe(true);
    expect((await post(project, `${endpoint}/gates/review/approve`)).status).toBe(200);
  },
);

test("invalid review bookkeeping fails closed instead of losing decisions or proposals", async () => {
  const { project } = await fixture(["No findings"]);
  const review = await stint(project);
  await checks(project);
  await write(review.worktree.path, ".scratch/first/review.yaml", "decisions: [");
  expect((await refused(project)).reason).toContain("Cannot read Review evidence");
});
