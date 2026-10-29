// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import type { WebSocket } from "ws";
import { fakeGh } from "../test/fake-gh.js";

const live = vi.hoisted(() => ({ messages: [] as string[] }));
vi.mock("ws", async (importOriginal) => {
  const ws = await importOriginal<typeof import("ws")>();
  return {
    ...ws,
    WebSocketServer: class extends ws.WebSocketServer {
      constructor(options: ConstructorParameters<typeof ws.WebSocketServer>[0]) {
        super(options);
        const client = {
          readyState: ws.WebSocket.OPEN,
          send: (message: string) => live.messages.push(message),
          terminate: () => this.clients.delete(client as WebSocket),
        } as unknown as WebSocket;
        this.clients.add(client);
      }
    },
  };
});

const scenarios = [
  "same",
  "load-more",
  "removed",
  "identity",
  "viewer",
  "origin",
  "detail-first",
  "discovery-first",
  "isolated-details",
  "cooldown",
  "detail-cooldown",
] as const;

test.each(scenarios)(
  "discovery refresh handles previously fetched details: %s",
  async (scenario) => {
    const root = await mkdtemp(join(tmpdir(), "github-detail-refresh-"));
    const oldPath = process.env.PATH;
    try {
      execFileSync("git", ["init", "--quiet", root]);
      execFileSync("git", ["remote", "add", "origin", "https://github.com/github/gh-aw.git"], {
        cwd: root,
      });
      await mkdir(join(root, "docs/agents"), { recursive: true });
      await writeFile(join(root, "docs/agents/issue-tracker.md"), "# Issue tracker: GitHub\n");
      await mkdir(join(root, "web"));
      await writeFile(join(root, "web/index.html"), "<!doctype html>");
      const fixture = async (name: string) =>
        JSON.parse(
          await readFile(
            new URL(`../test/fixtures/github-tickets/${name}.json`, import.meta.url),
            "utf8",
          ),
        );
      const parent = await fixture("gh-aw-1433-issue");
      const children = await fixture("gh-aw-1433-sub_issues");
      const comments = await fixture("gh-aw-1433-comments");
      const viewComments = await fixture("gh-aw-1472-view-comments");
      const childComments = viewComments.map(
        (comment: { id: string; body: string }, index: number) => ({
          id: index + 1,
          node_id: comment.id,
          body: comment.body,
        }),
      );
      const connection = (
        nodes: unknown[],
      ): { nodes: unknown[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } => ({
        nodes,
        pageInfo: { hasNextPage: false, endCursor: null },
      });
      const issue = {
        id: parent.node_id,
        number: 1433,
        title: "Parent",
        url: parent.html_url,
        parent: null,
        labels: connection([]),
        subIssues: {
          ...connection([{ repository: { id: "R_test" }, subIssues: { totalCount: 0 } }]),
          totalCount: 4,
        },
      };
      const secondParent = {
        ...parent,
        node_id: "I_second",
        number: 1533,
        html_url: "https://github.com/github/gh-aw/issues/1533",
        sub_issues_summary: { total: 1 },
        comments: 0,
      };
      const secondChild = {
        ...children[0],
        node_id: "I_second_child",
        number: 1572,
        html_url: "https://github.com/github/gh-aw/issues/1572",
      };
      const secondIssue = {
        ...issue,
        id: secondParent.node_id,
        number: 1533,
        url: secondParent.html_url,
        subIssues: { ...issue.subIssues, totalCount: 1 },
      };
      const page = (nodes: unknown[], repository = "github/gh-aw") => ({
        data: {
          repository: { id: "R_test", nameWithOwner: repository, issues: connection(nodes) },
          rateLimit: { cost: 1, remaining: 4999, resetAt: "2026-10-28T00:00:00Z" },
        },
      });
      const repo = {
        node_id: "R_test",
        full_name: "github/gh-aw",
        html_url: "https://github.com/github/gh-aw",
      };
      const gh = await fakeGh(join(root, "bin"));
      process.env.PATH = gh.path;
      const detailReplies = Object.fromEntries(
        children.flatMap((child: { number: number }) => [
          [
            `api repos/github/gh-aw/issues/${child.number}/labels?per_page=100&page=1`,
            { stdout: [] },
          ],
          [
            `api repos/github/gh-aw/issues/${child.number}/comments?per_page=100&page=1`,
            { stdout: child.number === 1472 ? childComments : [] },
          ],
          [
            `api repos/github/gh-aw/issues/${child.number}/dependencies/blocked_by?per_page=100&page=1`,
            { stdout: [] },
          ],
        ]),
      );
      const firstPages = Array.from({ length: 5 }, (_, index) => {
        const response = page(index === 0 ? [issue] : []);
        response.data.repository.issues.pageInfo = {
          hasNextPage: true,
          endCursor: `cursor-${index}`,
        };
        return { stdout: response };
      });
      const replies = {
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "config get": { stdout: "101" },
        "api repos/github/gh-aw": { stdout: repo },
        "api graphql":
          scenario === "load-more"
            ? firstPages
            : { stdout: page(scenario === "isolated-details" ? [issue, secondIssue] : [issue]) },
        "api repos/github/gh-aw/issues/1433": { stdout: parent },
        "api repos/github/gh-aw/issues/1433/sub_issues?per_page=100&page=1": { stdout: children },
        "api repos/github/gh-aw/issues/1433/comments?per_page=100&page=1": { stdout: comments },
        "api repos/github/gh-aw/issues/1533": { stdout: secondParent },
        "api repos/github/gh-aw/issues/1533/sub_issues?per_page=100&page=1": {
          stdout: [secondChild],
        },
        "api repos/github/gh-aw/issues/1533/comments?per_page=100&page=1": { stdout: [] },
        "api repos/github/gh-aw/issues/1572/labels?per_page=100&page=1": { stdout: [] },
        "api repos/github/gh-aw/issues/1572/comments?per_page=100&page=1": {
          stdout: childComments,
        },
        "api repos/github/gh-aw/issues/1572/dependencies/blocked_by?per_page=100&page=1": {
          stdout: [],
        },
        ...detailReplies,
      };
      await gh.script(replies);
      const { createProjectServer } = await import("./index.js");
      const server = createProjectServer(root, join(root, "web"), {
        githubViewerIntervalMs: scenario === "cooldown" ? 100 : undefined,
      });
      try {
        live.messages.length = 0;
        const initial = await (
          await server.app.request("/api/github/items/1433/refresh", { method: "POST" })
        ).json();
        const broadcast = live.messages
          .map((message) => JSON.parse(message))
          .find((message) => message.workItems[0]?.tickets.length === 4);
        expect(
          broadcast?.workItems[0].tickets.map((ticket: { number: number; status: string }) => [
            ticket.number,
            ticket.status,
          ]),
        ).toEqual([
          [1472, "cancelled"],
          [1473, "cancelled"],
          [1474, "cancelled"],
          [1475, "cancelled"],
        ]);
        expect(broadcast?.workItems[0]).toEqual(initial.workItems[0]);
        expect(initial.workItems[0].spec.text).toBe("Recorded body");
        if (scenario === "cooldown") {
          await server.start();
          live.messages.length = 0;
          await gh.script({
            ...replies,
            "api repos/github/gh-aw": {
              code: 1,
              effect:
                "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500); process.stderr.write('secondary rate limit (HTTP 403)\\nRetry-After: 60\\n')",
            },
          });
          await server.app.request("/api/github/discovery/refresh", { method: "POST" });
          const discoveryCalls = await gh.calls();
          const repositoryCall =
            discoveryCalls.length -
            1 -
            [...discoveryCalls]
              .reverse()
              .findIndex(({ args }) => args[0] === "api" && args[1] === "repos/github/gh-aw");
          expect(
            discoveryCalls
              .slice(repositoryCall + 1)
              .some(({ args }) => args[0] === "api" && args[1] === "user"),
          ).toBe(false);
          await expect
            .poll(() =>
              live.messages.some((message) => {
                const snapshot = JSON.parse(message);
                return (
                  snapshot.github?.errorCode === "rate-limited" &&
                  snapshot.github.stale &&
                  snapshot.workItems.length === 1
                );
              }),
            )
            .toBe(true);
          const before = (await gh.calls()).length;
          const response = await server.app.request("/api/github/items/1433/refresh", {
            method: "POST",
          });
          expect(response.status).toBe(429);
          expect(await response.json()).toMatchObject({
            reason: expect.stringContaining("GitHub rate limit reached"),
            github: { errorCode: "rate-limited" },
          });
          expect(await gh.calls()).toHaveLength(before);
          await new Promise((resolve) => setTimeout(resolve, 350));
          expect(
            (await gh.calls()).filter(({ args }) => args[0] === "api" && args[1] === "user"),
          ).toHaveLength(
            discoveryCalls.filter(({ args }) => args[0] === "api" && args[1] === "user").length,
          );
          return;
        }
        if (scenario === "detail-cooldown") {
          await gh.script({
            ...replies,
            "api repos/github/gh-aw/issues/1433": {
              code: 1,
              effect:
                "process.stderr.write('secondary rate limit (HTTP 403)\\nRetry-After: 60\\n')",
            },
          });
          const failed = await server.app.request("/api/github/items/1433/refresh", {
            method: "POST",
          });
          expect(failed.status).toBe(503);
          const failure = await failed.json();
          expect(failure.github).toMatchObject({
            errorCode: "rate-limited",
            retryAt: expect.any(String),
          });
          const before = (await gh.calls()).length;
          const blocked = await server.app.request("/api/github/items/1433/refresh", {
            method: "POST",
          });
          expect(blocked.status).toBe(429);
          expect(await blocked.json()).toMatchObject({
            reason: expect.stringContaining("GitHub rate limit reached"),
          });
          expect(await gh.calls()).toHaveLength(before);
          await gh.script(replies);
          const clock = vi
            .spyOn(Date, "now")
            .mockReturnValue(Date.parse(failure.github.retryAt) + 1);
          try {
            const recovered = await server.app.request("/api/github/items/1433/refresh", {
              method: "POST",
            });
            expect(recovered.status).toBe(200);
            expect(
              (await gh.calls())
                .slice(before)
                .some(({ args }) => args[1] === "repos/github/gh-aw/issues/1433"),
            ).toBe(true);
          } finally {
            clock.mockRestore();
          }
          return;
        }
        const fetchedAt = initial.github.items[0].detail.fetchedAt;
        if (scenario === "isolated-details") {
          type Snapshot = {
            github: {
              stale: boolean;
              discoveryFailed: boolean;
              complete: boolean;
              errorCode?: string;
            };
            workItems: {
              github: { number: number };
              tickets: { status: string; blocked: boolean }[];
            }[];
          };
          const post = async (path: string): Promise<Snapshot> =>
            (await server.app.request(path, { method: "POST" })).json();
          const byNumber = (snapshot: Snapshot, number: number) => {
            const item = snapshot.workItems.find((entry) => entry.github.number === number);
            if (!item) throw new Error(`Missing work item #${number}`);
            return item;
          };
          const expectKnown = (snapshot: Snapshot, number: number) => {
            const tickets = byNumber(snapshot, number).tickets;
            expect(tickets.length).toBeGreaterThan(0);
            expect(
              tickets.every((ticket) => ticket.status === "cancelled" && !ticket.blocked),
            ).toBe(true);
          };
          const expectUnknown = (snapshot: Snapshot, number: number) => {
            const tickets = byNumber(snapshot, number).tickets;
            expect(tickets.length).toBeGreaterThan(0);
            expect(tickets.every((ticket) => ticket.status === "unknown" && ticket.blocked)).toBe(
              true,
            );
          };
          await post("/api/github/items/1533/refresh");
          await post("/api/github/discovery/refresh");
          const oneRefreshed = await post("/api/github/items/1433/refresh");
          expect(oneRefreshed.github.stale).toBe(true);
          expectKnown(oneRefreshed, 1433);
          expectUnknown(oneRefreshed, 1533);
          await post("/api/github/items/1533/refresh");
          await gh.script({
            ...replies,
            "api repos/github/gh-aw/issues/1533": {
              effect: "process.stderr.write('network is unreachable')",
              code: 1,
            },
          });
          const detailFailed = await post("/api/github/items/1533/refresh");
          expect(detailFailed.github.discoveryFailed).toBe(false);
          expectKnown(detailFailed, 1433);
          expectUnknown(detailFailed, 1533);
          await gh.script(replies);
          await post("/api/github/items/1533/refresh");
          await gh.script({
            ...replies,
            "api repos/github/gh-aw": { effect: "process.stderr.write('HTTP 500')", code: 1 },
          });
          const discoveryFailed = await post("/api/github/discovery/refresh");
          expect(discoveryFailed.github).toMatchObject({
            stale: true,
            discoveryFailed: true,
            complete: false,
            errorCode: "server-error",
          });
          expectKnown(discoveryFailed, 1433);
          expectKnown(discoveryFailed, 1533);
          await gh.script(replies);
          const retryWithDiscoveryFailure = await post("/api/github/items/1433/refresh");
          expect(retryWithDiscoveryFailure.github).toMatchObject({
            stale: true,
            discoveryFailed: true,
            complete: false,
            errorCode: "server-error",
          });
          expectKnown(retryWithDiscoveryFailure, 1433);
          return;
        }
        if (scenario === "detail-first" || scenario === "discovery-first") {
          const detailFailure = async () => {
            await gh.script({
              ...replies,
              "api repos/github/gh-aw/issues/1433": {
                effect: "process.stderr.write('network is unreachable')",
                code: 1,
              },
            });
            return (
              await server.app.request("/api/github/items/1433/refresh", { method: "POST" })
            ).json();
          };
          const discoveryFailure = async () => {
            await gh.script({
              ...replies,
              "api repos/github/gh-aw": { effect: "process.stderr.write('HTTP 500')", code: 1 },
            });
            return (
              await server.app.request("/api/github/discovery/refresh", { method: "POST" })
            ).json();
          };
          if (scenario === "detail-first") {
            await detailFailure();
            await discoveryFailure();
          } else {
            await discoveryFailure();
            await detailFailure();
          }
          await gh.script(replies);
          const detailRecovered = await (
            await server.app.request("/api/github/items/1433/refresh", { method: "POST" })
          ).json();
          expect(detailRecovered.github.stale).toBe(true);
          expect(detailRecovered.github.errorCode).toBe("server-error");
          expect(detailRecovered.github.items[0].detail.stale).not.toBe(true);
          const discoveryRecovered = await (
            await server.app.request("/api/github/discovery/refresh", { method: "POST" })
          ).json();
          expect(discoveryRecovered.github.stale).toBe(true);
          expect(discoveryRecovered.github.items[0].detail.stale).toBe(true);
          const fullyRecovered = await (
            await server.app.request("/api/github/items/1433/refresh", { method: "POST" })
          ).json();
          expect(fullyRecovered.github.stale).toBe(false);
          expect(fullyRecovered.github.error).toBeUndefined();
          return;
        }
        if (scenario === "origin")
          execFileSync(
            "git",
            ["remote", "set-url", "origin", "https://github.com/other/repo.git"],
            {
              cwd: root,
            },
          );
        const newRepo =
          scenario === "origin"
            ? {
                node_id: "R_other",
                full_name: "other/repo",
                html_url: "https://github.com/other/repo",
              }
            : repo;
        const nodes =
          scenario === "removed" || scenario === "origin" || scenario === "load-more"
            ? []
            : [{ ...issue, id: scenario === "identity" ? "I_changed" : issue.id }];
        const refreshPage = page(nodes, newRepo.full_name);
        const morePages = Array.from({ length: 5 }, (_, index) => {
          const response = page([]);
          response.data.repository.issues.pageInfo = {
            hasNextPage: true,
            endCursor: `next-${index}`,
          };
          return { stdout: response };
        });
        await gh.script({
          "auth status": {},
          "api user": {
            stdout: scenario === "viewer" ? { id: 202, login: "202" } : { id: 101, login: "101" },
          },
          [`api repos/${newRepo.full_name}`]: { stdout: newRepo },
          "api graphql": scenario === "load-more" ? morePages : { stdout: refreshPage },
        });
        const refreshed = await (
          await server.app.request(
            `/api/github/discovery/${scenario === "load-more" ? "load-more" : "refresh"}`,
            { method: "POST" },
          )
        ).json();
        if (scenario === "same" || scenario === "load-more") {
          expect(refreshed.github.stale).toBe(true);
          expect(refreshed.github.items[0].detail).toMatchObject({
            spec: "Recorded body",
            fetchedAt,
            stale: true,
          });
          expect(refreshed.workItems[0].github).toMatchObject({ complete: false, stale: true });
          expect(
            refreshed.workItems[0].tickets.every(
              (ticket: { status: string; blocked: boolean; resolved: boolean }) =>
                ticket.status === "unknown" && ticket.blocked && !ticket.resolved,
            ),
          ).toBe(true);
          if (scenario === "load-more") {
            await gh.script({
              "auth status": {},
              "api user": { stdout: { id: 101, login: "101" } },
              "api repos/github/gh-aw": { stdout: repo },
              "api graphql": { stdout: page([]) },
            });
            const last = await (
              await server.app.request("/api/github/discovery/load-more", { method: "POST" })
            ).json();
            expect(last.github).toMatchObject({ complete: true, stale: true });
            expect(last.github.items[0].detail.stale).toBe(true);
          }
          await gh.script(replies);
          const reloaded = await (
            await server.app.request("/api/github/items/1433/refresh", { method: "POST" })
          ).json();
          expect(reloaded.github.items[0].detail.stale).not.toBe(true);
          expect(
            reloaded.workItems[0].tickets.map((ticket: { status: string }) => ticket.status),
          ).toEqual(["cancelled", "cancelled", "cancelled", "cancelled"]);
        } else {
          expect(refreshed.github.items.every((item: { detail?: unknown }) => !item.detail)).toBe(
            true,
          );
          expect(
            refreshed.workItems.every(
              (item: { spec: unknown; tickets: unknown[] }) =>
                item.spec === null && item.tickets.length === 0,
            ),
          ).toBe(true);
        }
      } finally {
        await server.stop();
      }
    } finally {
      process.env.PATH = oldPath;
      await rm(root, { recursive: true, force: true });
    }
  },
);
