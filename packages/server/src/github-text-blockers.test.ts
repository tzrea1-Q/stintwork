// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fakeGh } from "../test/fake-gh.js";

test.each([
  [
    "cross-repository issue URL",
    "## Blocked by\n- #5060 — https://github.com/other/repo/issues/34",
    true,
  ],
  [
    "same-repository issue URL",
    "## Blocked by\n- #5060 — https://github.com/github/spec-kit/issues/34",
    true,
  ],
  ["pull URL", "## Blocked by\n- #5060 — github.com/other/repo/pull/34", true],
  ["qualified issue", "## Blocked by\n- #5060 — other/repo#34", true],
  ["second issue", "## Blocked by\n- #5060 — see #34", true],
  ["plain description", "## Blocked by\n- #5060 — prerequisite", false],
  ["plain repository link", "## Blocked by\n- #5060 — https://github.com/github/spec-kit", false],
  ["other website", "## Blocked by\n- #5060 — https://notgithub.com/other/repo/issues/34", false],
  [
    "other website path",
    "## Blocked by\n- #5060 — https://example.com/github.com/other/repo/issues/34",
    false,
  ],
  ["single-line URL", "Blocked by: #5060 — https://github.com/other/repo/issues/34", true],
] as const)("text blocker handles %s", async (_label, body, ambiguous) => {
  const root = await mkdtemp(join(tmpdir(), "github-text-blockers-"));
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
    const child = await fixture("spec-kit-5071-issue");
    child.body = body;
    child.issue_dependencies_summary.total_blocked_by = 0;
    const blocker = (await fixture("spec-kit-5071-blocked_by"))[0];
    blocker.state = "closed";
    blocker.state_reason = "not_planned";
    const parent = {
      ...child,
      node_id: "I_parent",
      number: 5000,
      body: "Parent",
      html_url: "https://github.com/github/spec-kit/issues/5000",
      sub_issues_summary: { total: 1 },
    };
    const connection = (nodes: unknown[]) => ({
      nodes,
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    const gh = await fakeGh(join(root, "bin"));
    process.env.PATH = gh.path;
    await gh.script({
      "auth status": {},
      "api user": { stdout: "101" },
      "api repos/github/spec-kit": {
        stdout: {
          node_id: "R_test",
          full_name: "github/spec-kit",
          html_url: "https://github.com/github/spec-kit",
        },
      },
      "api graphql": {
        stdout: {
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
                    totalCount: 1,
                  },
                },
              ]),
            },
            rateLimit: { cost: 1, remaining: 4999, resetAt: "2026-10-29T00:00:00Z" },
          },
        },
      },
      "api repos/github/spec-kit/issues/5000": { stdout: parent },
      "api repos/github/spec-kit/issues/5000/sub_issues?per_page=100&page=1": { stdout: [child] },
      "api repos/github/spec-kit/issues/5000/comments?per_page=100&page=1": { stdout: [] },
      "api repos/github/spec-kit/issues/5071/labels?per_page=100&page=1": { stdout: [] },
      "api repos/github/spec-kit/issues/5071/comments?per_page=100&page=1": { stdout: [] },
      "api repos/github/spec-kit/issues/5071/dependencies/blocked_by?per_page=100&page=1": {
        stdout: [],
      },
      "api repos/github/spec-kit/issues/5060": { stdout: blocker },
    });
    const { createProjectServer } = await import("./index.js");
    const server = createProjectServer(root, join(root, "web"));
    try {
      const response = await server.app.request("/api/github/items/5000/refresh", {
        method: "POST",
      });
      expect(response.status).toBe(200);
      const snapshot = await response.json();
      const ticket = snapshot.workItems[0].tickets[0];
      expect(ticket.blocked).toBe(ambiguous);
      expect(snapshot.github.items[0].complete).toBe(!ambiguous);
      expect(
        snapshot.workItems[0].outputWarnings.some((warning: { message: string }) =>
          /text blockers unknown/i.test(warning.message),
        ),
      ).toBe(ambiguous);
      if (!ambiguous) expect(ticket.blockedBy).toEqual([5060]);
    } finally {
      await server.stop();
    }
  } finally {
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});
