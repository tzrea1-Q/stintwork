import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { createAgentLauncher, type AgentLauncher } from "@stintwork/agents";
import { createFakeAgentLauncher } from "@stintwork/agents/testing";
import {
  foldStintLog,
  type ProjectSnapshot,
  type Stint,
  type StintLogEntry,
} from "@stintwork/core";
import { afterEach, expect, test, vi } from "vitest";
import { createProjectServer } from "./index.js";

const fixtures: { parent: string; project: ReturnType<typeof createProjectServer> }[] = [];
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
async function fixture(launchAgent: AgentLauncher, extra: Record<string, string> = {}) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-readiness-"));
  const root = join(parent, "project");
  git(parent, "init", "--quiet", "--initial-branch=main", root);
  for (const [path, text] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    ".scratch/first/spec.md": "# First",
    ".scratch/first/issues/01-first.md": "# First\nStatus: ready-for-agent\nBlocked by: none",
    ".scratch/second/spec.md": "# Second",
    ".scratch/second/issues/01-second.md": "# Second\nStatus: ready-for-agent\nBlocked by: none",
    ...extra,
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  if (extra["package.json"]) {
    execFileSync(
      "pnpm",
      ["--config.verify-deps-before-run=false", "install", "--lockfile-only", "--offline"],
      { cwd: root, stdio: "pipe" },
    );
  }
  git(root, "add", "--all");
  git(
    root,
    "-c",
    "user.name=Tests",
    "-c",
    "user.email=tests@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "Fixture",
  );
  const project = createProjectServer(root, join(root, "web"), {
    launchAgent,
    handoffTimeoutMs: 1000,
  });
  fixtures.push({ parent, project });
  return { root, project };
}
afterEach(async () => {
  for (const { parent, project } of fixtures.splice(0)) {
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});
function start(project: ReturnType<typeof createProjectServer>, workItem = "first") {
  return project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem, ticket: 1, agent: "codex" }),
  });
}
async function ended(root: string, id: string) {
  const path = join(root, `.stintwork/local/stints/${id}.jsonl`);
  const read = async () =>
    foldStintLog(
      (await readFile(path, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ) as Stint;
  await expect.poll(async () => (await read()).status, { timeout: 8000 }).not.toBe("running");
  return read();
}

test("installs a tiny pnpm dependency offline before Codex opens its work turn and records setup progress", async () => {
  const { root, project } = await fixture(
    createFakeAgentLauncher([
      { type: "expect-file", path: "node_modules/tiny/index.js", includes: "tiny fixture" },
      { type: "message", text: "Dependencies available" },
    ]),
    {
      "package.json": JSON.stringify({
        name: "fixture",
        version: "1.0.0",
        dependencies: { tiny: "file:./tiny" },
      }),
      "tiny/package.json": JSON.stringify({ name: "tiny", version: "1.0.0", main: "index.js" }),
      "tiny/index.js": "module.exports = 'tiny fixture';\n",
      ".npmrc": "store-dir=.pnpm-store\n",
      ".gitignore": "node_modules/\n.pnpm-store/\n.stintwork/local/\n",
    },
  );
  const response = await start(project);
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  const complete = await ended(root, stint.id);
  expect(complete.status).toBe("finished");
  const messages = complete.events.flatMap((event) =>
    event.type === "message" ? [event.text] : [],
  );
  expect(messages).toContain("Installing worktree dependencies with pnpm (offline).\n");
  expect(messages).toContain("Worktree dependencies are ready.\n");
  expect(messages.indexOf("Worktree dependencies are ready.\n")).toBeLessThan(
    messages.indexOf("Dependencies available"),
  );
  expect(await readFile(join(stint.worktree.path, "node_modules/tiny/index.js"), "utf8")).toContain(
    "tiny fixture",
  );
  const next = await start(project);
  expect(next.status).toBe(201);
  const subsequent = await ended(root, (await next.json()).stint.id);
  expect(
    subsequent.events.some(
      (event) =>
        event.type === "message" && event.text.includes("Installing worktree dependencies"),
    ),
  ).toBe(false);
}, 20_000);

test("ACP receives both git roots and the fake Codex commits its edits before the checkpoint", async () => {
  const { root, project } = await fixture(
    createFakeAgentLauncher(
      [
        { type: "write", path: "own-work.txt", content: "Codex work" },
        { type: "commit", message: "Codex ticket 07" },
      ],
      [],
      { verifyGitDirectories: true },
    ),
  );
  const response = await start(project);
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  const complete = await ended(root, stint.id);
  expect(complete.status).toBe("finished");
  expect(git(stint.worktree.path, "log", "-1", "--format=%s")).toBe("Codex ticket 07");
  expect(git(stint.worktree.path, "show", `${complete.checkpointCommit}:own-work.txt`)).toBe(
    "Codex work",
  );
  expect(git(stint.worktree.path, "rev-list", "--count", `${stint.baseCommit}..HEAD`)).toBe("1");
});

test.each(["authentication", "missing adapter", "missing Codex"])(
  "refuses a start with a codex login hint for %s and releases the work item",
  async (failure) => {
    let refused = true;
    const failing =
      failure === "authentication"
        ? createFakeAgentLauncher(
            [{ type: "write", path: "must-not-exist", content: "No work" }],
            [],
            { authRequired: true },
          )
        : failure === "missing Codex"
          ? createFakeAgentLauncher([], [], { startupError: "spawn codex ENOENT" })
          : createAgentLauncher((cwd) =>
              spawn(join(cwd, "missing-codex-acp"), [], { cwd, stdio: "pipe" }),
            );
    const working = createFakeAgentLauncher([]);
    const { root, project } = await fixture((options) => (refused ? failing : working)(options));
    const response = await start(project);
    expect(response.status).toBe(503);
    expect((await response.json()).reason).toContain("codex login");
    const logs = await readdir(join(root, ".stintwork/local/stints"));
    const stint = await ended(root, logs[0].replace(".jsonl", ""));
    expect(stint.status).toBe("failed");
    expect(stint.error).toContain("codex login");
    await expect(readFile(join(stint.worktree.path, "must-not-exist"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    refused = false;
    const accepted = await start(project);
    expect(accepted.status).toBe(201);
    expect((await ended(root, (await accepted.json()).stint.id)).status).toBe("finished");
  },
);

test("first repo writes happen exactly once, same-work-item starts conflict, and different work items overlap", async () => {
  const { root, project } = await fixture(createFakeAgentLauncher([{ type: "hang" }]));
  const responses = await Promise.all([start(project), start(project), start(project, "second")]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 201, 409]);
  const conflict = responses.find((response) => response.status === 409);
  expect(await conflict?.json()).toEqual({
    reason: "A stint is already active for this work item.",
  });
  const accepted: Stint[] = [];
  for (const response of responses.filter((response) => response.status === 201))
    accepted.push((await response.json()).stint);
  const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  expect(snapshot.workItems.every((workItem) => workItem.activeStint !== null)).toBe(true);
  const first = accepted.find((stint) => stint.workItem === "first") as Stint;
  const workflow = await readFile(
    join(first.worktree.path, ".scratch/first/workflow.yaml"),
    "utf8",
  );
  const firstWritePaths = [
    join(first.worktree.path, ".scratch/first/workflow.yaml"),
    join(first.worktree.path, ".gitignore"),
    join(root, ".gitignore"),
  ];
  const firstWriteTimes = await Promise.all(
    firstWritePaths.map(async (path) => (await stat(path)).mtimeMs),
  );
  expect(workflow).toBe(
    "workflow: feature\nstage: implement\nstages:\n  implement:\n    agent: codex\n",
  );
  await expect(readFile(join(root, ".scratch/first/workflow.yaml"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  const entries: StintLogEntry[] = (
    await readFile(join(root, `.stintwork/local/stints/${first.id}.jsonl`), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(
    entries.some(
      (entry) =>
        entry.type === "event" &&
        entry.event.type === "message" &&
        entry.event.text.includes(".gitignore"),
    ),
  ).toBe(true);
  await project.app.request(`/api/stints/${first.id}/stop`, { method: "POST" });
  await ended(root, first.id);
  const next = await start(project);
  expect(next.status).toBe(201);
  expect(
    await Promise.all(firstWritePaths.map(async (path) => (await stat(path)).mtimeMs)),
  ).toEqual(firstWriteTimes);
  expect(await readFile(join(first.worktree.path, ".scratch/first/workflow.yaml"), "utf8")).toBe(
    workflow,
  );
  for (const directory of [root, ...accepted.map((stint) => stint.worktree.path)]) {
    expect(
      (await readFile(join(directory, ".gitignore"), "utf8"))
        .split("\n")
        .filter((line) => line === ".stintwork/local/"),
    ).toHaveLength(1);
  }
});

test("preserves a declared workflow and an existing rooted ignore entry", async () => {
  const workflow =
    "workflow: quick\nstage: do\nstages:\n  do:\n    agent: codex\n    developerNote: keep\n";
  const { root, project } = await fixture(createFakeAgentLauncher([]), {
    ".scratch/first/workflow.yaml": workflow,
    ".gitignore": "# Keep\n/.stintwork/local/\n",
  });
  const response = await start(project);
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  const complete = await ended(root, stint.id);
  expect(complete.checkpointCommit).toBe(stint.baseCommit);
  expect(await readFile(join(stint.worktree.path, ".scratch/first/workflow.yaml"), "utf8")).toBe(
    workflow,
  );
  expect(await readFile(join(root, ".gitignore"), "utf8")).toBe("# Keep\n/.stintwork/local/\n");
});

test("records Codex for a declared stage without losing comments or other stage records", async () => {
  const { root, project } = await fixture(createFakeAgentLauncher([]), {
    ".scratch/first/workflow.yaml":
      "# Keep this decision\nworkflow: bug\nstage: fix\nstages:\n  diagnose:\n    approved: true\n  fix:\n    note: keep\n",
  });
  const response = await start(project);
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  await ended(root, stint.id);
  const workflow = await readFile(
    join(stint.worktree.path, ".scratch/first/workflow.yaml"),
    "utf8",
  );
  expect(workflow).toContain("# Keep this decision");
  expect(workflow).toContain("workflow: bug\nstage: fix");
  expect(workflow).toContain("approved: true");
  expect(workflow).toContain("note: keep\n    agent: codex");
  const subsequent = await start(project);
  expect(subsequent.status).toBe(201);
  await ended(root, (await subsequent.json()).stint.id);
  expect(await readFile(join(stint.worktree.path, ".scratch/first/workflow.yaml"), "utf8")).toBe(
    workflow,
  );
});

test("refuses a symlinked workflow instead of writing outside the worktree", async () => {
  const { root, project } = await fixture(createFakeAgentLauncher([]));
  const outside = join(root, "outside.yaml");
  await writeFile(outside, "Keep me");
  const { ensureWorktree } = await import("@stintwork/git");
  const worktree = await ensureWorktree(root, "first");
  await symlink(outside, join(worktree.path, ".scratch/first/workflow.yaml"));
  const response = await start(project);
  expect(response.status).toBe(503);
  expect((await response.json()).reason).toContain("regular file");
  expect(await readFile(outside, "utf8")).toBe("Keep me");
});

test("Stop during dependency setup refuses the pending start and never launches the work turn", async () => {
  const { root, project } = await fixture(
    createFakeAgentLauncher([{ type: "write", path: "must-not-exist", content: "No work" }]),
    { "pnpm-lock.yaml": "" },
  );
  const bin = join(root, "fake-bin");
  await mkdir(bin);
  await writeFile(
    join(bin, "pnpm"),
    `#!/bin/sh\nprintf 'installer waiting\\n'\nexec '${process.execPath}' -e 'setInterval(() => {}, 1000)'\n`,
    { mode: 0o755 },
  );
  vi.stubEnv("PATH", `${bin}${delimiter}${process.env.PATH}`);
  const starting = start(project);
  const directory = join(root, ".stintwork/local/stints");
  let id = "";
  await expect
    .poll(async () => {
      const paths = await readdir(directory).catch(() => []);
      if (!paths[0]) return false;
      id = paths[0].replace(".jsonl", "");
      return (await readFile(join(directory, paths[0]), "utf8")).includes("installer waiting");
    })
    .toBe(true);
  expect((await project.app.request(`/api/stints/${id}/stop`, { method: "POST" })).status).toBe(
    202,
  );
  const response = await starting;
  expect(response.status).toBe(503);
  expect((await response.json()).reason).toBe("Stint stopped during worktree setup.");
  const stint = await ended(root, id);
  expect(stint).toMatchObject({
    status: "stopped",
    handoff: null,
    checkpointCommit: expect.any(String),
  });
  await expect(readFile(join(stint.worktree.path, "must-not-exist"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
