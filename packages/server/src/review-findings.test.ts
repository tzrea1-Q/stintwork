import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { findingsFormat, findingsRequest, handoffRequest } from "@stintwork/agents";
import { createFakeAgentLauncher, type FakeAgentStep } from "@stintwork/agents/testing";
import type { ProjectSnapshot, Stint } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { createProjectServer } from "./index.js";

const fixtures: { parent: string; project: ReturnType<typeof createProjectServer> }[] = [];
const handoff =
  "## Where I stopped\nReviewed the change.\n## Unresolved\nNone\n## Suggested next\nTriage findings.";
const finding = `## Finding
Axis: Spec
Severity: major
Path: src/example.ts
Line: 1
Title: Missing limit
### Body
The spec requires a bounded input.`;

function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function fixture(reply: string, findingsSteps?: FakeAgentStep[]) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-review-findings-"));
  const root = join(parent, "project");
  git(parent, "init", "--quiet", "--initial-branch=main", root);
  git(root, "config", "user.name", "Developer");
  git(root, "config", "user.email", "developer@example.invalid");
  for (const [path, text] of Object.entries({
    "AGENTS.md": "Conventions",
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    ".scratch/example/spec.md": "# Example\nLimit input.",
    ".scratch/example/issues/01-limit.md": "# Limit\nStatus: resolved\nBlocked by: none",
    ".scratch/example/workflow.yaml": "workflow: feature\nstage: review\n",
    "src/example.ts": "export const limit = 1;\n",
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Fixture");
  const main = git(root, "rev-parse", "HEAD");
  const project = createProjectServer(root, join(root, "web"), {
    handoffTimeoutMs: 3000,
    launchAgent: createFakeAgentLauncher(
      [
        { type: "expect-prompt", includes: "/code-review .scratch/example/" },
        { type: "expect-prompt", includes: ".scratch/example/spec.md" },
        { type: "expect-prompt", includes: ".scratch/example/issues/01-limit.md" },
        { type: "expect-prompt", includes: `Review diff range: ${main}...` },
        { type: "expect-prompt", includes: findingsFormat },
        { type: "message", text: "Review complete." },
      ],
      [],
      {
        afterTurnRequests: [
          [
            { type: "expect-prompt", includes: handoffRequest.prompt },
            { type: "write", path: "review-note.txt", content: "Review checkpoint" },
            { type: "message", text: handoff },
          ],
          [
            { type: "expect-prompt", includes: findingsRequest.prompt },
            ...(findingsSteps ?? [{ type: "message" as const, text: reply }]),
          ],
        ],
      },
    ),
  });
  fixtures.push({ parent, project });
  return { root, project, main };
}

afterEach(async () => {
  for (const { parent, project } of fixtures.splice(0)) {
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});

async function review(project: ReturnType<typeof createProjectServer>) {
  const response = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "example" }),
  });
  expect(response.status).toBe(201);
  const { stint: started } = await response.json();
  let stint: Stint | undefined;
  await expect
    .poll(async () => {
      const response = await project.app.request(`/api/stints/${started.id}`);
      ({ stint } = await response.json());
      return stint?.status;
    })
    .not.toBe("running");
  return stint as Stint;
}

test.each([
  finding,
  `Preamble: I checked both axes.\n\n${finding}`,
  "No findings",
  "Unformatted reply",
])(
  "Review records parsed findings or a raw parse failure at the reviewed commit: %s",
  async (reply) => {
    const { root, project, main } = await fixture(reply);
    const preview = await project.app.request("/api/work-items/example/brief-preview");
    expect((await preview.json()).agent).toBe("codex");
    const stint = await review(project);
    expect(stint.status).toBe("finished");
    expect(stint.agent).toBe("codex");
    expect(stint.handoff?.stoppedAt).toBe("Reviewed the change.");
    expect(stint.brief.prompt).toContain(`Review diff range: ${main}...${stint.baseCommit}`);
    expect(stint.baseCommit).not.toBe(main);
    expect(stint.findings?.commit).toBe(stint.baseCommit);
    expect(stint.findings?.commit).not.toBe(stint.checkpointCommit);
    expect(stint.findings?.rawReply).toBe(reply);
    if (reply === "No findings") expect(stint.findings?.findings).toEqual([]);
    else if (reply === "Unformatted reply") {
      expect(stint.findings?.findings).toBeNull();
      expect(stint.findings?.error).toBe(findingsRequest.parseError);
    } else
      expect(stint.findings?.findings).toEqual([
        {
          id: `${stint.id}:1`,
          axis: "Spec",
          severity: "major",
          path: "src/example.ts",
          line: 1,
          title: "Missing limit",
          body: "The spec requires a bounded input.",
        },
      ]);
    const log = (await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(log.at(-1).findings).toEqual(stint.findings);
    const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
    expect(snapshot.workItems[0].stints[0].findings).toEqual(stint.findings);
    expect(snapshot.warnings).toEqual([]);
  },
);

test("another Review stint after changes keeps both commits and distinct finding ids", async () => {
  const { project } = await fixture(finding);
  const first = await review(project);
  await writeFile(join(first.worktree.path, "src/example.ts"), "export const limit = 2;\n");
  git(first.worktree.path, "add", "src/example.ts");
  git(first.worktree.path, "commit", "--quiet", "-m", "Adjust limit");
  const head = git(first.worktree.path, "rev-parse", "HEAD");
  const second = await review(project);
  expect(second.findings?.commit).toBe(head);
  expect(second.findings?.commit).not.toBe(first.findings?.commit);
  expect(second.findings?.findings?.[0].id).not.toBe(first.findings?.findings?.[0].id);
  const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  expect(snapshot.workItems[0].stints.map((stint) => stint.findings?.commit)).toEqual([
    head,
    first.baseCommit,
  ]);
});

test("a failed findings request preserves its reason without losing the handoff", async () => {
  const { project } = await fixture("", [{ type: "error", message: "Findings unavailable" }]);
  const stint = await review(project);
  expect(stint.status).toBe("finished");
  expect(stint.handoff).not.toBeNull();
  expect(stint.findings?.findings).toBeNull();
  expect(stint.findings?.error).toContain("Findings unavailable");
});
