// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { fakeGh } from "../test/fake-gh.js";
import { githubTrackerRepository } from "./github-discovery.js";

const directories: string[] = [];
const originalPath = process.env.PATH;
afterEach(async () => {
  process.env.PATH = originalPath;
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function project(remote: string) {
  const root = await mkdtemp(join(tmpdir(), "tracker-origin-"));
  directories.push(root);
  execFileSync("git", ["init", "--quiet", root]);
  execFileSync("git", ["remote", "add", "origin", remote], { cwd: root });
  const gh = await fakeGh(join(root, "bin"));
  process.env.PATH = gh.path;
  return { root, gh };
}

test("resolves the explicit GitHub origin and validates its identity with read-only gh", async () => {
  const { root, gh } = await project("git@github.com:Example/Project.git");
  await gh.script({
    "auth status": { stdout: "" },
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_test",
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
  });
  await expect(githubTrackerRepository(root)).resolves.toEqual({
    repository: "Example/Project",
    repositoryId: "R_test",
    url: "https://github.com/Example/Project",
  });
  expect((await gh.calls()).map(({ args }) => args)).toEqual([
    ["auth", "status", "--active", "--hostname", "github.com"],
    ["api", "repos/Example/Project"],
  ]);
});

test.each([
  "https://example.com/o/r.git",
  "https://user:secret@github.com/o/r.git",
  "git@github.com:o/../r.git",
])("rejects an unsafe origin before invoking gh", async (remote) => {
  const { root, gh } = await project(remote);
  await expect(githubTrackerRepository(root)).rejects.toThrow();
  expect(await gh.calls()).toEqual([]);
});

test("does not silently accept a renamed repository", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  await gh.script({
    "auth status": {},
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_test",
        full_name: "Other/Project",
        html_url: "https://github.com/Other/Project",
      },
    },
  });
  await expect(githubTrackerRepository(root)).rejects.toThrow();
});

test("discovers same-repository parents and labelled standalone issues with page cost", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  const { readFile } = await import("node:fs/promises");
  const fixture = JSON.parse(
    await readFile(
      new URL("../test/fixtures/github-discovery/issues.json", import.meta.url),
      "utf8",
    ),
  );
  await gh.script({
    "auth status": {},
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_test",
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
    "api graphql": { stdout: fixture },
  });
  const { discoverGithubWorkItems } = await import("./github-discovery.js");
  const result = await discoverGithubWorkItems(root);
  expect(result.items.map(({ number }) => number)).toEqual([1, 2]);
  expect(result).toMatchObject({
    scanned: 4,
    complete: true,
    pages: [{ cost: 3, remaining: 4997 }],
  });
  expect(result.warnings.join(" ")).toContain("labelled child");
});

test("paginates cross-repository children until same-repository membership is known", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  const { readFile } = await import("node:fs/promises");
  const fixture = JSON.parse(
    await readFile(
      new URL("../test/fixtures/github-discovery/issues.json", import.meta.url),
      "utf8",
    ),
  );
  const parent = fixture.data.repository.issues.nodes[0];
  fixture.data.repository.issues.nodes = [parent];
  parent.subIssues = {
    totalCount: 2,
    nodes: [{ repository: { id: "R_other" }, subIssues: { totalCount: 0 } }],
    pageInfo: { hasNextPage: true, endCursor: "child-cursor" },
  };
  await gh.script({
    "auth status": {},
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_test",
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
    "api graphql": [
      { stdout: fixture },
      {
        stdout: {
          data: {
            node: {
              id: "I_1",
              subIssues: {
                nodes: [{ repository: { id: "R_test" }, subIssues: { totalCount: 0 } }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
            rateLimit: { cost: 2, remaining: 4995, resetAt: "2026-10-28T00:00:00Z" },
          },
        },
      },
    ],
  });
  const { discoverGithubWorkItems } = await import("./github-discovery.js");
  const result = await discoverGithubWorkItems(root);
  expect(result.items).toMatchObject([{ number: 1, complete: false }]);
  expect(result.complete).toBe(false);
  expect(result.pages.map(({ cost }) => cost)).toEqual([3, 2]);
  expect(result.warnings.join(" ")).toContain("cross-repository");
});

test("failed relationship pages are incomplete rather than a negative membership decision", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  const { readFile } = await import("node:fs/promises");
  const fixture = JSON.parse(
    await readFile(
      new URL("../test/fixtures/github-discovery/issues.json", import.meta.url),
      "utf8",
    ),
  );
  fixture.data.repository.issues.nodes = [fixture.data.repository.issues.nodes[0]];
  fixture.data.repository.issues.nodes[0].labels.pageInfo = {
    hasNextPage: true,
    endCursor: "labels-next",
  };
  await gh.script({
    "auth status": {},
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_test",
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
    "api graphql": [{ stdout: fixture }, { code: 1 }],
  });
  const { discoverGithubWorkItems } = await import("./github-discovery.js");
  const result = await discoverGithubWorkItems(root);
  expect(result).toMatchObject({ complete: false, scanned: 1, error: expect.any(String) });
});

test("project snapshot exposes discovered work items through the configured GitHub tracker", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  const { readFile, mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(join(root, "web"));
  await writeFile(join(root, "web/index.html"), "<!doctype html>");
  await mkdir(join(root, "docs/agents"), { recursive: true });
  await writeFile(join(root, "docs/agents/issue-tracker.md"), "# Issue tracker: GitHub\n");
  const fixture = JSON.parse(
    await readFile(
      new URL("../test/fixtures/github-discovery/issues.json", import.meta.url),
      "utf8",
    ),
  );
  await gh.script({
    "auth status": {},
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_test",
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
    "api graphql": { stdout: fixture },
  });
  const { createProjectServer } = await import("./index.js");
  const server = createProjectServer(root, join(root, "web"));
  try {
    const snapshot = await (await server.app.request("/api/project")).json();
    const setup = await (await server.app.request("/api/setup")).json();
    expect(setup.github).toMatchObject({ repository: "Example/Project", repositoryId: "R_test" });
    expect(setup.checks[0]).toMatchObject({ ready: true, status: "ready" });
    expect(
      setup.changes.some(({ path }: { path: string }) => path === "docs/agents/issue-tracker.md"),
    ).toBe(false);
    expect(snapshot.setup.tracker).toBe("github-issues");
    expect(snapshot.github).toMatchObject({
      repositoryId: "R_test",
      complete: true,
      items: [{ number: 1 }, { number: 2 }],
    });
    expect(snapshot.workItems.map(({ slug }: { slug: string }) => slug)).toEqual([
      "github-1",
      "github-2",
    ]);
  } finally {
    await server.stop();
  }
});

test("bounds one batch at five issue pages and returns a load-more cursor", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  const { readFile } = await import("node:fs/promises");
  const original = JSON.parse(
    await readFile(
      new URL("../test/fixtures/github-discovery/issues.json", import.meta.url),
      "utf8",
    ),
  );
  const issue = original.data.repository.issues.nodes[3];
  const responses = Array.from({ length: 5 }, (_, page) => {
    const value = structuredClone(original);
    value.data.repository.issues.nodes = Array.from({ length: 100 }, (_, index) => {
      const number = page * 100 + index + 1;
      return {
        ...issue,
        id: `I_${number}`,
        number,
        url: `https://github.com/Example/Project/issues/${number}`,
      };
    });
    value.data.repository.issues.pageInfo = { hasNextPage: true, endCursor: `cursor-${page + 1}` };
    return { stdout: value };
  });
  await gh.script({
    "auth status": {},
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_test",
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
    "api graphql": responses,
  });
  const { discoverGithubWorkItems } = await import("./github-discovery.js");
  const result = await discoverGithubWorkItems(root);
  expect(result).toMatchObject({ scanned: 500, complete: false, cursor: "cursor-5" });
  expect(result.pages).toHaveLength(5);
  expect(
    (await gh.calls()).filter(({ args }) => args[0] === "api" && args[1] === "graphql"),
  ).toHaveLength(5);
});

test("reports the reset time and stops when the GraphQL rate budget is exhausted", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  const { readFile } = await import("node:fs/promises");
  const fixture = JSON.parse(
    await readFile(
      new URL("../test/fixtures/github-discovery/issues.json", import.meta.url),
      "utf8",
    ),
  );
  fixture.data.rateLimit.remaining = 0;
  await gh.script({
    "auth status": {},
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_test",
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
    "api graphql": { stdout: fixture },
  });
  const { discoverGithubWorkItems } = await import("./github-discovery.js");
  const result = await discoverGithubWorkItems(root);
  expect(result.complete).toBe(false);
  expect(result.error).toContain("2026-10-28T00:00:00Z");
  expect(result.pages).toHaveLength(1);
});
