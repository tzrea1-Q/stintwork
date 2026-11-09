// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { WebSocket } from "ws";
import { expect, test, vi } from "vitest";
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

test.each([
  ["merge local", "/api/work-items/github-1/ship/merge-local", {}],
  ["send back from Ship", "/api/work-items/github-1/ship/send-back", {}],
  ["open PR", "/api/work-items/github-1/ship/open-pr", {}],
  ["merge PR", "/api/work-items/github-1/ship/merge-pr", {}],
  ["approve gate", "/api/github/items/1/gates/approve", {}],
  ["reopen gate", "/api/github/items/1/gates/reopen", {}],
  ["accept memory", "/api/work-items/github-1/memory-proposals/decision", { status: "accepted" }],
  ["reject memory", "/api/work-items/github-1/memory-proposals/decision", { status: "rejected" }],
  ["finding decision", "/api/work-items/github-1/findings/decision", {}],
  ["finding send back", "/api/work-items/github-1/findings/send-back", {}],
  ["accept risk", "/api/work-items/github-1/risky-paths/accept", {}],
  ["stage agent", "/api/work-items/github-1/stages/review/agent", {}],
  ["local gate", "/api/work-items/github-1/gates/review/approve", {}],
  ["local gate reopen", "/api/work-items/github-1/gates/review/reopen", {}],
  ["start checks", "/api/work-items/github-1/checks", {}],
  ["cancel checks", "/api/work-items/github-1/checks/cancel", {}],
  ["start stint", "/api/stints", { workItem: "github-1" }],
  ["move roadmap item", "/api/roadmap", { kind: "move", workItem: "github-1" }],
  ["resolve handoff", "/api/stints/s1/resolve-handoff", {}],
  ["answer handoff", "/api/stints/s1/handoff-answer", {}],
  ["confirm agent", "/api/stints/s1/confirm-agent", {}],
])("%s verifies the viewer inside the cache TTL", async (_name, path, body) => {
  const root = await mkdtemp(join(tmpdir(), "github-write-viewer-"));
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
    await mkdir(join(root, ".stintwork/local/stints"), { recursive: true });
    await mkdir(join(root, "web"));
    await writeFile(join(root, "web/index.html"), "<!doctype html>");
    await writeFile(join(root, "docs/agents/issue-tracker.md"), "# Issue tracker: GitHub\n");
    await writeFile(
      join(root, ".stintwork/local/stints/s1.jsonl"),
      `${JSON.stringify({
        type: "started",
        at: "2026-01-01T00:00:00Z",
        stint: {
          id: "s1",
          workItem: "github-1",
          stage: "review",
          ticket: null,
          agent: "codex",
          worktree: { path: root, branch: "stintwork/github-1" },
          baseCommit: "abc",
          brief: { prompt: "", skill: null, lastHandoff: null, changedPaths: [], pointers: [] },
        },
      })}\n${JSON.stringify({ type: "ended", at: "2026-01-01T00:01:00Z", status: "finished" })}\n`,
    );
    const gh = await fakeGh(join(root, "bin"));
    process.env.PATH = gh.path;
    const replies = {
      "auth status": {},
      "api user": { stdout: { id: 101, login: "101" } },
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
    server = createProjectServer(root, join(root, "web"), { githubViewerNow: () => 100_000 });
    const initial = await (await server.app.request("/api/project")).json();
    expect(initial.github.items).toHaveLength(1);
    await gh.script({ ...replies, "api user": { stdout: { id: 202, login: "202" } } });
    const response = await server.app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).reasonMessage.code).toBe("gate.identityAmbiguous");
  } finally {
    await server?.stop();
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

test.each([
  ["offline", { code: 1, stdout: "network offline" }],
  ["rate limited", { code: 1, stdout: "HTTP 429 rate limit exceeded" }],
  ["expired login", { code: 1, stdout: "authentication required" }],
])(
  "local stop and permission routes remain reachable after GitHub %s",
  async (_failure, failure) => {
    const root = await mkdtemp(join(tmpdir(), "github-local-safety-"));
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
      await mkdir(join(root, ".stintwork/local/stints"), { recursive: true });
      await mkdir(join(root, "web"));
      await writeFile(join(root, "web/index.html"), "<!doctype html>");
      await writeFile(join(root, "docs/agents/issue-tracker.md"), "# Issue tracker: GitHub\n");
      await writeFile(
        join(root, ".stintwork/local/stints/s1.jsonl"),
        `${JSON.stringify({
          type: "started",
          at: "2026-01-01T00:00:00Z",
          stint: {
            id: "s1",
            workItem: "github-1",
            stage: "review",
            ticket: null,
            agent: "codex",
            worktree: { path: root, branch: "stintwork/github-1" },
            baseCommit: "abc",
            brief: { prompt: "", skill: null, lastHandoff: null, changedPaths: [], pointers: [] },
          },
        })}\n${JSON.stringify({ type: "ended", at: "2026-01-01T00:01:00Z", status: "finished" })}\n`,
      );
      const gh = await fakeGh(join(root, "bin"));
      process.env.PATH = gh.path;
      const replies = {
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
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
      server = createProjectServer(root, join(root, "web"), { githubViewerNow: () => 100_000 });
      expect((await (await server.app.request("/api/project")).json()).github.items).toHaveLength(
        1,
      );
      await gh.script({ ...replies, "auth status": failure, "api user": failure });
      for (const [path, body, code] of [
        ["/api/stints/s1/stop", {}, "stint.notRunning"],
        ["/api/stints/s1/permissions/p1", { optionId: "cancel" }, "permission.notPending"],
        ["/api/stints/s1/permissions/p1", { optionId: "allow" }, "permission.notPending"],
      ] as const) {
        const response = await server.app.request(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        expect(response.status).toBe(409);
        expect((await response.json()).reasonMessage.code).toBe(code);
      }
      const response = await server.app.request("/api/stints/s1/confirm-agent", { method: "POST" });
      expect((await response.json()).reasonMessage.code).toBe("gate.identityAmbiguous");
    } finally {
      await server?.stop();
      process.env.PATH = oldPath;
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("concurrent offline fallback never returns a fresh snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "github-offline-race-"));
  const oldPath = process.env.PATH;
  let server: ReturnType<typeof createProjectServer> | undefined;
  const release = join(root, "release");
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
    const git = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
    const gh = await fakeGh(join(root, "bin"));
    process.env.PATH = gh.path;
    const replies = {
      "auth status": {},
      "api user": { stdout: { id: 101, login: "101" } },
      "api repos/example/project": {
        stdout: {
          node_id: "R_1",
          full_name: "example/project",
          html_url: "https://github.com/example/project",
        },
      },
      "api graphql": { stdout: page },
      "config get": { stdout: "101" },
    };
    await gh.script(replies);
    let now = 100_000;
    const instance = createProjectServer(root, join(root, "web"), { githubViewerNow: () => now });
    server = instance;
    const get = async () => (await instance.app.request("/api/project")).json();
    expect((await get()).github.items).toHaveLength(1);
    const marker = join(root, "origin-started");
    await writeFile(
      join(root, "bin/git"),
      `#!${process.execPath}
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
if (args.join(' ') === 'config --get-all remote.origin.url') {
  try {
    fs.writeFileSync(${JSON.stringify(marker)}, '', { flag: 'wx' });
    while (!fs.existsSync(${JSON.stringify(release)})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
}
const result = spawnSync(${JSON.stringify(git)}, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`,
      { mode: 0o755 },
    );
    await gh.script({
      ...replies,
      "api user": {
        code: 1,
        effect:
          "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); process.stderr.write('network error')",
      },
    });
    now += 60_001;
    await get();
    await expect
      .poll(async () =>
        access(marker).then(
          () => true,
          () => false,
        ),
      )
      .toBe(true);
    const concurrent = await get();
    expect(concurrent.github).toMatchObject({
      stale: true,
      discoveryFailed: true,
      errorCode: "offline",
      items: [{ title: "Private" }],
    });
  } finally {
    await writeFile(release, "");
    await server?.stop();
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

test.each(["changed", "logout", "offline"])(
  "expired viewer remains redacted while checking and handles %s",
  async (scenario) => {
    const root = await mkdtemp(join(tmpdir(), "github-expiry-"));
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
      const replies = {
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
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
      let now = 100_000;
      const instance = createProjectServer(root, join(root, "web"), { githubViewerNow: () => now });
      server = instance;
      const get = async () => (await instance.app.request("/api/project")).json();
      expect((await get()).github.items).toHaveLength(1);
      now += 60_001;
      const newer = {
        ...page,
        data: {
          ...page.data,
          repository: {
            ...page.data.repository,
            issues: connection([
              {
                ...issue,
                id: "I_2",
                number: 2,
                title: "New",
                url: "https://github.com/example/project/issues/2",
              },
            ]),
          },
        },
      };
      await gh.script({
        ...replies,
        "auth status": scenario === "logout" ? { code: 1 } : {},
        "api user":
          scenario === "offline"
            ? { code: 1, effect: "process.stderr.write('network error')" }
            : { stdout: { id: 202, login: "202" } },
        "api graphql": { stdout: newer },
      });
      const checking = await get();
      expect(checking.github.items).toEqual([]);
      if (scenario === "changed") {
        await expect.poll(async () => (await get()).github?.items?.[0]?.title).toBe("New");
      } else {
        await expect
          .poll(async () => (await get()).github?.errorCode)
          .toBe(scenario === "logout" ? "login" : "offline");
        const failed = await get();
        expect(failed.github.discoveryFailed).toBe(true);
        expect(failed.github.items).toEqual([]);
        if (scenario === "offline") {
          const start = await instance.app.request("/api/stints", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ workItem: "github-1", ticket: 2, agent: "codex" }),
          });
          expect(start.status).toBe(409);
          await gh.script(replies);
          await expect.poll(async () => (await get()).github?.items?.[0]?.title).toBe("Private");
        }
      }
    } finally {
      await server?.stop();
      process.env.PATH = oldPath;
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("offline discovery cannot authorize an unavailable viewer", async () => {
  const root = await mkdtemp(join(tmpdir(), "github-discovery-viewer-"));
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
    const replies = {
      "auth status": {},
      "api user": { stdout: { id: 101, login: "101" } },
      "api repos/example/project": {
        stdout: {
          node_id: "R_1",
          full_name: "example/project",
          html_url: "https://github.com/example/project",
        },
      },
      "api graphql": { stdout: page },
      "config get": { stdout: "101" },
    };
    await gh.script(replies);
    let now = 100_000;
    const instance = createProjectServer(root, join(root, "web"), { githubViewerNow: () => now });
    server = instance;
    const get = async () => (await instance.app.request("/api/project")).json();
    expect((await get()).github.items).toHaveLength(1);
    await gh.script({
      ...replies,
      "api graphql": { code: 1, effect: "process.stderr.write('network error')" },
    });
    const failed = await (
      await server.app.request("/api/github/discovery/refresh", { method: "POST" })
    ).json();
    expect(failed.github.errorCode).toBe("offline");
    now += 60_001;
    await gh.script({
      ...replies,
      "api user": { code: 1, effect: "process.stderr.write('ambiguous authentication')" },
    });
    const before = (await gh.calls()).filter(
      ({ args }) => args[0] === "api" && args[1] === "user",
    ).length;
    await get();
    await expect
      .poll(
        async () =>
          (await gh.calls()).filter(({ args }) => args[0] === "api" && args[1] === "user").length,
      )
      .toBeGreaterThan(before);
    await expect.poll(async () => (await get()).github.items).toEqual([]);
    expect((await get()).github).toMatchObject({ errorCode: "offline", items: [] });
  } finally {
    await server?.stop();
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

test.each([
  ["same", { stdout: "101" }, true],
  ["different", { stdout: "202" }, false],
  ["empty", { stdout: "" }, false],
  ["failed", { code: 1 }, false],
])("offline viewer local config %s", async (_name, local, visible) => {
  const root = await mkdtemp(join(tmpdir(), "github-local-viewer-"));
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
    const replies = {
      "auth status": {},
      "api user": { stdout: { id: 101, login: "101" } },
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
    let now = 100_000;
    const instance = createProjectServer(root, join(root, "web"), { githubViewerNow: () => now });
    server = instance;
    const get = async () => (await instance.app.request("/api/project")).json();
    expect((await get()).github.items).toHaveLength(1);
    now += 60_001;
    await gh.script({
      ...replies,
      "api user": { code: 1, effect: "process.stderr.write('network error')" },
      "config get": local,
    });
    await get();
    await expect.poll(async () => (await get()).github?.errorCode).toBe("offline");
    const failed = await get();
    expect(failed.github.discoveryFailed).toBe(true);
    expect(failed.github.items).toHaveLength(visible ? 1 : 0);
    if (visible) {
      expect(failed.github.stale).toBe(true);
      const start = await server.app.request("/api/stints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workItem: "github-1", ticket: 2, agent: "codex" }),
      });
      expect(start.status).toBe(409);
    }
  } finally {
    await server?.stop();
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("offline auth retains data only while the local account matches and coalesces reads", async () => {
  const root = await mkdtemp(join(tmpdir(), "github-offline-identity-"));
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
    const replies = {
      "auth status": {},
      "api user": { stdout: { id: 101, login: "101" } },
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
    let now = 100_000;
    const instance = createProjectServer(root, join(root, "web"), { githubViewerNow: () => now });
    server = instance;
    const get = async () => (await instance.app.request("/api/project")).json();
    expect((await get()).github.items).toHaveLength(1);
    now += 60_001;
    await gh.script({
      ...replies,
      "auth status": { code: 1, effect: "process.stderr.write('network error')" },
      "config get": { stdout: "101" },
    });
    await get();
    await expect.poll(async () => (await get()).github?.errorCode).toBe("offline");
    await gh.script({
      ...replies,
      "auth status": {
        code: 1,
        effect:
          "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500); process.stderr.write('network error')",
      },
      "config get": { stdout: "101" },
    });
    const count = async () =>
      (await gh.calls()).filter(({ args }) => args[0] === "config" && args[1] === "get").length;
    const before = await count();
    const results = await Promise.all(Array.from({ length: 6 }, get));
    expect(await count()).toBe(before + 1);
    for (const result of results)
      expect(result.github).toMatchObject({
        stale: true,
        errorCode: "offline",
        items: [{ title: "Private" }],
      });
    await gh.script({
      ...replies,
      "auth status": { code: 1, effect: "process.stderr.write('network error')" },
      "config get": { stdout: "202" },
    });
    expect(JSON.stringify(await get())).not.toContain("Private");
    await gh.script({
      ...replies,
      "auth status": { code: 1, effect: "process.stderr.write('network error')" },
      "config get": { stdout: "101" },
    });
    expect(JSON.stringify(await get())).not.toContain("Private");
  } finally {
    await server?.stop();
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("offline reads wait for an in-flight local account check", async () => {
  const root = await mkdtemp(join(tmpdir(), "github-offline-wait-"));
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
    const replies = {
      "auth status": {},
      "api user": { stdout: { id: 101, login: "101" } },
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
    let now = 100_000;
    const instance = createProjectServer(root, join(root, "web"), { githubViewerNow: () => now });
    server = instance;
    const get = async () => (await instance.app.request("/api/project")).json();
    expect((await get()).github.items).toHaveLength(1);
    now += 60_001;
    const offline = {
      ...replies,
      "api user": { code: 1, effect: "process.stderr.write('network error')" },
      "config get": { stdout: "101" },
    };
    await gh.script(offline);
    await get();
    await expect.poll(async () => (await get()).github?.errorCode).toBe("offline");
    await gh.script({
      ...offline,
      "api user": {
        code: 1,
        effect:
          "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300); process.stderr.write('network error')",
      },
      "config get": {
        stdout: "101",
        effect: "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)",
      },
    });
    const count = async () =>
      (await gh.calls()).filter(({ args }) => args[0] === "config" && args[1] === "get").length;
    const before = await count();
    const results = await Promise.all(Array.from({ length: 3 }, get));
    expect(await count()).toBe(before + 1);
    for (const result of results)
      expect(result.github).toMatchObject({ errorCode: "offline", items: [{ title: "Private" }] });
    // A new retry may clear the fallback flag while its local check is still running.
    expect((await get()).github.items).toHaveLength(1);
    expect((await get()).github).toMatchObject({
      errorCode: "offline",
      items: [{ title: "Private" }],
    });
  } finally {
    await server?.stop();
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

test.each(["changed", "case", "refresh", "token"])(
  "offline cache protects origin and token identity: %s",
  async (scenario) => {
    const root = await mkdtemp(join(tmpdir(), "github-offline-origin-"));
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
      const replies = {
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
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
      let now = 100_000;
      const instance = createProjectServer(root, join(root, "web"), { githubViewerNow: () => now });
      server = instance;
      const get = async () => (await instance.app.request("/api/project")).json();
      expect((await get()).github.items).toHaveLength(1);
      now += 60_001;
      await gh.script({
        ...replies,
        "auth status": { code: 1, effect: "process.stderr.write('network error')" },
        "config get": { stdout: "101" },
      });
      if (scenario === "token") vi.stubEnv("GH_TOKEN", "test-token");
      await get();
      await expect.poll(async () => (await get()).github?.errorCode).toBe("offline");
      if (scenario === "token") {
        expect((await get()).github.items).toEqual([]);
        expect((await gh.calls()).some(({ args }) => args[0] === "config")).toBe(false);
        return;
      }
      await expect.poll(async () => (await get()).github?.items?.length).toBe(1);
      const origin = scenario === "case" ? "EXAMPLE/PROJECT" : "other/repo";
      execFileSync("git", [
        "-C",
        root,
        "remote",
        "set-url",
        "origin",
        `https://github.com/${origin}.git`,
      ]);
      if (scenario === "refresh")
        await server.app.request("/api/github/discovery/refresh", { method: "POST" });
      if (scenario === "case") {
        await expect.poll(async () => (await get()).github?.items?.length).toBe(1);
      } else {
        expect((await get()).github?.items ?? []).toHaveLength(0);
      }
      if (scenario !== "case") {
        execFileSync("git", [
          "-C",
          root,
          "remote",
          "set-url",
          "origin",
          "https://github.com/example/project.git",
        ]);
        expect((await get()).github?.items ?? []).toHaveLength(0);
      }
    } finally {
      await server?.stop();
      process.env.PATH = oldPath;
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  },
);

test.each(["account", "origin"])(
  "new offline WebSocket connection redacts data after %s changes",
  async (change) => {
    const root = await mkdtemp(join(tmpdir(), "github-offline-socket-"));
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
        "api user": { stdout: { id: 101, login: "101" } },
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
      let now = 100_000;
      const instance = createProjectServer(root, join(root, "web"), { githubViewerNow: () => now });
      server = instance;
      const http = await instance.start();
      const get = async () => (await instance.app.request("/api/project")).json();
      expect((await get()).github.items).toHaveLength(1);
      now += 60_001;
      await gh.script({
        ...replies,
        "auth status": { code: 1, effect: "process.stderr.write('network error')" },
        "config get": { stdout: "101" },
      });
      await get();
      await expect.poll(async () => (await get()).github?.items?.[0]?.title).toBe("Private");
      http.listen(0, "127.0.0.1");
      await once(http, "listening");
      const address = http.address();
      if (!address || typeof address === "string") throw new Error("Missing server address");
      await gh.script({
        ...replies,
        "auth status": { code: 1, effect: "process.stderr.write('network error')" },
        "config get": { stdout: "202" },
      });
      if (change === "origin") {
        await gh.script({
          ...replies,
          "auth status": { code: 1, effect: "process.stderr.write('network error')" },
          "config get": { stdout: "101" },
        });
        execFileSync("git", [
          "-C",
          root,
          "remote",
          "set-url",
          "origin",
          "https://github.com/other/repo.git",
        ]);
      }
      socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/live`);
      const [message] = await once(socket, "message");
      expect(message.toString()).not.toContain("Private");
      expect(JSON.stringify(await get())).not.toContain("Private");
    } finally {
      socket?.terminate();
      await server?.stop();
      process.env.PATH = oldPath;
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("viewer recovery cannot restore an obsolete failure after a failed repository refresh", async () => {
  const root = await mkdtemp(join(tmpdir(), "github-viewer-recovery-"));
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
    const replies = {
      "auth status": {},
      "api user": { stdout: { id: 101, login: "101" } },
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
    let now = 100_000;
    const instance = createProjectServer(root, join(root, "web"), { githubViewerNow: () => now });
    server = instance;
    const get = async () => (await instance.app.request("/api/project")).json();
    await get();
    now += 60_001;
    await gh.script({
      ...replies,
      "api user": { code: 1, effect: "process.stderr.write('network error')" },
    });
    await get();
    await expect.poll(async () => (await get()).github?.errorCode).toBe("offline");
    await gh.script({
      ...replies,
      "api repos/example/project": { code: 1, effect: "process.stderr.write('HTTP 500')" },
    });
    const failed = await (
      await server.app.request("/api/github/discovery/refresh", { method: "POST" })
    ).json();
    expect(failed.github).toMatchObject({
      discoveryFailed: true,
      errorCode: "server-error",
      stale: true,
    });
    now += 60_001;
    await get();
    await expect.poll(async () => (await get()).github?.verifying).not.toBe(true);
    expect((await get()).github).toMatchObject({
      discoveryFailed: true,
      errorCode: "server-error",
      stale: true,
    });
  } finally {
    await server?.stop();
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("discovery returns conflict while a detail read is in flight", async () => {
  const root = await mkdtemp(join(tmpdir(), "github-busy-"));
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
    await gh.script({
      "auth status": {},
      "api user": { stdout: { id: 101, login: "101" } },
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
    await server.app.request("/api/project");
    await gh.script({
      "auth status": {},
      "api user": { stdout: { id: 101, login: "101" } },
      "api repos/example/project": {
        stdout: {
          node_id: "R_1",
          full_name: "example/project",
          html_url: "https://github.com/example/project",
        },
        effect: "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)",
      },
    });
    const detail = server.app.request("/api/github/items/1/refresh", { method: "POST" });
    await expect
      .poll(
        async () =>
          (await gh.calls()).filter((call) => call.args[1] === "repos/example/project").length,
      )
      .toBeGreaterThan(1);
    expect(
      (await server.app.request("/api/github/discovery/refresh", { method: "POST" })).status,
    ).toBe(409);
    await detail;
  } finally {
    await server?.stop();
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

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
      "api user": { stdout: { id: 101, login: "101" } },
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
        "api user": { stdout: { id: 101, login: "101" } },
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
      let now = 100_000;
      server = createProjectServer(root, join(root, "web"), { githubViewerNow: () => now });
      const first = await (
        await server.app.request("/api/github/items/1/refresh", { method: "POST" })
      ).json();
      expect(first.github.items[0].detail.spec).toBe("Secret");
      await gh.script({
        "auth status": {},
        "api user": { stdout: changed ? { id: 202, login: "101" } : { id: 101, login: "101" } },
        "api repos/example/project": { effect: "process.stderr.write('HTTP 500')", code: 1 },
      });
      now += 60_001;
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
      "api user": { stdout: { id: 101, login: "101" } },
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
    let now = 100_000;
    server = createProjectServer(root, join(root, "web"), {
      githubViewerIntervalMs: 200,
      githubViewerNow: () => now,
    });
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
    now += 60_001;
    await gh.script({
      ...replies,
      "api user": { code: 1, effect: "process.stderr.write('offline')" },
    });
    socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/live`);
    const messages: { github?: { items: { title: string }[]; verifying?: boolean } }[] = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
    await once(socket, "open");
    await expect.poll(() => messages.length).toBeGreaterThan(0);
    expect(messages[0].github).toMatchObject({ items: [], verifying: true });
    await expect.poll(count, { timeout: 5000 }).toBeGreaterThan(before);
    expect((await (await server.app.request("/api/project")).json()).github.items).toHaveLength(0);
    await gh.script({
      ...replies,
      "api user": { stdout: { id: 202, login: "202" } },
      "api graphql": {
        stdout: {
          ...page,
          data: {
            ...page.data,
            repository: {
              ...page.data.repository,
              issues: connection([
                {
                  ...issue,
                  id: "I_2",
                  number: 2,
                  title: "New",
                  url: "https://github.com/example/project/issues/2",
                },
              ]),
            },
          },
        },
      },
    });
    await expect
      .poll(
        () =>
          messages.some((message) => message.github?.items.some((item) => item.title === "New")),
        { timeout: 5000 },
      )
      .toBe(true);
    expect(
      messages.every((message) => !message.github?.items.some((item) => item.title === "Private")),
    ).toBe(true);
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

test.each(["origin", "account id"])(
  "viewer revalidation clears private data on changed %s",
  async (changed) => {
    const root = await mkdtemp(join(tmpdir(), "github-poll-identity-"));
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
      const replies = {
        "auth status": {},
        "api user": { stdout: { id: 101, login: "same" } },
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
      let now = 100_000;
      const instance = createProjectServer(root, join(root, "web"), { githubViewerNow: () => now });
      server = instance;
      const get = async () => (await instance.app.request("/api/project")).json();
      expect((await get()).github.items).toHaveLength(1);
      if (changed === "origin")
        execFileSync("git", [
          "-C",
          root,
          "remote",
          "set-url",
          "origin",
          "https://github.com/other/project.git",
        ]);
      await gh.script({
        ...replies,
        "api user": { stdout: { id: changed === "account id" ? 202 : 101, login: "same" } },
        "api repos/example/project": { code: 1 },
        "api repos/other/project": { code: 1 },
      });
      now += 60_001;
      expect((await get()).github.items).toEqual([]);
      await expect.poll(async () => (await get()).github?.errorCode).toBeTruthy();
      const result = await get();
      expect(result.github.items).toEqual([]);
      expect(result.github.fetchedAt).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain("Private");
    } finally {
      await server?.stop();
      process.env.PATH = oldPath;
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("stopping cancels an in-flight viewer authentication before the user check", async () => {
  const root = await mkdtemp(join(tmpdir(), "github-stop-viewer-"));
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
    const replies = {
      "auth status": {},
      "api user": { stdout: { id: 101, login: "same" } },
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
    let now = 100_000;
    server = createProjectServer(root, join(root, "web"), { githubViewerNow: () => now });
    await server.app.request("/api/project");
    const calls = await gh.calls();
    await gh.script({
      ...replies,
      "auth status": {
        effect: "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)",
      },
    });
    now += 60_001;
    await server.app.request("/api/project");
    await expect.poll(async () => (await gh.calls()).length).toBeGreaterThan(calls.length);
    await server.stop();
    const stopped = await gh.calls();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(await gh.calls()).toEqual(stopped);
    expect(stopped.filter(({ args }) => args[0] === "api" && args[1] === "user")).toHaveLength(1);
  } finally {
    await server?.stop();
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

test.each(["offline discovery", "rate limit"])(
  "%s remains protected through viewer checks",
  async (scenario) => {
    const root = await mkdtemp(join(tmpdir(), "github-refresh-protection-"));
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
      const replies = {
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "config get": { stdout: "101" },
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
      let now = 100_000;
      const instance = createProjectServer(root, join(root, "web"), { githubViewerNow: () => now });
      server = instance;
      const get = async () => (await instance.app.request("/api/project")).json();
      await get();
      await gh.script({
        ...replies,
        "api repos/example/project": {
          code: 1,
          effect:
            scenario === "rate limit"
              ? "process.stderr.write('secondary rate limit (HTTP 403)\\nRetry-After: 2\\n')"
              : "process.stderr.write('network error')",
        },
      });
      now += 60_001;
      const failed = await (
        await server.app.request("/api/github/discovery/refresh", { method: "POST" })
      ).json();
      expect(failed.github).toMatchObject({ discoveryFailed: true, stale: true });
      await gh.script(replies);
      now += 60_001;
      if (scenario === "rate limit") {
        const count = async () =>
          (await gh.calls()).filter(({ args }) => args[0] === "api" && args[1] === "user").length;
        const before = await count();
        expect((await get()).github).toMatchObject({
          discoveryFailed: true,
          stale: true,
          items: [{ title: "Private" }],
        });
        await get();
        expect(await count()).toBe(before);
        await new Promise((resolve) => setTimeout(resolve, 2200));
        await get();
        await expect.poll(count).toBeGreaterThan(before);
      } else {
        await get();
        await expect.poll(async () => (await get()).github?.verifying).not.toBe(true);
        expect((await get()).github).toMatchObject({
          discoveryFailed: true,
          stale: true,
          errorCode: "offline",
        });
        const start = await server.app.request("/api/stints", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workItem: "github-1", ticket: 1, agent: "codex" }),
        });
        expect(start.status).toBe(409);
      }
      const refreshed = await (
        await server.app.request("/api/github/discovery/refresh", { method: "POST" })
      ).json();
      expect(refreshed.github).toMatchObject({ discoveryFailed: false, stale: false });
    } finally {
      await server?.stop();
      process.env.PATH = oldPath;
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("viewer polling respects discovery rate limit until its retry deadline", async () => {
  const root = await mkdtemp(join(tmpdir(), "github-poll-cooldown-"));
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
      "api user": { stdout: { id: 101, login: "101" } },
      "config get": { stdout: "101" },
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
    server = createProjectServer(root, join(root, "web"), { githubViewerIntervalMs: 100 });
    const http = await server.start();
    http.listen(0, "127.0.0.1");
    await once(http, "listening");
    const address = http.address();
    if (!address || typeof address === "string") throw new Error("Missing server address");
    socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/live`);
    const messages: {
      github?: { items: unknown[]; errorCode?: string; stale?: boolean };
      workItems: unknown[];
    }[] = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
    await once(socket, "open");
    await gh.script({
      ...replies,
      "api repos/example/project": {
        code: 1,
        effect: "process.stderr.write('secondary rate limit (HTTP 403)\\nRetry-After: 3\\n')",
      },
    });
    const failed = await (
      await server.app.request("/api/github/discovery/refresh", { method: "POST" })
    ).json();
    expect(failed.github.errorCode).toBe("rate-limited");
    await gh.script(replies);
    const count = async () =>
      (await gh.calls()).filter(({ args }) => args[0] === "api" && args[1] === "user").length;
    const before = await count();
    messages.length = 0;
    await server.app.request("/api/github/discovery/refresh", { method: "POST" });
    await expect
      .poll(() =>
        messages.some(
          (message) =>
            message.github?.errorCode === "rate-limited" &&
            message.github.stale &&
            message.github.items.length === 1 &&
            message.workItems.length === 1,
        ),
      )
      .toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await count()).toBe(before);
    await expect.poll(count, { timeout: 5000 }).toBeGreaterThan(before);
  } finally {
    socket?.terminate();
    await server?.stop();
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent requests refresh before expiry and redact at expiry", async () => {
  const root = await mkdtemp(join(tmpdir(), "github-viewer-ttl-"));
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
    await gh.script({
      "auth status": {
        effect: "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150)",
      },
      "api user": { stdout: { id: 101, login: "101" } },
      "api repos/example/project": {
        stdout: {
          node_id: "R_1",
          full_name: "example/project",
          html_url: "https://github.com/example/project",
        },
      },
      "api graphql": { stdout: page },
    });
    let now = 100_000;
    server = createProjectServer(root, join(root, "web"), { githubViewerNow: () => now });
    const get = async () => (await server!.app.request("/api/project")).json();
    expect((await get()).github.items[0].title).toBe("Private");
    now += 45_000;
    const results = await Promise.all(Array.from({ length: 20 }, get));
    expect(results.every((result) => result.github.items[0]?.title === "Private")).toBe(true);
    now += 15_000;
    expect((await get()).github.items).toEqual([]);
    await expect
      .poll(
        async () =>
          (await gh.calls()).filter((call) => call.args[0] === "api" && call.args[1] === "user")
            .length,
      )
      .toBe(2);
    await expect.poll(async () => (await get()).github.items[0]?.title).toBe("Private");
    await Promise.all(Array.from({ length: 20 }, get));
    const calls = await gh.calls();
    expect(calls.filter((call) => call.args[0] === "auth")).toHaveLength(2);
    expect(calls.filter((call) => call.args[0] === "api" && call.args[1] === "user")).toHaveLength(
      2,
    );
  } finally {
    await server?.stop();
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});
