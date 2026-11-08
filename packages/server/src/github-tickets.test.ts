// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fakeGh } from "../test/fake-gh.js";

test("refreshes a recorded parent and its direct tickets through read-only gh", async () => {
  const root = await mkdtemp(join(tmpdir(), "github-tickets-"));
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
    const gh = await fakeGh(join(root, "bin"));
    process.env.PATH = gh.path;
    const connection = (nodes: unknown[]) => ({
      nodes,
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    const repoId = "R_test";
    const eventsPath = join(root, "concurrency.jsonl");
    const delay = (number: number) =>
      `fs.appendFileSync(${JSON.stringify(eventsPath)}, JSON.stringify({ event: "start", pid: process.pid, child: ${number} }) + "\\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${number === 1472 ? 350 : 200}); fs.appendFileSync(${JSON.stringify(eventsPath)}, JSON.stringify({ event: "end", pid: process.pid, child: ${number} }) + "\\n");`;
    const replies = {
      "auth status": {},
      "api user": { stdout: { id: 101, login: "101" } },
      "api repos/github/gh-aw": {
        stdout: {
          node_id: "R_test",
          full_name: "github/gh-aw",
          html_url: "https://github.com/github/gh-aw",
        },
      },
      "api graphql": {
        stdout: {
          data: {
            repository: {
              id: repoId,
              nameWithOwner: "github/gh-aw",
              issues: connection([
                {
                  id: parent.node_id,
                  number: 1433,
                  title: "Recorded issue",
                  url: parent.html_url,
                  parent: null,
                  labels: connection([]),
                  subIssues: {
                    ...connection([{ repository: { id: repoId }, subIssues: { totalCount: 0 } }]),
                    totalCount: 4,
                  },
                },
              ]),
            },
            rateLimit: { cost: 1, remaining: 4999, resetAt: "2026-10-28T00:00:00Z" },
          },
        },
      },
      "api repos/github/gh-aw/issues/1433": { stdout: parent },
      "api repos/github/gh-aw/issues/1433/sub_issues?per_page=100&page=1": { stdout: children },
      "api repos/github/gh-aw/issues/1433/comments?per_page=100&page=1": { stdout: comments },
      ...Object.fromEntries(
        children.flatMap((child: { number: number }) => [
          [
            `api repos/github/gh-aw/issues/${child.number}/dependencies/blocked_by?per_page=100&page=1`,
            { stdout: [], effect: delay(child.number) },
          ],
          [
            `api repos/github/gh-aw/issues/${child.number}/comments?per_page=100&page=1`,
            { stdout: child.number === 1472 ? childComments : [], effect: delay(child.number) },
          ],
          [
            `api repos/github/gh-aw/issues/${child.number}/labels?per_page=100&page=1`,
            { stdout: [], effect: delay(child.number) },
          ],
        ]),
      ),
    };
    await gh.script(replies);
    const { createProjectServer } = await import("./index.js");
    const server = createProjectServer(root, join(root, "web"));
    try {
      await server.app.request("/api/project");
      const callsBefore = (await gh.calls()).length;
      const response = await server.app.request("/api/github/items/1433/refresh", {
        method: "POST",
      });
      expect(response.status).toBe(200);
      const snapshot = await response.json();
      const calls = (await gh.calls()).slice(callsBefore);
      expect(calls.filter(({ args }) => args[0] === "api" && args[1] === "user")).toHaveLength(0);
      expect(
        calls.filter(({ args }) => args[0] === "api" && args[1] === "repos/github/gh-aw"),
      ).toHaveLength(1);
      const events = (await readFile(eventsPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(events).toHaveLength(children.length * 3 * 2);
      let active = 0;
      let peak = 0;
      let firstChildActive = 0;
      let firstChildPeak = 0;
      for (const event of events) {
        const change = event.event === "start" ? 1 : -1;
        active += change;
        peak = Math.max(peak, active);
        if (event.child === 1472) {
          firstChildActive += change;
          firstChildPeak = Math.max(firstChildPeak, firstChildActive);
        }
      }
      expect(firstChildPeak).toBeGreaterThan(1);
      expect(active).toBe(0);
      expect(peak).toBeGreaterThan(1);
      expect(peak).toBeLessThanOrEqual(4);
      expect(
        snapshot.github.items[0].detail.tickets.map(
          (ticket: { number: number; id: string; state: string; stateReason: string | null }) => [
            ticket.number,
            ticket.id,
            ticket.state,
            ticket.stateReason,
          ],
        ),
      ).toEqual(
        children.map(
          (child: {
            number: number;
            node_id: string;
            state: string;
            state_reason: string | null;
          }) => [child.number, child.node_id, child.state, child.state_reason],
        ),
      );
      expect(snapshot.workItems[0].spec.text).toBe("Recorded body");
      expect(Date.parse(snapshot.github.items[0].detail.fetchedAt)).toBeGreaterThan(0);
      expect(
        snapshot.workItems[0].tickets.map((ticket: { number: number; status: string }) => [
          ticket.number,
          ticket.status,
        ]),
      ).toEqual([
        [1472, "cancelled"],
        [1473, "cancelled"],
        [1474, "cancelled"],
        [1475, "cancelled"],
      ]);
      await gh.script({
        ...replies,
        "api repos/github/gh-aw/issues/1433/sub_issues?per_page=100&page=1": {
          stdout: children.map((child: { number: number }) =>
            child.number === 1472 ? { ...child, body: "Blocked by: unclear" } : child,
          ),
        },
      });
      const incomplete = await server.app.request("/api/github/items/1433/refresh", {
        method: "POST",
      });
      expect(incomplete.status).toBe(200);
      const incompleteSnapshot = await incomplete.json();
      expect(incompleteSnapshot.github.items[0]).toMatchObject({
        detailFailed: false,
        detail: {
          complete: false,
          warnings: expect.arrayContaining(["Issue #1472: text blockers unknown."]),
        },
      });
      expect(incompleteSnapshot.github.items[0].detail.stale).not.toBe(true);
      await writeFile(eventsPath, "");
      const slow = `fs.appendFileSync(${JSON.stringify(eventsPath)}, JSON.stringify({ event: "start", pid: process.pid }) + "\\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800); fs.appendFileSync(${JSON.stringify(eventsPath)}, JSON.stringify({ event: "end", pid: process.pid }) + "\\n");`;
      await gh.script({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/gh-aw": {
          stdout: {
            node_id: "R_test",
            full_name: "github/gh-aw",
            html_url: "https://github.com/github/gh-aw",
          },
        },
        "api repos/github/gh-aw/issues/1433": { stdout: parent },
        "api repos/github/gh-aw/issues/1433/sub_issues?per_page=100&page=1": { stdout: children },
        "api repos/github/gh-aw/issues/1433/comments?per_page=100&page=1": { stdout: comments },
        ...Object.fromEntries(
          children.flatMap((child: { number: number }) => [
            [
              `api repos/github/gh-aw/issues/${child.number}/labels?per_page=100&page=1`,
              child.number === 1472
                ? {
                    code: 1,
                    effect:
                      "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200); process.stderr.write('network unreachable')",
                  }
                : { stdout: [], effect: slow },
            ],
            [
              `api repos/github/gh-aw/issues/${child.number}/comments?per_page=100&page=1`,
              { stdout: child.number === 1472 ? childComments : [], effect: slow },
            ],
            [
              `api repos/github/gh-aw/issues/${child.number}/dependencies/blocked_by?per_page=100&page=1`,
              { stdout: [], effect: slow },
            ],
          ]),
        ),
      });
      const failedChild = await server.app.request("/api/github/items/1433/refresh", {
        method: "POST",
      });
      expect(failedChild.status).toBe(503);
      const failedSnapshot = await (await server.app.request("/api/project")).json();
      expect(failedSnapshot.github.items[0]).toMatchObject({
        detailFailed: true,
        detail: { stale: true },
      });
      const childEvents = (await readFile(eventsPath, "utf8"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      expect(childEvents.filter((event) => event.event === "start").length).toBeGreaterThan(0);
      expect(childEvents.filter((event) => event.event === "start").length).toBe(
        childEvents.filter((event) => event.event === "end").length,
      );
      children[3].state = "open";
      expect(snapshot.workItems[0].tickets[0].comments).toEqual([
        "Recorded comment",
        "Recorded comment",
      ]);
      await gh.script({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/gh-aw": {
          stdout: {
            node_id: "R_test",
            full_name: "github/gh-aw",
            html_url: "https://github.com/github/gh-aw",
          },
        },
        "api repos/github/gh-aw/issues/1433": { stdout: parent },
        "api repos/github/gh-aw/issues/1433/sub_issues?per_page=100&page=1": { stdout: children },
        "api repos/github/gh-aw/issues/1433/comments?per_page=100&page=1": { stdout: [] },
        ...Object.fromEntries(
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
        ),
      });
      const partialComments = await server.app.request("/api/github/items/1433/refresh", {
        method: "POST",
      });
      expect(partialComments.status).toBe(503);
      expect((await partialComments.json()).github.error).toContain("comments");
      const pageOne = `HTTP/2 200 OK\r\nLink: <https://api.github.com/next>; rel="next"\r\n\r\n${JSON.stringify(children.slice(0, 2))}`;
      const changedChild = children.map((child: { number: number }) =>
        child.number === 1472 ? { ...child, node_id: "I_changed" } : child,
      );
      await gh.script({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/gh-aw": {
          stdout: {
            node_id: "R_test",
            full_name: "github/gh-aw",
            html_url: "https://github.com/github/gh-aw",
          },
        },
        "api repos/github/gh-aw/issues/1433": { stdout: parent },
        "api repos/github/gh-aw/issues/1433/sub_issues?per_page=100&page=1": {
          stdout: changedChild,
        },
        "api repos/github/gh-aw/issues/1433/comments?per_page=100&page=1": { stdout: comments },
        ...Object.fromEntries(
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
        ),
      });
      const changedIdentity = await server.app.request("/api/github/items/1433/refresh", {
        method: "POST",
      });
      expect(changedIdentity.status).toBe(503);
      expect((await changedIdentity.json()).github.errorCode).toBe("identity");
      parent.sub_issues_summary.total = 2;
      await gh.script({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/gh-aw": {
          stdout: {
            node_id: "R_test",
            full_name: "github/gh-aw",
            html_url: "https://github.com/github/gh-aw",
          },
        },
        "api repos/github/gh-aw/issues/1433": { stdout: parent },
        "api repos/github/gh-aw/issues/1433/sub_issues?per_page=100&page=1": {
          stdout: [children[0], children[0]],
        },
        "api repos/github/gh-aw/issues/1433/comments?per_page=100&page=1": { stdout: comments },
        "api repos/github/gh-aw/issues/1472/labels?per_page=100&page=1": { stdout: [] },
        "api repos/github/gh-aw/issues/1472/comments?per_page=100&page=1": {
          stdout: childComments,
        },
        "api repos/github/gh-aw/issues/1472/dependencies/blocked_by?per_page=100&page=1": {
          stdout: [],
        },
      });
      expect(
        (await server.app.request("/api/github/items/1433/refresh", { method: "POST" })).status,
      ).toBe(503);
      parent.sub_issues_summary.total = 4;
      await gh.script({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/gh-aw": {
          stdout: {
            node_id: "R_test",
            full_name: "github/gh-aw",
            html_url: "https://github.com/github/gh-aw",
          },
        },
        "api repos/github/gh-aw/issues/1433": { stdout: parent },
        "api repos/github/gh-aw/issues/1433/sub_issues?per_page=100&page=1": { stdout: pageOne },
        "api repos/github/gh-aw/issues/1433/sub_issues?per_page=100&page=2": {
          stdout: children.slice(2),
        },
        "api repos/github/gh-aw/issues/1433/comments?per_page=100&page=1": { stdout: comments },
        ...Object.fromEntries(
          children.flatMap((child: { number: number }) => [
            [
              `api repos/github/gh-aw/issues/${child.number}/dependencies/blocked_by?per_page=100&page=1`,
              { stdout: [] },
            ],
            [
              `api repos/github/gh-aw/issues/${child.number}/comments?per_page=100&page=1`,
              { stdout: child.number === 1472 ? childComments : [] },
            ],
            [
              `api repos/github/gh-aw/issues/${child.number}/labels?per_page=100&page=1`,
              {
                stdout:
                  child.number === 1474
                    ? [{ name: "ready-for-agent" }, { name: "Stintwork:Work-Item" }]
                    : [],
              },
            ],
          ]),
        ),
      });
      const paged = await (
        await server.app.request("/api/github/items/1433/refresh", { method: "POST" })
      ).json();
      expect(paged.workItems[0].tickets.map((t: { number: number }) => t.number)).toEqual([
        1472, 1473, 1474, 1475,
      ]);
      expect(
        paged.workItems[0].tickets.find((t: { number: number }) => t.number === 1474).status,
      ).toBe("ready-for-agent");
      expect(
        paged.github.items[0].detail.warnings.some((warning: string) =>
          /labelled child/i.test(warning),
        ),
      ).toBe(true);
      await gh.script({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/gh-aw": {
          stdout: {
            node_id: "R_test",
            full_name: "github/gh-aw",
            html_url: "https://github.com/github/gh-aw",
          },
        },
        "api repos/github/gh-aw/issues/1433": { stdout: parent },
        "api repos/github/gh-aw/issues/1433/sub_issues?per_page=100&page=1": {
          stdout: children.slice(0, 2),
        },
        "api repos/github/gh-aw/issues/1433/comments?per_page=100&page=1": { stdout: comments },
        ...Object.fromEntries(
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
        ),
      });
      expect(
        (await server.app.request("/api/github/items/1433/refresh", { method: "POST" })).status,
      ).toBe(503);
      children[3].state = "closed";
      parent.sub_issues_summary.total = 5;
      children[2].sub_issues_summary.total = 1;
      const cross = {
        ...children[3],
        node_id: "I_cross",
        repository_url: "https://api.github.com/repos/other/repo",
      };
      await gh.script({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/gh-aw": {
          stdout: {
            node_id: "R_test",
            full_name: "github/gh-aw",
            html_url: "https://github.com/github/gh-aw",
          },
        },
        "api repos/github/gh-aw/issues/1433": { stdout: parent },
        "api repos/github/gh-aw/issues/1433/sub_issues?per_page=100&page=1": {
          stdout: [...children, cross],
        },
        "api repos/github/gh-aw/issues/1433/comments?per_page=100&page=1": { stdout: comments },
        ...Object.fromEntries(
          children.flatMap((child: { number: number }) => [
            [
              `api repos/github/gh-aw/issues/${child.number}/dependencies/blocked_by?per_page=100&page=1`,
              { stdout: [] },
            ],
            [
              `api repos/github/gh-aw/issues/${child.number}/comments?per_page=100&page=1`,
              { stdout: child.number === 1472 ? childComments : [] },
            ],
            [
              `api repos/github/gh-aw/issues/${child.number}/labels?per_page=100&page=1`,
              { stdout: [] },
            ],
          ]),
        ),
      });
      const unsupported = await (
        await server.app.request("/api/github/items/1433/refresh", { method: "POST" })
      ).json();
      expect(unsupported.github.items[0].complete).toBe(false);
      expect(unsupported.github.items[0].detail.warnings).toHaveLength(2);
      children[2].sub_issues_summary.total = 0;
      parent.sub_issues_summary.total = 4;
      children[0].issue_dependencies_summary.total_blocked_by = 1;
      children[0].body = "Blocked by: #1473";
      children[1].body = "## Blocked by\n- #1475 — prerequisite";
      children[2].body = "Blocked by: #9999";
      children[3].body = "Blocked by: owner/other#2";
      await gh.script({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/gh-aw": {
          stdout: {
            node_id: "R_test",
            full_name: "github/gh-aw",
            html_url: "https://github.com/github/gh-aw",
          },
        },
        "api repos/github/gh-aw/issues/1433": { stdout: parent },
        "api repos/github/gh-aw/issues/1433/sub_issues?per_page=100&page=1": { stdout: children },
        "api repos/github/gh-aw/issues/1433/comments?per_page=100&page=1": { stdout: comments },
        "api repos/github/gh-aw/issues/9999": {
          code: 1,
          effect: "process.stderr.write('HTTP 404')",
        },
        ...Object.fromEntries(
          children.flatMap((child: { number: number }) => [
            [
              `api repos/github/gh-aw/issues/${child.number}/dependencies/blocked_by?per_page=100&page=1`,
              { stdout: child.number === 1472 ? [children[3]] : [] },
            ],
            [
              `api repos/github/gh-aw/issues/${child.number}/comments?per_page=100&page=1`,
              { stdout: child.number === 1472 ? childComments : [] },
            ],
            [
              `api repos/github/gh-aw/issues/${child.number}/labels?per_page=100&page=1`,
              { stdout: [] },
            ],
            [`api repos/github/gh-aw/issues/${child.number}`, { stdout: child }],
          ]),
        ),
      });
      const refreshed = await (
        await server.app.request("/api/github/items/1433/refresh", { method: "POST" })
      ).json();
      const tickets = refreshed.workItems[0].tickets;
      expect(tickets.find((t: { number: number }) => t.number === 1472)).toMatchObject({
        blockedBy: [1474],
        blocked: false,
      });
      expect(tickets.find((t: { number: number }) => t.number === 1475)).toMatchObject({
        blockedBy: [1475],
        blocked: true,
      });
      expect(tickets.find((t: { number: number }) => t.number === 1473)).toMatchObject({
        blocked: true,
      });
      expect(
        refreshed.github.items[0].detail.warnings.some((warning: string) =>
          /disagree/i.test(warning),
        ),
      ).toBe(true);
      expect(tickets.find((t: { number: number }) => t.number === 1474).blocked).toBe(true);
      expect(
        refreshed.github.items[0].detail.warnings.some((warning: string) =>
          /9999.*unavailable/i.test(warning),
        ),
      ).toBe(true);
      expect(
        refreshed.workItems[0].outputWarnings.some((warning: { message: string }) =>
          /9999.*unavailable/i.test(warning.message),
        ),
      ).toBe(true);
      expect(
        refreshed.workItems[0].outputWarnings.some((warning: { message: string }) =>
          /cycle/i.test(warning.message),
        ),
      ).toBe(true);
      await gh.script({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/gh-aw": {
          stdout: {
            node_id: "R_test",
            full_name: "github/gh-aw",
            html_url: "https://github.com/github/gh-aw",
          },
        },
        "api repos/github/gh-aw/issues/1433": {
          code: 1,
          effect: "process.stderr.write('network unreachable')",
        },
      });
      const failed = await server.app.request("/api/github/items/1433/refresh", { method: "POST" });
      expect(failed.status).toBe(503);
      const stale = await failed.json();
      expect(stale.github.stale).toBe(true);
      expect(
        stale.workItems[0].tickets.every(
          (ticket: { status: string; resolved: boolean }) =>
            ticket.status === "unknown" && !ticket.resolved,
        ),
      ).toBe(true);
      expect(
        stale.workItems[0].tickets.every((ticket: { blocked: boolean }) => ticket.blocked),
      ).toBe(true);
      const capPage = `HTTP/2 200 OK\r\nLink: <https://api.github.com/next>; rel="next"\r\n\r\n${JSON.stringify(Array(100).fill(children[0]))}`;
      await gh.script({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/gh-aw": {
          stdout: {
            node_id: "R_test",
            full_name: "github/gh-aw",
            html_url: "https://github.com/github/gh-aw",
          },
        },
        "api repos/github/gh-aw/issues/1433": { stdout: parent },
        ...Object.fromEntries(
          Array.from({ length: 10 }, (_, i) => [
            `api repos/github/gh-aw/issues/1433/sub_issues?per_page=100&page=${i + 1}`,
            { stdout: capPage },
          ]),
        ),
      });
      const capped = await server.app.request("/api/github/items/1433/refresh", { method: "POST" });
      expect(capped.status).toBe(503);
      const cappedSnapshot = await capped.json();
      expect(cappedSnapshot.github.errorCode).toBe("cap");
      expect(cappedSnapshot.github.error).toContain("sub_issues page 10");
      const jsonHeaders = { "content-type": "application/json" };
      const start = await server.app.request("/api/stints", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ workItem: "github-1433", ticket: 1472 }),
      });
      expect(start.status).toBe(409);
      const gate = await server.app.request("/api/work-items/github-1433/gates/tickets/approve", {
        method: "POST",
        headers: jsonHeaders,
        body: "{}",
      });
      // Ticket 14 routes GitHub gates through the GitHub-specific endpoint.
      expect(gate.status).toBe(409);
      expect((await gate.json()).reasonCode).toBe("github-gate-route");
      for (const child of children) {
        child.body = "Recorded body";
        child.issue_dependencies_summary.total_blocked_by = 0;
      }
      await gh.script({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/gh-aw": {
          stdout: {
            node_id: "R_test",
            full_name: "github/gh-aw",
            html_url: "https://github.com/github/gh-aw",
          },
        },
        "api repos/github/gh-aw/issues/1433": { stdout: parent },
        "api repos/github/gh-aw/issues/1433/sub_issues?per_page=100&page=1": { stdout: children },
        "api repos/github/gh-aw/issues/1433/comments?per_page=100&page=1": { stdout: comments },
        ...Object.fromEntries(
          children.flatMap((child: { number: number }) => [
            [
              `api repos/github/gh-aw/issues/${child.number}/dependencies/blocked_by?per_page=100&page=1`,
              { stdout: [] },
            ],
            [
              `api repos/github/gh-aw/issues/${child.number}/comments?per_page=100&page=1`,
              { stdout: child.number === 1472 ? childComments : [] },
            ],
            [
              `api repos/github/gh-aw/issues/${child.number}/labels?per_page=100&page=1`,
              { stdout: [] },
            ],
          ]),
        ),
      });
      const recovered = await (
        await server.app.request("/api/github/items/1433/refresh", { method: "POST" })
      ).json();
      expect(recovered.github.stale).toBe(false);
      expect(recovered.github.items[0].complete).toBe(true);
      expect(
        recovered.workItems[0].tickets.every((ticket: { blocked: boolean }) => !ticket.blocked),
      ).toBe(true);
      const reset = Math.ceil(Date.now() / 1000) + 60;
      await gh.script({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/gh-aw": {
          stdout: {
            node_id: "R_test",
            full_name: "github/gh-aw",
            html_url: "https://github.com/github/gh-aw",
          },
        },
        "api repos/github/gh-aw/issues/1433": {
          stdout: `HTTP/2 200 OK\r\nx-ratelimit-remaining: 0\r\nx-ratelimit-reset: ${reset}\r\n\r\n${JSON.stringify(parent)}`,
        },
      });
      const limited = await server.app.request("/api/github/items/1433/refresh", {
        method: "POST",
      });
      expect(limited.status).toBe(503);
      expect((await limited.json()).github.errorCode).toBe("rate-limited");
      // Identity during cooldown is checked locally, without a network viewer request.
      await gh.script({
        "config get": { stdout: "101" },
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
      });
      const beforeCooldown = (await gh.calls()).length;
      expect(
        (await server.app.request("/api/github/items/1433/refresh", { method: "POST" })).status,
      ).toBe(429);
      expect(
        (await gh.calls())
          .slice(beforeCooldown)
          .filter(({ args }) => args[0] === "api" || args[0] === "auth"),
      ).toEqual([]);
      await gh.script({
        "config get": { stdout: "102" },
        "auth status": {},
        "api user": { stdout: { id: 102, login: "102" } },
      });
      const changed = await server.app.request("/api/github/items/1433/refresh", {
        method: "POST",
      });
      expect(changed.status).toBe(503);
      const unavailable = await changed.json();
      expect(unavailable.workItems).toEqual([]);
      expect(unavailable.github).toMatchObject({
        complete: false,
        errorCode: "identity",
        items: [],
      });
      const afterChange = (await gh.calls()).length;
      await server.app.request("/api/github/discovery/refresh", { method: "POST" });
      expect(
        (await gh.calls())
          .slice(afterChange)
          .filter(({ args }) => args[0] === "api" || args[0] === "auth"),
      ).toEqual([]);
    } finally {
      await server.stop();
    }
  } finally {
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("recorded native open blockers outside the parent block both tickets", async () => {
  const root = await mkdtemp(join(tmpdir(), "github-blockers-"));
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
    const blocked = await Promise.all([
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
    const gh = await fakeGh(join(root, "bin"));
    process.env.PATH = gh.path;
    const connection = (nodes: unknown[]) => ({
      nodes,
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    await gh.script({
      "auth status": {},
      "api user": { stdout: { id: 101, login: "101" } },
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
                    totalCount: 2,
                  },
                },
              ]),
            },
            rateLimit: { cost: 1, remaining: 4999, resetAt: "2026-10-28T00:00:00Z" },
          },
        },
      },
      "api repos/github/spec-kit/issues/5000": { stdout: parent },
      "api repos/github/spec-kit/issues/5000/sub_issues?per_page=100&page=1": { stdout: children },
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
            { stdout: blocked[index] },
          ],
        ]),
      ),
    });
    const { createProjectServer } = await import("./index.js");
    const server = createProjectServer(root, join(root, "web"));
    try {
      const response = await server.app.request("/api/github/items/5000/refresh", {
        method: "POST",
      });
      expect(response.status).toBe(200);
      const snapshot = await response.json();
      expect(
        snapshot.workItems[0].tickets.map(
          ({
            number,
            blockedBy,
            blocked,
          }: {
            number: number;
            blockedBy: number[];
            blocked: boolean;
          }) => ({ number, blockedBy, blocked }),
        ),
      ).toEqual([
        { number: 5071, blockedBy: [5060], blocked: true },
        { number: 5073, blockedBy: [5060], blocked: true },
      ]);
      children[0].comments = 2;
      children[0].issue_dependencies_summary.total_blocked_by = 2;
      const nextPage = (data: unknown) =>
        `HTTP/2 200 OK\r\nLink: <https://api.github.com/next>; rel="next"\r\n\r\n${JSON.stringify(data)}`;
      await gh.script({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/spec-kit": {
          stdout: {
            node_id: "R_test",
            full_name: "github/spec-kit",
            html_url: "https://github.com/github/spec-kit",
          },
        },
        "api repos/github/spec-kit/issues/5000": { stdout: parent },
        "api repos/github/spec-kit/issues/5000/sub_issues?per_page=100&page=1": {
          stdout: children,
        },
        "api repos/github/spec-kit/issues/5000/comments?per_page=100&page=1": { stdout: [] },
        "api repos/github/spec-kit/issues/5071/labels?per_page=100&page=1": {
          stdout: nextPage([{ name: "ready-for-agent" }]),
        },
        "api repos/github/spec-kit/issues/5071/labels?per_page=100&page=2": {
          stdout: [{ name: "needs-info" }],
        },
        "api repos/github/spec-kit/issues/5071/comments?per_page=100&page=1": {
          stdout: nextPage([{ id: 1, node_id: "C1", body: "First" }]),
        },
        "api repos/github/spec-kit/issues/5071/comments?per_page=100&page=2": {
          stdout: [{ id: 2, node_id: "C2", body: "Second" }],
        },
        "api repos/github/spec-kit/issues/5071/dependencies/blocked_by?per_page=100&page=1": {
          stdout: nextPage(blocked[0]),
        },
        "api repos/github/spec-kit/issues/5071/dependencies/blocked_by?per_page=100&page=2": {
          stdout: [children[1]],
        },
        "api repos/github/spec-kit/issues/5073/labels?per_page=100&page=1": { stdout: [] },
        "api repos/github/spec-kit/issues/5073/comments?per_page=100&page=1": { stdout: [] },
        "api repos/github/spec-kit/issues/5073/dependencies/blocked_by?per_page=100&page=1": {
          stdout: blocked[1],
        },
      });
      const allPages = await (
        await server.app.request("/api/github/items/5000/refresh", { method: "POST" })
      ).json();
      expect(
        allPages.workItems[0].tickets.find((ticket: { number: number }) => ticket.number === 5071),
      ).toMatchObject({
        status: "unknown",
        blockedBy: [5060, 5073],
        comments: ["First", "Second"],
      });
      children[0].comments = 0;
      children[0].issue_dependencies_summary.total_blocked_by = 1;
      await gh.script({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/spec-kit": {
          stdout: {
            node_id: "R_test",
            full_name: "github/spec-kit",
            html_url: "https://github.com/github/spec-kit",
          },
        },
        "api repos/github/spec-kit/issues/5000": { stdout: parent },
        "api repos/github/spec-kit/issues/5000/sub_issues?per_page=100&page=1": {
          stdout: children,
        },
        "api repos/github/spec-kit/issues/5000/comments?per_page=100&page=1": { stdout: [] },
        ...Object.fromEntries(
          children.flatMap((child: { number: number }) => [
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
              { stdout: [] },
            ],
          ]),
        ),
      });
      expect(
        (await server.app.request("/api/github/items/5000/refresh", { method: "POST" })).status,
      ).toBe(503);
      expect(snapshot.github.items[0].detail.tickets[0]).toMatchObject({
        id: children[0].node_id,
        blockers: [{ id: blocked[0][0].node_id, number: 5060, state: "open" }],
        commentRecords: [],
      });
      await gh.script({
        "auth status": {},
        "api user": { stdout: { id: 101, login: "101" } },
        "api repos/github/spec-kit": {
          stdout: {
            node_id: "R_changed",
            full_name: "github/spec-kit",
            html_url: "https://github.com/github/spec-kit",
          },
        },
      });
      const changed = await server.app.request("/api/github/items/5000/refresh", {
        method: "POST",
      });
      expect(changed.status).toBe(503);
      expect((await changed.json()).workItems).toEqual([]);
    } finally {
      await server.stop();
    }
  } finally {
    process.env.PATH = oldPath;
    await rm(root, { recursive: true, force: true });
  }
});
