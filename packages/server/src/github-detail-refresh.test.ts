// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fakeGh } from "../test/fake-gh.js";

const scenarios = [
  "same",
  "load-more",
  "removed",
  "identity",
  "viewer",
  "origin",
  "detail-first",
  "discovery-first",
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
        "api user": { stdout: "101" },
        "api repos/github/gh-aw": { stdout: repo },
        "api graphql": scenario === "load-more" ? firstPages : { stdout: page([issue]) },
        "api repos/github/gh-aw/issues/1433": { stdout: parent },
        "api repos/github/gh-aw/issues/1433/sub_issues?per_page=100&page=1": { stdout: children },
        "api repos/github/gh-aw/issues/1433/comments?per_page=100&page=1": { stdout: comments },
        ...detailReplies,
      };
      await gh.script(replies);
      const { createProjectServer } = await import("./index.js");
      const server = createProjectServer(root, join(root, "web"));
      try {
        const initial = await (
          await server.app.request("/api/github/items/1433/refresh", { method: "POST" })
        ).json();
        expect(initial.workItems[0].spec.text).toBe("Recorded body");
        const fetchedAt = initial.github.items[0].detail.fetchedAt;
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
          "api user": { stdout: scenario === "viewer" ? "202" : "101" },
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
              "api user": { stdout: "101" },
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
