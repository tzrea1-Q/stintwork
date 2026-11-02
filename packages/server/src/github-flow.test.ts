// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakeAgentLauncher } from "@stintwork/agents/testing";
import { expect, test } from "vitest";
import { parse } from "yaml";
import { fakeGh } from "../test/fake-gh.js";
import { createProjectServer } from "./index.js";

test("GitHub discovery, gates, ticket stints, freshness and recovery use read-only gh", async () => {
  const root = mkdtempSync(join(tmpdir(), "github-flow-"));
  const oldPath = process.env.PATH;
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  let server: ReturnType<typeof createProjectServer> | undefined;
  try {
    git("init", "-q");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.invalid");
    git("remote", "add", "origin", "https://github.com/Example/Project.git");
    mkdirSync(join(root, "docs/agents"), { recursive: true });
    mkdirSync(join(root, "web"));
    writeFileSync(join(root, "docs/agents/issue-tracker.md"), "# Issue tracker: GitHub\n");
    writeFileSync(join(root, "web/index.html"), "<!doctype html>");
    writeFileSync(join(root, ".gitignore"), ".stintwork/local/\nbin/\n");
    git("add", ".");
    git("commit", "-qm", "initial");
    const gh = await fakeGh(join(root, "bin"));
    process.env.PATH = gh.path;
    const connection = (nodes: unknown[]) => ({
      nodes,
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    const url = (n: number) => `https://github.com/Example/Project/issues/${n}`;
    const issue = (n: number) => ({
      node_id: `I_${n}`,
      number: n,
      title: `Issue ${n}`,
      body: n === 10 ? "Spec body" : `Ticket ${n}`,
      html_url: url(n),
      repository_url: "https://api.github.com/repos/Example/Project",
      state: "open",
      state_reason: null as string | null,
      labels: [],
      comments: n === 10 || n === 11 ? 1 : 0,
      sub_issues_summary: { total: n === 10 ? 2 : 0 },
      issue_dependencies_summary: { total_blocked_by: n === 12 ? 1 : 0 },
    });
    const parent = issue(10),
      first = issue(11),
      second = issue(12);
    const path = (n: number) => `api repos/Example/Project/issues/${n}`;
    const page = {
      data: {
        repository: {
          id: "R_1",
          nameWithOwner: "Example/Project",
          issues: connection(
            [10, 11, 12, 13].map((n) => ({
              id: `I_${n}`,
              number: n,
              title: `Issue ${n}`,
              url: url(n),
              parent: n === 11 || n === 12 ? { id: "I_10" } : null,
              labels: connection([]),
              subIssues: {
                ...connection(
                  n === 10 ? [{ repository: { id: "R_1" }, subIssues: { totalCount: 0 } }] : [],
                ),
                totalCount: n === 10 ? 2 : 0,
              },
            })),
          ),
        },
        rateLimit: { cost: 1, remaining: 4999, resetAt: "2099-01-01T00:00:00Z" },
      },
    };
    const replies = () => ({
      "auth status": {},
      "config get": { stdout: "101" },
      "api user": { stdout: { id: 101, login: "101" } },
      "api repos/Example/Project": {
        stdout: {
          node_id: "R_1",
          full_name: "Example/Project",
          html_url: "https://github.com/Example/Project",
        },
      },
      "api graphql": { stdout: page },
      [path(10)]: { stdout: parent },
      [`${path(10)}/sub_issues?per_page=100&page=1`]: { stdout: [second, first] },
      [`${path(10)}/comments?per_page=100&page=1`]: {
        stdout: [{ id: 10, node_id: "C_parent", body: "Discussion" }],
      },
      ...Object.fromEntries(
        [11, 12].flatMap((n) => [
          [`${path(n)}/labels?per_page=100&page=1`, { stdout: [] }],
          [
            `${path(n)}/comments?per_page=100&page=1`,
            { stdout: n === 11 ? [{ id: 11, node_id: "C_11", body: "Ticket comment" }] : [] },
          ],
          [
            `${path(n)}/dependencies/blocked_by?per_page=100&page=1`,
            { stdout: n === 12 ? [first] : [] },
          ],
        ]),
      ),
    });
    await gh.script(replies());
    const launch = createFakeAgentLauncher(
      [{ type: "delay", milliseconds: 300 }],
      [
        {
          type: "message",
          text: "## Where I stopped\nDone.\n## Unresolved\nNone.\n## Suggested next\nReview.",
        },
      ],
    );
    server = createProjectServer(root, join(root, "web"), {
      launchAgent: launch,
      handoffTimeoutMs: 1000,
    });
    const app = server.app;
    const get = async () => (await app.request("/api/project")).json();
    const post = (url: string, body?: unknown) =>
      app.request(url, {
        method: "POST",
        ...(body === undefined
          ? {}
          : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
    const detail = async () => {
      let result: Response | undefined;
      await expect
        .poll(
          async () => {
            result = await post("/api/github/items/10/refresh");
            return result.status;
          },
          { timeout: 10000 },
        )
        .not.toBe(409);
      if (!result) throw new Error("Detail refresh did not return a response");
      return (result as Response).json();
    };
    const start = (ticket: number | null) =>
      post("/api/stints", { workItem: "github-10", ticket, agent: "codex" });
    const waitFinished = async (id: string) =>
      expect
        .poll(async () => (await (await app.request(`/api/stints/${id}`)).json()).stint.status, {
          timeout: 10000,
        })
        .toBe("finished");
    const stint = async (ticket: number | null) => {
      const response = await start(ticket);
      expect(response.status, await response.clone().text()).toBe(201);
      const { stint: result } = await response.json();
      await waitFinished(result.id);
      return result;
    };
    const gate = async (stage: string, action = "approve") => {
      const item = (await get()).workItems[0];
      return post(`/api/github/items/10/gates/${action}`, {
        stage,
        reviewedDigest: item.github.reviewDigest,
        reviewedHead: item.github.reviewHead,
      });
    };
    let snapshot = await get();
    expect(snapshot.github.items.map((item: { number: number }) => item.number)).toEqual([10]);
    snapshot = await detail();
    expect(snapshot.github.items[0].detail, JSON.stringify(snapshot.github)).toMatchObject({
      spec: "Spec body",
      comments: ["Discussion"],
      complete: true,
    });
    expect(
      snapshot.workItems[0].tickets.map((ticket: { number: number }) => ticket.number),
    ).toEqual([11, 12]);
    expect(snapshot.workItems[0].tickets[1]).toMatchObject({ blocked: true, blockedBy: [11] });
    expect(
      snapshot.github.items[0].detail.tickets.find(
        (ticket: { number: number }) => ticket.number === 11,
      ).comments,
    ).toEqual(["Ticket comment"]);
    for (const stage of ["clarify", "spec", "tickets"]) {
      if (stage === "spec") {
        parent.body = "Published spec";
        await gh.script(replies());
        snapshot = await detail();
        expect(snapshot.workItems[0].stages.clarify.approved.remoteState).toBe("current");
      }
      await stint(null);
      const response = await gate(stage);
      expect(response.status, await response.clone().text()).toBe(200);
      if (stage === "spec") {
        parent.body = "Changed after approval";
        await gh.script(replies());
        snapshot = await detail();
        expect(snapshot.workItems[0].stages.clarify.approved.remoteState).toBe("current");
        expect(snapshot.workItems[0].stages.spec.approved.remoteState).toBe("stale");
        expect((await gate("tickets")).status).toBe(409);
        parent.body = "Published spec";
        await gh.script(replies());
        await detail();
      }
    }
    const recordPath = ".stintwork/github/example/project/10/workflow.yaml";
    const worktree = `${root}-worktrees/github-10`;
    const record = parse(readFileSync(join(worktree, recordPath), "utf8"));
    expect(record.github).toMatchObject({
      repository: "Example/Project",
      repositoryId: "R_1",
      issueId: "I_10",
      number: 10,
    });
    expect(record.stages.spec.approved.remote).toMatchObject({
      version: 2,
      parentId: "I_10",
      digest: expect.stringMatching(/^sha256:/),
    });
    expect(git("show", `stintwork/github-10:${recordPath}`)).toContain("repositoryId: R_1");
    expect((await start(12)).status).toBe(409);
    const startFirst = await start(11);
    expect(startFirst.status, await startFirst.clone().text()).toBe(201);
    const { stint: started } = await startFirst.json();
    first.state = "closed";
    first.state_reason = "completed";
    await gh.script(replies());
    await waitFinished(started.id);
    await expect
      .poll(async () => (await get()).workItems[0].tickets[0].resolved, { timeout: 10000 })
      .toBe(true);
    expect(started.brief.prompt).toContain(url(11));
    expect(started.brief.prompt).toContain("-R Example/Project");
    expect(started.brief.prompt).not.toContain(".scratch");
    expect(existsSync(worktree)).toBe(true);
    snapshot = await detail();
    expect(snapshot.workItems[0].tickets[0].resolved).toBe(true);
    expect(snapshot.workItems[0].tickets[1].blocked).toBe(false);
    expect(snapshot.workItems[0].stages.tickets.approved.remoteState).toBe("current");
    await stint(12);
    let response: Response;
    first.body = "Edited ticket";
    await gh.script(replies());
    snapshot = await detail();
    expect(snapshot.workItems[0].stages.tickets.approved.remoteState).toBe("stale");
    expect((await start(12)).status).toBe(409);
    response = await gate("tickets", "reopen");
    expect(response.status, await response.clone().text()).toBe(200);
    await stint(null);
    response = await gate("tickets");
    expect(response.status, await response.clone().text()).toBe(200);
    await stint(12);
    const reviewed = (await get()).workItems[0].github;
    await gh.script({
      ...replies(),
      [`${path(10)}/sub_issues?per_page=100&page=1`]: {
        code: 1,
        effect: "process.stderr.write('network is unreachable')",
      },
    });
    snapshot = await detail();
    expect(snapshot.github.items[0]).toMatchObject({
      complete: false,
      detail: { spec: "Published spec", stale: true },
    });
    expect(snapshot.workItems[0].tickets[1]).toMatchObject({ blocked: true, status: "unknown" });
    expect((await start(12)).status).toBe(409);
    expect(
      (
        await post("/api/github/items/10/gates/approve", {
          stage: "implement",
          reviewedDigest: reviewed.reviewDigest,
          reviewedHead: reviewed.reviewHead,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post("/api/github/items/10/gates/reopen", {
          stage: "tickets",
          reviewedDigest: reviewed.reviewDigest,
          reviewedHead: reviewed.reviewHead,
        })
      ).status,
    ).toBe(409);
    await gh.script(replies());
    snapshot = await detail();
    expect(snapshot.github.items[0]).toMatchObject({
      complete: true,
      detail: { spec: "Published spec" },
    });
    expect(snapshot.github.items[0].detail.stale).not.toBe(true);
    for (const { args } of await gh.calls()) {
      expect(["auth", "config", "api"]).toContain(args[0]);
      if (args[0] === "auth") expect(args[1]).toBe("status");
      if (args[0] === "config") expect(args[1]).toBe("get");
      if (args[1] === "graphql") {
        expect(args.find((arg) => arg.startsWith("query="))).toMatch(/^query=\s*query\b/);
      }
      if (args[0] === "api") {
        if (args[1] !== "graphql") {
          expect(args).not.toContain("-f");
          expect(args).not.toContain("-F");
          expect(args).not.toContain("--field");
          expect(args).not.toContain("--raw-field");
        }
        const method = args.findIndex((arg) => arg === "-X" || arg === "--method");
        if (method !== -1 && args[method + 1] === "POST") expect(args[1]).toBe("graphql");
        else if (method !== -1) expect(args[method + 1]).toBe("GET");
      }
    }
  } finally {
    await server?.stop();
    process.env.PATH = oldPath;
    rmSync(root, { recursive: true, force: true });
    rmSync(`${root}-worktrees`, { recursive: true, force: true });
  }
}, 600000);
