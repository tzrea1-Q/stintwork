import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createFakeAgentLauncher, type FakeAgentStep } from "@stintwork/agents/testing";
import {
  type ProjectSnapshot,
  type MemoryProposalAttentionItem,
  type Stint,
  parseReviewDecisions,
} from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { createProjectServer } from "./index.js";
import { saveWorkItemReview } from "./review-writes.js";

const fixtures: { parent: string; projects: ReturnType<typeof createProjectServer>[] }[] = [];
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
async function fixture(work?: readonly FakeAgentStep[]) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-memory-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  git(root, "config", "user.name", "Developer");
  git(root, "config", "user.email", "developer@example.invalid");
  for (const [path, content] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    "AGENTS.md": "Conventions",
    "GLOSSARY.md": "# Original glossary\n",
    ".gitignore": ".stintwork/local/\n",
    ".scratch/first/workflow.yaml":
      "workflow: feature\nstage: implement\nstages:\n  implement:\n    agent: codex\n",
    ".scratch/first/spec.md": "# First work item",
    ".scratch/first/issues/06-memory.md":
      "# Memory proposals\nStatus: ready-for-agent\nBlocked by: none",
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Fixture");
  let count = 0;
  const launchAgent: NonNullable<Parameters<typeof createProjectServer>[2]>["launchAgent"] = (
    options,
  ) =>
    createFakeAgentLauncher(
      work ?? [
        { type: "write", path: "GLOSSARY.md", content: `# Proposed glossary ${++count}\n` },
        { type: "write", path: "implementation.txt", content: "Not project memory" },
      ],
      [
        {
          type: "message",
          text: "## Where I stopped\nMemory proposed.\n## Unresolved\nNone\n## Suggested next\nReview the proposal.",
        },
      ],
    )(options);
  const tracked = { parent, projects: [] as ReturnType<typeof createProjectServer>[] };
  fixtures.push(tracked);
  function open() {
    const project = createProjectServer(root, join(root, "web"), {
      launchAgent,
      handoffTimeoutMs: 1000,
    });
    tracked.projects.push(project);
    return project;
  }
  return { root, project: open(), open };
}
afterEach(async () => {
  for (const { parent, projects } of fixtures.splice(0)) {
    for (const project of projects) await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});
async function snapshot(project: ReturnType<typeof createProjectServer>): Promise<ProjectSnapshot> {
  return (await project.app.request("/api/project")).json();
}
async function start(project: ReturnType<typeof createProjectServer>) {
  const response = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 6, agent: "codex" }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { stint: Stint }).stint;
}
async function completed(project: ReturnType<typeof createProjectServer>, id: string) {
  await expect
    .poll(
      async () =>
        (await snapshot(project)).workItems[0].stints.find((stint) => stint.id === id)?.endedAt,
    )
    .toBeTruthy();
  return snapshot(project);
}
function decide(
  project: ReturnType<typeof createProjectServer>,
  proposal: MemoryProposalAttentionItem,
  status: "accepted" | "rejected",
  reason = "",
) {
  return project.app.request("/api/work-items/first/memory-proposals/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: proposal.id, status, reason }),
  });
}

test.each(["accepted", "rejected"] as const)(
  "a fake-agent glossary proposal is %s on the branch and survives restart",
  async (status) => {
    const { root, project, open } = await fixture();
    const started = await start(project);
    const ended = await completed(project, started.id);
    const proposals = ended.workItems[0].memoryProposals ?? [];
    expect(proposals).toHaveLength(1);
    const [proposal] = proposals;
    expect(proposal).toMatchObject({
      path: "GLOSSARY.md",
      stintId: started.id,
      baseCommit: started.baseCommit,
    });
    expect(proposal.diff).toContain("-# Original glossary");
    expect(proposal.diff).toContain("+# Proposed glossary 1");
    expect(ended.attentionItems).toContainEqual(proposal);
    expect(ended.warnings.filter(({ message }) => message.includes("memory proposals"))).toEqual(
      [],
    );
    await project.stop();
    const restarted = open();
    expect((await snapshot(restarted)).workItems[0].memoryProposals).toEqual([proposal]);
    const response = await decide(restarted, proposal, status, "Developer reviewed");
    expect(response.status).toBe(200);
    const { decision, commit } = await response.json();
    expect(decision).toMatchObject({
      id: proposal.id,
      kind: "memory-proposal",
      status,
      reason: "Developer reviewed",
      by: "Developer",
      at: expect.any(String),
    });
    const reviewPath = ".scratch/first/review.yaml";
    expect(
      parseReviewDecisions(await readFile(join(started.worktree.path, reviewPath), "utf8")),
    ).toEqual([decision]);
    expect(parseReviewDecisions(git(root, "show", `${commit}:${reviewPath}`))).toEqual([decision]);
    expect(git(root, "show", `${commit}:GLOSSARY.md`)).toBe(
      status === "accepted" ? "# Proposed glossary 1" : "# Original glossary",
    );
    expect(git(root, "show", `${commit}:implementation.txt`)).toBe("Not project memory");
    expect(git(root, "show", "HEAD:GLOSSARY.md")).toBe("# Original glossary");
    expect(
      (await snapshot(restarted)).attentionItems.some((item) => item.kind === "memory-proposal"),
    ).toBe(false);
    if (status === "rejected")
      expect(git(root, "log", "-1", "--format=%s", started.worktree.branch)).toContain(proposal.id);
    await restarted.stop();
    const final = open();
    expect((await snapshot(final)).workItems[0]).toMatchObject({
      memoryProposals: [],
      reviewDecisions: [decision],
    });
    const head = git(started.worktree.path, "rev-parse", "HEAD");
    expect((await decide(final, proposal, status, "Developer reviewed")).status).toBe(200);
    expect(git(started.worktree.path, "rev-parse", "HEAD")).toBe(head);
    expect(
      (await decide(final, proposal, status === "accepted" ? "rejected" : "accepted")).status,
    ).toBe(409);
  },
);

test("each stint has its own proposal for the same file; reject restores the stint base, including later commits", async () => {
  const { project } = await fixture();
  const first = await start(project);
  await completed(project, first.id);
  const second = await start(project);
  const ended = await completed(project, second.id);
  const proposals = ended.workItems[0].memoryProposals ?? [];
  expect(proposals).toHaveLength(2);
  const later = proposals.find(
    (proposal) => proposal.stintId === second.id,
  ) as MemoryProposalAttentionItem;
  expect(later.diff).toContain("-# Proposed glossary 1");
  expect(later.diff).toContain("+# Proposed glossary 2");
  await writeFile(join(second.worktree.path, "GLOSSARY.md"), "Later committed changes\n");
  git(second.worktree.path, "add", "GLOSSARY.md");
  git(second.worktree.path, "commit", "--quiet", "-m", "Later edits");
  expect((await decide(project, later, "rejected")).status).toBe(200);
  expect(await readFile(join(second.worktree.path, "GLOSSARY.md"), "utf8")).toBe(
    "# Proposed glossary 1\n",
  );
  expect(
    (await snapshot(project)).workItems[0].memoryProposals?.map(({ stintId }) => stintId),
  ).toEqual([first.id]);
});

test("memory decisions share the committed review file without losing finding decisions", async () => {
  const { project } = await fixture();
  const started = await start(project);
  const ended = await completed(project, started.id);
  const finding = {
    id: "finding-1",
    kind: "finding" as const,
    status: "resolved" as const,
    reason: "Fixed",
    by: "Developer",
    at: "2026-10-10T10:00:00Z",
  };
  await saveWorkItemReview(started.worktree.path, "first", finding);
  const proposal = ended.workItems[0].memoryProposals?.[0] as MemoryProposalAttentionItem;
  expect((await decide(project, proposal, "accepted")).status).toBe(200);
  const entries = parseReviewDecisions(
    await readFile(join(started.worktree.path, ".scratch/first/review.yaml"), "utf8"),
  );
  expect(entries).toHaveLength(2);
  expect(entries[0]).toEqual(finding);
  expect(entries[1]).toMatchObject({ kind: "memory-proposal", status: "accepted" });
});

test("decisions reject bad requests and do not overwrite dirty memory or malformed reviews", async () => {
  const { project } = await fixture();
  const started = await start(project);
  const ended = await completed(project, started.id);
  const proposal = ended.workItems[0].memoryProposals?.[0] as MemoryProposalAttentionItem;
  const url = "/api/work-items/first/memory-proposals/decision";
  expect(
    (
      await project.app.request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://elsewhere.invalid" },
        body: JSON.stringify({ id: proposal.id, status: "accepted" }),
      })
    ).status,
  ).toBe(403);
  for (const body of [
    "{",
    JSON.stringify({ id: proposal.id, status: "resolved" }),
    JSON.stringify({ id: proposal.id, status: ["accepted"] }),
    JSON.stringify({ id: proposal.id, status: "accepted", reason: 1 }),
  ])
    expect(
      (
        await project.app.request(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      ).status,
    ).toBe(400);
  expect((await decide(project, { ...proposal, id: "not-a-proposal" }, "accepted")).status).toBe(
    404,
  );
  await writeFile(join(started.worktree.path, "GLOSSARY.md"), "Uncommitted developer work\n");
  expect((await decide(project, proposal, "rejected")).status).toBe(409);
  expect(await readFile(join(started.worktree.path, "GLOSSARY.md"), "utf8")).toBe(
    "Uncommitted developer work\n",
  );
  expect((await snapshot(project)).workItems[0].memoryProposals).toHaveLength(1);
  await writeFile(join(started.worktree.path, ".scratch/first/review.yaml"), "decisions: broken\n");
  expect((await decide(project, proposal, "accepted")).status).toBe(409);
  expect(await readFile(join(started.worktree.path, ".scratch/first/review.yaml"), "utf8")).toBe(
    "decisions: broken\n",
  );
});

test("no non-memory changes become proposals; active stints cannot be decided", async () => {
  const { project } = await fixture([
    { type: "write", path: "implementation.txt", content: "Code" },
    { type: "hang" },
  ]);
  const started = await start(project);
  const response = await project.app.request("/api/work-items/first/memory-proposals/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "proposal", status: "accepted" }),
  });
  expect(response.status).toBe(409);
  await project.app.request(`/api/stints/${started.id}/stop`, { method: "POST" });
  expect((await completed(project, started.id)).workItems[0].memoryProposals).toEqual([]);
});
