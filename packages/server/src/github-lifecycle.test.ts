// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fakeGh } from "../test/fake-gh.js";
import { createProjectServer } from "./index.js";

const connection = (nodes: unknown[]) => ({
  nodes,
  pageInfo: { hasNextPage: false, endCursor: null },
});
const issue = {
  id: "I_1",
  number: 1,
  title: "Private",
  url: "https://github.com/example/project/issues/1",
  parent: null,
  labels: connection([{ name: "stintwork:work-item" }]),
  subIssues: { ...connection([]), totalCount: 0 },
};
const page = {
  data: {
    repository: { id: "R_1", nameWithOwner: "example/project", issues: connection([issue]) },
    rateLimit: { cost: 1, remaining: 4999, resetAt: "2099-01-01T00:00:00Z" },
  },
};

test("tracker changes start and clear discovery without restarting", async () => {
  const root = await mkdtemp(join(tmpdir(), "github-lifecycle-"));
  const oldPath = process.env.PATH;
  let server: ReturnType<typeof createProjectServer> | undefined;
  try {
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", [
      "-C",
      root,
      "remote",
      "add",
      "origin",
      "https://github.com/example/project.git",
    ]);
    await mkdir(join(root, "docs/agents"), { recursive: true });
    await mkdir(join(root, "web"));
    await writeFile(join(root, "web/index.html"), "<!doctype html>");
    const tracker = join(root, "docs/agents/issue-tracker.md");
    await writeFile(tracker, "# Issue tracker: Local Markdown\n");
    const gh = await fakeGh(join(root, "bin"));
    process.env.PATH = gh.path;
    await gh.script({
      "auth status": {},
      "api user": { stdout: "101" },
      "api repos/example/project": {
        stdout: {
          node_id: "R_1",
          full_name: "example/project",
          html_url: "https://github.com/example/project",
        },
      },
      "api graphql": { stdout: page },
    });
    server = createProjectServer(root, join(root, "web"));
    await server.start();
    const snapshot = async () => (await server!.app.request("/api/project")).json();
    expect((await snapshot()).github).toBeUndefined();
    await writeFile(tracker, "# Issue tracker: GitHub\n");
    await expect
      .poll(async () => (await snapshot()).github?.items?.length, { timeout: 10000 })
      .toBe(1);
    await writeFile(tracker, "# Issue tracker: Local Markdown\n");
    await expect.poll(async () => (await snapshot()).github, { timeout: 10000 }).toBeUndefined();
  } finally {
    await server?.stop();
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

test.each([false, true])(
  "failed refresh after viewer change=%s protects cached data",
  async (changed) => {
    const root = await mkdtemp(join(tmpdir(), "github-lifecycle-"));
    const oldPath = process.env.PATH;
    let server: ReturnType<typeof createProjectServer> | undefined;
    try {
      execFileSync("git", ["init", "-q", root]);
      execFileSync("git", [
        "-C",
        root,
        "remote",
        "add",
        "origin",
        "https://github.com/example/project.git",
      ]);
      await mkdir(join(root, "docs/agents"), { recursive: true });
      await mkdir(join(root, "web"));
      await writeFile(join(root, "web/index.html"), "<!doctype html>");
      await writeFile(join(root, "docs/agents/issue-tracker.md"), "# Issue tracker: GitHub\n");
      const gh = await fakeGh(join(root, "bin"));
      process.env.PATH = gh.path;
      const repo = {
        stdout: {
          node_id: "R_1",
          full_name: "example/project",
          html_url: "https://github.com/example/project",
        },
      };
      await gh.script({
        "auth status": {},
        "api user": { stdout: "101" },
        "api repos/example/project": repo,
        "api graphql": { stdout: page },
        "api repos/example/project/issues/1": {
          stdout: {
            node_id: "I_1",
            number: 1,
            title: "Private",
            body: "Secret",
            html_url: issue.url,
            repository_url: "https://api.github.com/repos/example/project",
            state: "open",
            state_reason: null,
            labels: [],
            comments: 0,
            sub_issues_summary: { total: 0 },
          },
        },
        "api repos/example/project/issues/1/sub_issues?per_page=100&page=1": { stdout: [] },
        "api repos/example/project/issues/1/comments?per_page=100&page=1": { stdout: [] },
      });
      server = createProjectServer(root, join(root, "web"));
      const first = await (
        await server.app.request("/api/github/items/1/refresh", { method: "POST" })
      ).json();
      expect(first.github.items[0].detail.spec).toBe("Secret");
      await gh.script({
        "auth status": {},
        "api user": { stdout: changed ? "202" : "101" },
        "api repos/example/project": { effect: "process.stderr.write('HTTP 500')", code: 1 },
      });
      const failed = await (
        await server.app.request("/api/github/discovery/refresh", { method: "POST" })
      ).json();
      expect(failed.github.errorCode).toBe("server-error");
      expect(failed.github.discoveryFailed).toBe(true);
      if (changed) {
        expect(failed.github.items).toEqual([]);
        expect(failed.github.fetchedAt).toBeUndefined();
      } else {
        expect(failed.github.stale).toBe(true);
        expect(failed.github.fetchedAt).toBe(first.github.fetchedAt);
        expect(failed.github.items[0].detail.spec).toBe("Secret");
      }
    } finally {
      await server?.stop();
      process.env.PATH = oldPath;
      await rm(root, { recursive: true, force: true });
    }
  },
);
