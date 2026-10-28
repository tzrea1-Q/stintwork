// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { WebSocket } from "ws";
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

test("viewer polling is client-scoped, preserves data on failure, and stops with the server", async () => {
  const root = await mkdtemp(join(tmpdir(), "github-viewer-"));
  const oldPath = process.env.PATH;
  let server: ReturnType<typeof createProjectServer> | undefined;
  let socket: WebSocket | undefined;
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
    const replies = {
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
    };
    await gh.script(replies);
    server = createProjectServer(root, join(root, "web"), { githubViewerIntervalMs: 200 });
    const http = await server.start();
    const count = async () =>
      (await gh.calls()).filter(({ args }) => args[0] === "api" && args[1] === "user").length;
    const before = await count();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await count()).toBe(before);
    http.listen(0, "127.0.0.1");
    await once(http, "listening");
    const address = http.address();
    if (!address || typeof address === "string") throw new Error("Missing server address");
    await gh.script({
      ...replies,
      "api user": { code: 1, effect: "process.stderr.write('offline')" },
    });
    socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/live`);
    const messages: { github?: { items: unknown[] } }[] = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
    await once(socket, "open");
    await expect.poll(count, { timeout: 5000 }).toBeGreaterThan(before);
    expect((await (await server.app.request("/api/project")).json()).github.items).toHaveLength(1);
    await gh.script({
      ...replies,
      "api user": { stdout: "202" },
      "api repos/example/project": { code: 1, effect: "process.stderr.write('HTTP 500')" },
    });
    await expect
      .poll(() => messages.some((message) => message.github?.items.length === 0), { timeout: 5000 })
      .toBe(true);
    await server.stop();
    const stopped = await count();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await count()).toBe(stopped);
  } finally {
    socket?.terminate();
    await server?.stop();
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});
