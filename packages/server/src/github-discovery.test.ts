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
    ["api", "repos/Example/Project", "--include"],
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
    pages: [{ cost: 102, remaining: 4898 }],
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
            rateLimit: { cost: 1, remaining: 4897, resetAt: "2026-10-28T00:00:00Z" },
          },
        },
      },
    ],
  });
  const { discoverGithubWorkItems } = await import("./github-discovery.js");
  const result = await discoverGithubWorkItems(root);
  expect(result.items).toMatchObject([{ number: 1, complete: false }]);
  expect(result.complete).toBe(false);
  expect(result.pages.map(({ cost }) => cost)).toEqual([102, 1]);
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
    "api user": { stdout: "101" },
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

test("a failed refresh keeps stale data only for the same authenticated account", async () => {
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
  const repo = {
    node_id: "R_test",
    full_name: "Example/Project",
    html_url: "https://github.com/Example/Project",
  };
  await gh.script({
    "auth status": {},
    "api user": { stdout: "101" },
    "api repos/Example/Project": { stdout: repo },
    "api graphql": { stdout: fixture },
  });
  const { createProjectServer } = await import("./index.js");
  const server = createProjectServer(root, join(root, "web"));
  try {
    expect((await (await server.app.request("/api/project")).json()).workItems).toHaveLength(2);
    await gh.script({
      "auth status": {},
      "api user": { stdout: "101" },
      "api repos/Example/Project": {
        code: 1,
        effect: "process.stderr.write('gh: Not Found (HTTP 404)')",
      },
    });
    const stale = await (
      await server.app.request("/api/github/discovery/refresh", { method: "POST" })
    ).json();
    expect(stale.github).toMatchObject({
      stale: true,
      complete: false,
      fetchedAt: expect.any(String),
      error: expect.any(String),
    });
    expect(stale.workItems).toHaveLength(2);
    await gh.script({
      "auth status": {},
      "api user": { stdout: "202" },
      "api repos/Example/Project": { code: 1 },
    });
    const switched = await (
      await server.app.request("/api/github/discovery/refresh", { method: "POST" })
    ).json();
    expect(switched.workItems).toHaveLength(0);
    expect(switched.github.stale).not.toBe(true);
  } finally {
    await server.stop();
  }
});

test.each([
  ["gh: Not Found (HTTP 404)", "unavailable"],
  ["gh: API rate limit exceeded (HTTP 403)", "rate-limited"],
  ["gh: You have exceeded a secondary rate limit (HTTP 403)", "rate-limited"],
  ["error connecting to api.github.com: network is unreachable", "offline"],
  ["gh: Internal Server Error (HTTP 500)", "server-error"],
])("classifies safe repository errors without exposing raw stderr: %s", async (stderr, code) => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  await gh.script({
    "auth status": {},
    "api repos/Example/Project": {
      code: 1,
      effect: `process.stderr.write(${JSON.stringify(stderr)})`,
    },
  });
  await expect(githubTrackerRepository(root)).rejects.toMatchObject({ code });
});

test("workflow identity binds only the same repository and parent after a restart", async () => {
  const { createMemoryRepoFiles } = await import("@stintwork/core");
  const { validateGithubIdentities } = await import("./github-discovery.js");
  const github = {
    repository: "Example/Project",
    repositoryId: "R_test",
    scanned: 1,
    cursor: null,
    complete: true,
    pages: [],
    warnings: [],
    items: [
      {
        id: "I_1",
        number: 1,
        title: "Parent",
        url: "https://github.com/Example/Project/issues/1",
        complete: true,
      },
    ],
  };
  const identity = `workflow: feature\nstage: spec\ngithub:\n  host: github.com\n  repository: Example/Project\n  repositoryId: R_test\n  issueId: I_1\n  number: 1\n`;
  const files = createMemoryRepoFiles({
    ".stintwork/github/example/project/1/workflow.yaml": identity,
  });
  expect(validateGithubIdentities(files, github).items[0]).toMatchObject({ bound: true });
  expect(() =>
    validateGithubIdentities(files, {
      ...github,
      items: [{ ...github.items[0], id: "I_changed" }],
    }),
  ).toThrow();
  expect(() => validateGithubIdentities(files, { ...github, repositoryId: "R_changed" })).toThrow();
  expect(() =>
    validateGithubIdentities(files, { ...github, repository: "Other/Project" }),
  ).toThrow();
  expect(() => validateGithubIdentities(files, { ...github, items: [] })).toThrow();
});

test("finds a work-item label on a later independently paginated labels page", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  const { readFile } = await import("node:fs/promises");
  const fixture = JSON.parse(
    await readFile(
      new URL("../test/fixtures/github-discovery/issues.json", import.meta.url),
      "utf8",
    ),
  );
  const issue = fixture.data.repository.issues.nodes[3];
  issue.labels.pageInfo = { hasNextPage: true, endCursor: "labels-1" };
  fixture.data.repository.issues.nodes = [issue];
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
              id: "I_4",
              labels: {
                nodes: [{ name: "stintwork:work-item" }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
            rateLimit: { cost: 1, remaining: 4897, resetAt: "2026-10-28T00:00:00Z" },
          },
        },
      },
    ],
  });
  const { discoverGithubWorkItems } = await import("./github-discovery.js");
  const result = await discoverGithubWorkItems(root);
  expect(result.items.map(({ number }) => number)).toEqual([4]);
  expect(result.pages.map(({ cost }) => cost)).toEqual([102, 1]);
});

test("preserves the retry time from a secondary limit response", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  await gh.script({
    "auth status": {},
    "api repos/Example/Project": {
      code: 1,
      effect: "process.stderr.write('secondary rate limit (HTTP 403)\\nRetry-After: 120\\n')",
    },
  });
  try {
    await githubTrackerRepository(root);
    throw new Error("expected failure");
  } catch (error) {
    expect(error).toMatchObject({ code: "rate-limited", retryAt: expect.any(String) });
    expect(Date.parse((error as { retryAt: string }).retryAt) - Date.now()).toBeGreaterThan(
      110_000,
    );
  }
});

test("marks a 1,000-label connection incomplete at the safety cap", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  const { readFile } = await import("node:fs/promises");
  const fixture = JSON.parse(
    await readFile(
      new URL("../test/fixtures/github-discovery/issues.json", import.meta.url),
      "utf8",
    ),
  );
  const issue = fixture.data.repository.issues.nodes[0];
  issue.labels = {
    nodes: Array.from({ length: 100 }, () => ({ name: "other" })),
    pageInfo: { hasNextPage: true, endCursor: "label-0" },
  };
  fixture.data.repository.issues.nodes = [issue];
  const replies = Array.from({ length: 9 }, (_, index) => ({
    stdout: {
      data: {
        node: {
          id: "I_1",
          labels: {
            nodes: Array.from({ length: 100 }, () => ({ name: "other" })),
            pageInfo: { hasNextPage: index < 8, endCursor: `label-${index + 1}` },
          },
        },
        rateLimit: { cost: 1, remaining: 4990, resetAt: "2026-10-28T00:00:00Z" },
      },
    },
  }));
  await gh.script({
    "auth status": {},
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_test",
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
    "api graphql": [{ stdout: fixture }, ...replies],
  });
  const { discoverGithubWorkItems } = await import("./github-discovery.js");
  const result = await discoverGithubWorkItems(root);
  expect(result).toMatchObject({ complete: false, errorCode: "cap" });
  expect(result.items).toHaveLength(0);
});

test("does not retry before a secondary limit's Retry-After", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(join(root, "web"));
  await writeFile(join(root, "web/index.html"), "<!doctype html>");
  await mkdir(join(root, "docs/agents"), { recursive: true });
  await writeFile(join(root, "docs/agents/issue-tracker.md"), "# Issue tracker: GitHub\n");
  await gh.script({
    "auth status": {},
    "api user": { stdout: "101" },
    "api repos/Example/Project": {
      code: 1,
      effect: "process.stderr.write('secondary rate limit (HTTP 403)\\nRetry-After: 120\\n')",
    },
  });
  const { createProjectServer } = await import("./index.js");
  const server = createProjectServer(root, join(root, "web"));
  try {
    const initial = await (await server.app.request("/api/project")).json();
    expect(initial.github).toMatchObject({
      errorCode: "rate-limited",
      retryAt: expect.any(String),
    });
    const before = (await gh.calls()).length;
    await server.app.request("/api/github/discovery/refresh", { method: "POST" });
    expect(await gh.calls()).toHaveLength(before);
  } finally {
    await server.stop();
  }
});

test("nested descendants make a discovered parent incomplete", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  const { readFile } = await import("node:fs/promises");
  const fixture = JSON.parse(
    await readFile(
      new URL("../test/fixtures/github-discovery/issues.json", import.meta.url),
      "utf8",
    ),
  );
  fixture.data.repository.issues.nodes = [fixture.data.repository.issues.nodes[0]];
  fixture.data.repository.issues.nodes[0].subIssues.nodes[0].subIssues.totalCount = 1;
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
  expect(result.items).toMatchObject([{ number: 1, complete: false }]);
  expect(result.complete).toBe(false);
  expect(result.warnings.join(" ")).toContain("nested");
});

test("missing gh and a failed active login have distinct safe error codes", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  const { githubViewer } = await import("./github-discovery.js");
  await gh.script({ "auth status": { code: 1 } });
  await expect(githubViewer(root)).rejects.toMatchObject({ code: "login" });
  process.env.PATH = join(root, "empty-path");
  await expect(githubViewer(root)).rejects.toMatchObject({ code: "gh-missing" });
});

test("a GraphQL rate error retains page cost and reset information", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  await gh.script({
    "auth status": {},
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_test",
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
    "api graphql": {
      stdout: {
        errors: [{ type: "RATE_LIMITED", message: "rate limit exceeded" }],
        data: {
          rateLimit: { cost: 102, remaining: 0, resetAt: "2026-10-28T00:00:00Z" },
          repository: null,
        },
      },
    },
  });
  const { discoverGithubWorkItems } = await import("./github-discovery.js");
  const result = await discoverGithubWorkItems(root);
  expect(result).toMatchObject({
    complete: false,
    errorCode: "rate-limited",
    retryAt: "2026-10-28T00:00:00Z",
    pages: [{ cost: 102 }],
  });
});

test("load more keeps earlier incomplete parents incomplete", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  const { mkdir, readFile, writeFile } = await import("node:fs/promises");
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
  fixture.data.repository.issues.nodes = [fixture.data.repository.issues.nodes[0]];
  fixture.data.repository.issues.nodes[0].subIssues.nodes[0].subIssues.totalCount = 1;
  const pages = Array.from({ length: 6 }, (_, i) => {
    const value = structuredClone(fixture);
    if (i > 0) value.data.repository.issues.nodes = [];
    value.data.repository.issues.pageInfo = { hasNextPage: i < 5, endCursor: `cursor-${i}` };
    return { stdout: value };
  });
  await gh.script({
    "auth status": {},
    "api user": { stdout: "101" },
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_test",
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
    "api graphql": pages,
  });
  const { createProjectServer } = await import("./index.js");
  const server = createProjectServer(root, join(root, "web"));
  try {
    const first = await (await server.app.request("/api/project")).json();
    expect(first.github.cursor).toBe("cursor-4");
    const next = await (
      await server.app.request("/api/github/discovery/load-more", { method: "POST" })
    ).json();
    expect(next.github).toMatchObject({
      complete: false,
      cursor: null,
      items: [{ number: 1, complete: false }],
    });
  } finally {
    await server.stop();
  }
});

test("malformed GraphQL output reports an incomplete page without leaking output", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  await gh.script({
    "auth status": {},
    "api repos/Example/Project": {
      stdout: {
        node_id: "R_test",
        full_name: "Example/Project",
        html_url: "https://github.com/Example/Project",
      },
    },
    "api graphql": { stdout: "{invalid-private-data" },
  });
  const { discoverGithubWorkItems } = await import("./github-discovery.js");
  const result = await discoverGithubWorkItems(root);
  expect(result).toMatchObject({ complete: false, errorCode: "incomplete" });
  expect(result.error).not.toContain("private-data");
});

test.each([
  ["github-gh-aw", "github/gh-aw", "R_kgDOPc1QRw", 3],
  ["dotnet-aspire", "microsoft/aspire", "R_kgDOKYQzfQ", 2],
  ["github-spec-kit", "github/spec-kit", "R_kgDOPiFCnQ", 2],
])("reads a sanitized recorded %s issues page through fake gh", async (name, repo, id, count) => {
  const { root, gh } = await project(`https://github.com/${repo}.git`);
  const { readFile } = await import("node:fs/promises");
  const page = JSON.parse(
    await readFile(
      new URL(
        `../test/fixtures/github-discovery/recorded-${name}-issues-page1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const last = structuredClone(page);
  last.data.repository.issues.nodes = [];
  last.data.repository.issues.pageInfo = { hasNextPage: false, endCursor: null };
  await gh.script({
    "auth status": {},
    [`api repos/${repo}`]: {
      stdout: { node_id: id, full_name: repo, html_url: `https://github.com/${repo}` },
    },
    "api graphql": [{ stdout: page }, { stdout: last }],
  });
  const { discoverGithubWorkItems } = await import("./github-discovery.js");
  const result = await discoverGithubWorkItems(root);
  expect(result.scanned).toBe(count);
  expect(result.pages.map(({ cost }) => cost)).toEqual([102, 102]);
  expect(result.complete).toBe(true);
  if (name === "github-gh-aw") expect(result.items.some(({ number }) => number === 90)).toBe(false);
});

test("reads recorded child and label connection pages through fake gh", async () => {
  const { root, gh } = await project("https://github.com/github/gh-aw.git");
  const { readFile } = await import("node:fs/promises");
  const read = async (name: string) =>
    JSON.parse(
      await readFile(
        new URL(`../test/fixtures/github-discovery/recorded-${name}.json`, import.meta.url),
        "utf8",
      ),
    );
  const issuePage = await read("github-gh-aw-issues-page1");
  const childPage = await read("github-gh-aw-72113-subIssues");
  const labelPage = await read("github-gh-aw-72113-labels");
  // The recorded relationship responses have no issue number; the surrounding page is synthetic.
  const issue = issuePage.data.repository.issues.nodes[0];
  Object.assign(issue, {
    id: childPage.data.node.id,
    number: 72113,
    title: "Example parent",
    url: "https://github.com/github/gh-aw/issues/72113",
    parent: null,
  });
  issue.labels = { nodes: [], pageInfo: { hasNextPage: true, endCursor: "labels-first" } };
  issue.subIssues = {
    totalCount: 1,
    nodes: [],
    pageInfo: { hasNextPage: true, endCursor: "children-first" },
  };
  issuePage.data.repository.issues.nodes = [issue];
  issuePage.data.repository.issues.pageInfo = { hasNextPage: false, endCursor: null };
  await gh.script({
    "auth status": {},
    "api repos/github/gh-aw": {
      stdout: {
        node_id: "R_kgDOPc1QRw",
        full_name: "github/gh-aw",
        html_url: "https://github.com/github/gh-aw",
      },
    },
    "api graphql": [{ stdout: issuePage }, { stdout: labelPage }, { stdout: childPage }],
  });
  const { discoverGithubWorkItems } = await import("./github-discovery.js");
  const result = await discoverGithubWorkItems(root);
  expect(result.items).toMatchObject([
    { id: childPage.data.node.id, number: 72113, complete: true },
  ]);
  expect(result.pages.map(({ cost }) => cost)).toEqual([102, 1, 1]);
  expect(result.complete).toBe(true);
});

test("issues connection accepts unrelated epics and does not query pull requests", async () => {
  const { root, gh } = await project("https://github.com/Example/Project.git");
  const { readFile } = await import("node:fs/promises");
  const fixture = JSON.parse(
    await readFile(
      new URL("../test/fixtures/github-discovery/issues.json", import.meta.url),
      "utf8",
    ),
  );
  fixture.data.repository.issues.nodes = [fixture.data.repository.issues.nodes[0]];
  fixture.data.repository.issues.nodes[0].title = "Unrelated epic";
  fixture.data.repository.pullRequests = {
    nodes: [{ id: "PR_test", number: 999, title: "Pull request" }],
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
    "api graphql": { stdout: fixture },
  });
  const { discoverGithubWorkItems } = await import("./github-discovery.js");
  const result = await discoverGithubWorkItems(root);
  expect(result.items).toMatchObject([{ title: "Unrelated epic", number: 1 }]);
  expect(result.items).toHaveLength(1);
  const call = (await gh.calls()).find(({ args }) => args[0] === "api" && args[1] === "graphql");
  const query = call?.args.find((arg) => arg.startsWith("query="));
  expect(query).toMatch(/\bissues\s*\(/);
  expect(query).not.toMatch(/\bpullRequests\s*\(/);
});
