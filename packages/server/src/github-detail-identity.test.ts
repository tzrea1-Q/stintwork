// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fakeGh, type GhReply } from "../test/fake-gh.js";

test.each(["parent", "child", "blocker", "network"] as const)(
  "detail refresh handles %s failure without retaining ambiguous content",
  async (scenario) => {
    const root = await mkdtemp(join(tmpdir(), "github-detail-identity-"));
    const oldPath = process.env.PATH;
    try {
      execFileSync("git", ["init", "--quiet", root]);
      execFileSync("git", ["remote", "add", "origin", "https://github.com/github/spec-kit.git"], {
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
      const children = await Promise.all([
        fixture("spec-kit-5071-issue"),
        fixture("spec-kit-5073-issue"),
      ]);
      const blockers = await Promise.all([
        fixture("spec-kit-5071-blocked_by"),
        fixture("spec-kit-5073-blocked_by"),
      ]);
      const parent = {
        ...children[0],
        node_id: "I_parent",
        number: 5000,
        html_url: "https://github.com/github/spec-kit/issues/5000",
        sub_issues_summary: { total: 2 },
      };
      const connection = (nodes: unknown[]) => ({
        nodes,
        pageInfo: { hasNextPage: false, endCursor: null },
      });
      const page = {
        data: {
          repository: {
            id: "R_test",
            nameWithOwner: "github/spec-kit",
            issues: connection([
              {
                id: parent.node_id,
                number: 5000,
                title: "Parent",
                url: parent.html_url,
                parent: null,
                labels: connection([]),
                subIssues: {
                  ...connection([{ repository: { id: "R_test" }, subIssues: { totalCount: 0 } }]),
                  totalCount: 2,
                },
              },
            ]),
          },
          rateLimit: { cost: 1, remaining: 4999, resetAt: "2026-10-28T00:00:00Z" },
        },
      };
      const repo = {
        node_id: "R_test",
        full_name: "github/spec-kit",
        html_url: "https://github.com/github/spec-kit",
      };
      const gh = await fakeGh(join(root, "bin"));
      process.env.PATH = gh.path;
      const replies = () => ({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/spec-kit": { stdout: repo },
        "api graphql": { stdout: page },
        "api repos/github/spec-kit/issues/5000": { stdout: parent },
        "api repos/github/spec-kit/issues/5000/sub_issues?per_page=100&page=1": {
          stdout: children,
        },
        "api repos/github/spec-kit/issues/5000/comments?per_page=100&page=1": { stdout: [] },
        ...Object.fromEntries(
          children.flatMap((child: { number: number }, index: number) => [
            [
              `api repos/github/spec-kit/issues/${child.number}/labels?per_page=100&page=1`,
              { stdout: [] },
            ],
            [
              `api repos/github/spec-kit/issues/${child.number}/comments?per_page=100&page=1`,
              { stdout: [] },
            ],
            [
              `api repos/github/spec-kit/issues/${child.number}/dependencies/blocked_by?per_page=100&page=1`,
              { stdout: blockers[index] },
            ],
          ]),
        ),
      });
      await gh.script(replies());
      const { createProjectServer } = await import("./index.js");
      const server = createProjectServer(root, join(root, "web"));
      try {
        const initial = await (
          await server.app.request("/api/github/items/5000/refresh", { method: "POST" })
        ).json();
        expect(initial.workItems[0].spec.text).toBe("Recorded body");
        expect(initial.workItems[0].tickets).toHaveLength(2);
        if (scenario === "parent") parent.node_id = "I_changed_parent";
        if (scenario === "child") children[0].node_id = "I_changed_child";
        if (scenario === "blocker") blockers[0][0].node_id = "I_changed_blocker";
        const next: Record<string, GhReply | GhReply[]> = replies();
        if (scenario === "network")
          next["api repos/github/spec-kit/issues/5000"] = {
            code: 1,
            effect: "process.stderr.write('network unreachable')",
          };
        await gh.script(next);
        const response = await server.app.request("/api/github/items/5000/refresh", {
          method: "POST",
        });
        expect(response.status).toBe(503);
        const failed = await response.json();
        expect(failed.github).toMatchObject({
          stale: true,
          errorCode: scenario === "network" ? "offline" : "identity",
        });
        if (scenario === "network") {
          expect(failed.github.items[0].detail.spec).toBe("Recorded body");
          expect(failed.workItems[0].spec.text).toBe("Recorded body");
          expect(failed.workItems[0].tickets).toHaveLength(2);
          expect(
            failed.workItems[0].tickets.every(
              (ticket: { blocked: boolean; status: string }) =>
                ticket.blocked && ticket.status === "unknown",
            ),
          ).toBe(true);
        } else {
          expect(failed.github.items[0].detail).toBeUndefined();
          expect(failed.workItems[0]).toMatchObject({
            spec: null,
            tickets: [],
            outputWarnings: [],
          });
          await gh.script({
            "auth status": {},
            "api user": { stdout: { id: 101, login: "101" } },
            "api repos/github/spec-kit": {
              code: 1,
              effect: "process.stderr.write('network unreachable')",
            },
          });
          const fallback = await (
            await server.app.request("/api/github/discovery/refresh", { method: "POST" })
          ).json();
          expect(fallback.github.items[0].detail).toBeUndefined();
          expect(fallback.workItems[0]).toMatchObject({ spec: null, tickets: [] });
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
