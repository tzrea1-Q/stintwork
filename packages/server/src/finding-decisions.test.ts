// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAgentRegistry } from "@stintwork/agents";
import { createFakeAgentLauncher, fakeAgentProfiles } from "@stintwork/agents/testing";
import {
  indexProject,
  parseReviewDecisions,
  parseReviewDeveloperNotes,
  type Brief,
  type Stint,
  type WorkflowId,
} from "@stintwork/core";
import { ensureWorktree } from "@stintwork/git";
import { Hono } from "hono";
import { afterEach, expect, test, vi } from "vitest";
import { addBriefPreviewRoute } from "./brief-preview.js";
import { createNodeRepoFiles } from "./repo-files.js";
import { addStintHistoryRoute } from "./stint-history.js";
import { addStintRoutes } from "./stints.js";
import { createProjectFiles } from "./work-item-files.js";
import * as reviewWrites from "./review-writes.js";

const fixtures: { parent: string; stop: () => Promise<void> }[] = [];
const reviewPath = ".scratch/example/review.yaml";
const workflowPath = ".scratch/example/workflow.yaml";
const handoff = "## Where I stopped\nFinished.\n## Unresolved\nNone\n## Suggested next\nReview.";
const findings = ["Missing limit", "Naming mismatch", "Extra finding", "Resolved finding"]
  .map(
    (title) =>
      `## Finding\nAxis: Spec\nSeverity: major\nPath: src/example.ts\nLine: 1\nTitle: ${title}\n### Body\n${title} needs attention.`,
  )
  .join("\n\n");

function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fixture(workflow: WorkflowId = "feature", approved = true) {
  const parent = mkdtempSync(join(tmpdir(), "stintwork-finding-decisions-"));
  const root = join(parent, "project");
  git(parent, "init", "--quiet", "--initial-branch=main", root);
  git(root, "config", "user.name", "Developer Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  const implementation = workflow === "feature" ? "implement" : workflow === "bug" ? "fix" : "do";
  for (const [path, text] of Object.entries({
    ".gitignore": ".stintwork/local/\n",
    ".scratch/example/spec.md": "# Example\nLimit input.",
    ".scratch/example/issues/01-limit.md": "# Limit\nStatus: resolved\nBlocked by: none",
    ...(approved
      ? {
          [workflowPath]: `workflow: ${workflow}\nstage: review\nstages:\n  ${implementation}:\n    approved: {by: Developer Tests, at: '2026-10-09T10:00:00Z', commit: previous}\n`,
        }
      : {}),
    "src/example.ts": "export const limit = 1;\n",
  })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Fixture");
  const review = createFakeAgentLauncher([], [], {
    afterTurnRequests: [
      [{ type: "message", text: handoff }],
      [{ type: "message", text: findings }],
    ],
  });
  const implement = createFakeAgentLauncher(
    [
      { type: "expect-prompt", includes: "## Review findings" },
      { type: "expect-prompt", includes: "From review" },
      { type: "expect-prompt", includes: "Missing limit" },
      { type: "expect-prompt", includes: "src/example.ts:1" },
      { type: "message", text: "Feedback received." },
    ],
    [{ type: "message", text: handoff }],
  );
  const registry = createAgentRegistry([
    {
      ...fakeAgentProfiles.codex,
      launch: (options) =>
        (options.prompt.includes("/code-review") ? (holdReview ? heldReview : review) : implement)(
          options,
        ),
    },
  ]);
  const app = new Hono();
  const readProjectFiles = createProjectFiles(root);
  const refresh = vi.fn();
  let checking = false;
  let holdReview = false;
  const heldReview = createFakeAgentLauncher(
    [{ type: "hang" }],
    [{ type: "message", text: handoff }],
  );
  const stop = addStintRoutes(
    app,
    root,
    readProjectFiles,
    { agentRegistry: registry, handoffTimeoutMs: 3000 },
    () => {},
    refresh,
    () => checking,
  );
  addStintHistoryRoute(app, createNodeRepoFiles(root));
  addBriefPreviewRoute(app, readProjectFiles, root, registry);
  app.get("/api/project", (context) =>
    context.json(indexProject(readProjectFiles().files, { name: "Project" })),
  );
  fixtures.push({ parent, stop });
  return {
    root,
    app,
    readProjectFiles,
    refresh,
    setChecking: (value: boolean) => {
      checking = value;
    },
    setHoldReview: (value: boolean) => {
      holdReview = value;
    },
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const { parent, stop } of fixtures.splice(0)) {
    await stop();
    rmSync(parent, { recursive: true, force: true });
  }
});

function post(app: Hono, path: string, body: unknown = {}) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function decide(app: Hono, id: string, status: string, reason = "") {
  return post(app, "/api/work-items/example/findings/decision", { id, status, reason });
}
async function start(app: Hono, ticket: number | null = null) {
  const response = await post(app, "/api/stints", { workItem: "example", agent: "codex", ticket });
  expect(response.status).toBe(201);
  return (await response.json()).stint as Stint;
}
async function ended(app: Hono, id: string) {
  let stint: Stint;
  await expect
    .poll(
      async () => {
        ({ stint } = await (await app.request(`/api/stints/${id}`)).json());
        return stint.status;
      },
      { timeout: 5000 },
    )
    .not.toBe("running");
  return (await (await app.request(`/api/stints/${id}`)).json()).stint as Stint;
}
async function reviewed(workflow: WorkflowId = "feature") {
  const context = fixture(workflow);
  const stint = await ended(context.app, (await start(context.app)).id);
  expect(stint.status, stint.error).toBe("finished");
  expect(stint.findings?.findings).toHaveLength(4);
  return {
    ...context,
    stint,
    ids: stint.findings?.findings?.map((finding) => finding.id) ?? [],
    worktree: stint.worktree.path,
  };
}

test("resolve, accept with reason and reopen persist one decision per finding id, with identity and commits", async () => {
  const { root, app, worktree, ids, refresh } = await reviewed();
  writeFileSync(join(worktree, "unrelated.txt"), "Keep staged work");
  git(worktree, "add", "unrelated.txt");
  for (const [status, reason] of [
    ["resolved", ""],
    ["accepted", "  Existing callers need this.  "],
    ["open", ""],
  ]) {
    const response = await decide(app, ids[0], status, reason);
    expect(response.status).toBe(200);
    const { decision, commit } = await response.json();
    expect(decision).toEqual({
      id: ids[0],
      kind: "finding",
      status,
      reason: reason.trim(),
      by: "Developer Tests",
      at: expect.any(String),
    });
    expect(Number.isFinite(Date.parse(decision.at))).toBe(true);
    expect(git(worktree, "log", "-1", "--format=%s")).toBe(
      `Record finding ${ids[0]} as ${status} for example`,
    );
    expect(git(worktree, "show", "--format=", "--name-only", commit)).toBe(reviewPath);
    expect(parseReviewDecisions(readFileSync(join(worktree, reviewPath), "utf8"))).toEqual([
      decision,
    ]);
    const snapshot = await (await app.request("/api/project")).json();
    expect(snapshot.workItems[0].reviewDecisions).toEqual([decision]);
  }
  expect(git(worktree, "diff", "--cached", "--name-only")).toBe("unrelated.txt");
  expect(existsSync(join(root, reviewPath))).toBe(false);
  expect(refresh).toHaveBeenCalled();
  const before = git(worktree, "rev-parse", "HEAD");
  expect((await decide(app, ids[0], "open")).status).toBe(200);
  expect(git(worktree, "rev-parse", "HEAD")).toBe(before);
});

test("send back atomically reopens Implement, includes only open findings and consumes review notes on start", async () => {
  const { app, root, worktree, ids } = await reviewed();
  expect((await decide(app, ids[1], "accepted", "Deliberate compatibility")).status).toBe(200);
  expect((await decide(app, ids[3], "resolved")).status).toBe(200);
  const before = git(worktree, "rev-parse", "HEAD");
  const response = await post(app, "/api/work-items/example/findings/send-back");
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result).toMatchObject({
    stage: "implement",
    record: { by: "Developer Tests", commit: before },
    decisions: [
      { id: ids[0], status: "sent-back" },
      { id: ids[2], status: "sent-back" },
    ],
  });
  expect(git(worktree, "show", "--format=", "--name-only", result.commit).split("\n")).toEqual([
    reviewPath,
    workflowPath,
  ]);
  for (const id of [ids[0], ids[2]])
    expect(git(worktree, "log", "-1", "--format=%B")).toContain(
      `Record finding ${id} as sent-back for example`,
    );
  const snapshot = await (await app.request("/api/project")).json();
  expect(snapshot.workItems[0]).toMatchObject({
    stage: "implement",
    stages: {
      implement: {
        reopened: result.record,
        approved: { by: "Developer Tests", at: "2026-10-09T10:00:00Z", commit: "previous" },
      },
    },
  });
  expect(readFileSync(join(root, workflowPath), "utf8")).toContain("stage: review");
  const reviewText = readFileSync(join(worktree, reviewPath), "utf8");
  expect(parseReviewDecisions(reviewText).find((decision) => decision.id === ids[1])).toMatchObject(
    { status: "accepted" },
  );
  const notes = parseReviewDeveloperNotes(reviewText);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ source: "review", at: result.record.at });
  for (let preview = 0; preview < 2; preview++) {
    const brief: Brief = await (await app.request("/api/work-items/example/brief-preview")).json();
    expect(brief.developerNotes).toEqual(notes);
    expect(brief.prompt).toContain("Review note (");
    expect(brief.prompt).toContain("## Review findings");
    expect(brief.prompt).toContain("Missing limit");
    expect(brief.prompt).toContain("Extra finding");
    expect(brief.prompt).not.toContain("Naming mismatch");
    expect(brief.prompt).not.toContain("Resolved finding");
  }
  const implement = await start(app);
  expect(implement.brief.developerNotes).toEqual(notes);
  expect((await ended(app, implement.id)).status).toBe("finished");
  const next: Brief = await (await app.request("/api/work-items/example/brief-preview")).json();
  expect(next.developerNotes).toEqual([]);
  expect(next.prompt).not.toContain("## Review findings");
  expect(parseReviewDeveloperNotes(readFileSync(join(worktree, reviewPath), "utf8"))).toEqual(
    notes,
  );
  expect((await post(app, "/api/work-items/example/findings/send-back")).status).toBe(409);
});

test("send back reopens inferred Review after only a review-agent choice, without inventing approval", async () => {
  const { app, root } = fixture("feature", false);
  const inferred = await (await app.request("/api/project")).json();
  expect(inferred.workItems[0]).toMatchObject({ stage: "review", inferred: true, stages: {} });
  await ensureWorktree(root, "example");
  expect(
    (await post(app, "/api/work-items/example/stages/review/agent", { agent: "codex" })).status,
  ).toBe(200);
  const review = await ended(app, (await start(app)).id);
  expect(review.status, review.error).toBe("finished");
  expect(review.findings?.findings).toHaveLength(4);
  const worktree = review.worktree.path;
  const chosen = await (await app.request("/api/project")).json();
  expect(chosen.workItems[0].stages).toEqual({ review: { agent: "codex" } });
  const before = git(worktree, "rev-parse", "HEAD");
  const response = await post(app, "/api/work-items/example/findings/send-back");
  expect(response.status, await response.clone().text()).toBe(200);
  const result = await response.json();
  expect(result).toMatchObject({
    stage: "implement",
    record: { by: "Developer Tests", at: expect.any(String), commit: before, source: "review" },
    decisions: review.findings?.findings?.map(({ id }) => ({ id, status: "sent-back" })),
  });
  expect(git(worktree, "rev-list", "--count", `${before}..HEAD`)).toBe("1");
  expect(git(worktree, "show", "--format=", "--name-only", result.commit).split("\n")).toEqual([
    reviewPath,
    workflowPath,
  ]);
  const reopened = await (await app.request("/api/project")).json();
  expect(reopened.workItems[0]).toMatchObject({
    stage: "implement",
    inferred: false,
    stages: { implement: { reopened: result.record }, review: { agent: "codex" } },
  });
  expect(reopened.workItems[0].stages.implement.approved).toBeUndefined();
  expect(
    reopened.workItems[0].tickets.every(({ resolved }: { resolved: boolean }) => resolved),
  ).toBe(true);
  const preview: Brief = await (await app.request("/api/work-items/example/brief-preview")).json();
  expect(preview.developerNotes).toHaveLength(1);
  expect(preview.developerNotes?.[0]).toMatchObject({ source: "review", at: result.record.at });
  expect(preview.prompt).toContain("## Review findings");
  expect(preview.prompt).toContain("Missing limit needs attention.");
  const implement = await start(app);
  expect(implement.stage).toBe("implement");
  expect(implement.brief.developerNotes).toEqual(preview.developerNotes);
  expect((await ended(app, implement.id)).status).toBe("finished");
  const consumed: Brief = await (await app.request("/api/work-items/example/brief-preview")).json();
  expect(consumed.developerNotes).toEqual([]);
  expect(consumed.prompt).not.toContain("## Review findings");
});

test.each([
  { id: "finding", status: "accepted" },
  { id: "finding", status: "accepted", reason: " " },
  { id: "finding", status: "resolved", reason: 42 },
  { id: "finding", status: ["open"] },
  { id: "finding", status: "sent-back" },
  { id: "", status: "open" },
  [],
  null,
])("rejects invalid finding actions: %j", async (body) => {
  const { app } = fixture();
  expect((await post(app, "/api/work-items/example/findings/decision", body)).status).toBe(400);
});

test("rejects foreign origins and invalid JSON without touching the branch", async () => {
  const { app } = fixture();
  const path = "/api/work-items/example/findings/decision";
  expect(
    (await app.request(path, { method: "POST", headers: { Origin: "https://foreign.invalid" } }))
      .status,
  ).toBe(403);
  expect((await app.request(path, { method: "POST" })).status).toBe(400);
  expect(
    (
      await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    ).status,
  ).toBe(400);
  expect((await post(app, "/api/work-items/missing/findings/send-back")).status).toBe(404);
});

test("unknown findings, active checks, dirty review files and invalid workflow files cannot be decided or sent back", async () => {
  const { app, ids, worktree, setChecking } = await reviewed();
  expect((await decide(app, "unknown:1", "resolved")).status).toBe(404);
  setChecking(true);
  expect((await decide(app, ids[0], "resolved")).status).toBe(409);
  expect((await post(app, "/api/work-items/example/findings/send-back")).status).toBe(409);
  setChecking(false);
  writeFileSync(join(worktree, reviewPath), "decisions: []\n");
  expect((await decide(app, ids[0], "resolved")).status).toBe(409);
  expect((await post(app, "/api/work-items/example/findings/send-back")).status).toBe(409);
  rmSync(join(worktree, reviewPath));
  writeFileSync(join(worktree, workflowPath), "workflow: [\n");
  expect((await post(app, "/api/work-items/example/findings/send-back")).status).toBe(409);
  expect(existsSync(join(worktree, reviewPath))).toBe(false);
});

test.each([
  ["bug", "fix"],
  ["quick", "do"],
] as const)(
  "send back reuses the %s workflow's %s gate and consumes its note",
  async (workflow, stage) => {
    const { app, worktree } = await reviewed(workflow);
    const response = await post(app, "/api/work-items/example/findings/send-back");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stage });
    const previewPath =
      workflow === "quick"
        ? "/api/work-items/example/tickets/1/brief-preview"
        : "/api/work-items/example/brief-preview";
    if (workflow === "quick")
      writeFileSync(
        join(worktree, ".scratch/example/issues/01-limit.md"),
        "# Limit\nStatus: ready-for-agent\nBlocked by: none",
      );
    const preview: Brief = await (await app.request(previewPath)).json();
    expect(preview.prompt).toContain("## Review findings");
    const next = await start(app, workflow === "quick" ? 1 : null);
    expect(next.stage).toBe(stage);
    expect((await ended(app, next.id)).status).toBe("finished");
    const later: Brief = await (await app.request(previewPath)).json();
    expect(later.developerNotes).toEqual([]);
  },
);

test("no open findings means no send-back write or developer note", async () => {
  const { app, ids, worktree } = await reviewed();
  for (const id of ids) expect((await decide(app, id, "resolved")).status).toBe(200);
  const head = git(worktree, "rev-parse", "HEAD");
  expect((await post(app, "/api/work-items/example/findings/send-back")).status).toBe(409);
  expect(git(worktree, "rev-parse", "HEAD")).toBe(head);
  expect(parseReviewDeveloperNotes(readFileSync(join(worktree, reviewPath), "utf8"))).toEqual([]);
});

test("active review stints cannot be decided or sent back", async () => {
  const { app, ids, setHoldReview } = await reviewed();
  setHoldReview(true);
  const active = await start(app);
  expect(active.status).toBe("running");
  expect((await decide(app, ids[0], "resolved")).status).toBe(409);
  expect((await post(app, "/api/work-items/example/findings/send-back")).status).toBe(409);
});

test("failed send-back commits roll back workflow, decisions and review notes", async () => {
  const { app, worktree } = await reviewed();
  const before = git(worktree, "rev-parse", "HEAD");
  const workflow = readFileSync(join(worktree, workflowPath), "utf8");
  const hook = git(worktree, "rev-parse", "--git-path", "hooks/pre-commit");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n");
  chmodSync(hook, 0o755);
  expect((await post(app, "/api/work-items/example/findings/send-back")).status).toBe(409);
  expect(git(worktree, "rev-parse", "HEAD")).toBe(before);
  expect(readFileSync(join(worktree, workflowPath), "utf8")).toBe(workflow);
  expect(existsSync(join(worktree, reviewPath))).toBe(false);
  expect(git(worktree, "status", "--porcelain")).toBe("");
});

test("a concurrent finding or gate write is refused while send back is committing", async () => {
  const { app, ids } = await reviewed();
  const original = reviewWrites.saveWorkItemReview;
  let release = () => {};
  let entered = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(reviewWrites, "saveWorkItemReview").mockImplementation(async (...args) => {
    entered();
    await blocked;
    return original(...args);
  });
  const pending = post(app, "/api/work-items/example/findings/send-back");
  await started;
  try {
    expect((await decide(app, ids[0], "resolved")).status).toBe(409);
    expect((await post(app, "/api/work-items/example/gates/implement/reopen")).status).toBe(409);
    expect((await post(app, "/api/stints", { workItem: "example", agent: "codex" })).status).toBe(
      409,
    );
  } finally {
    release();
  }
  expect((await pending).status).toBe(200);
});
