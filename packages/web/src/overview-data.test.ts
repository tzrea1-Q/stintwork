// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { expect, test } from "vitest";
import { overviewData, viewFromSearch } from "./overview-data";

test("restores default and explicit views", () => {
  expect(viewFromSearch("")).toBe("overview");
  expect(viewFromSearch("?item=one")).toBe("pipeline");
  expect(viewFromSearch("?view=overview&item=one")).toBe("overview");
  expect(viewFromSearch("?view=pipeline")).toBe("pipeline");
  expect(viewFromSearch("?view=")).toBe("overview");
});

test("derives only available cards and chooses the first untouched item in milestone order", () => {
  const empty = indexProject(createMemoryRepoFiles({}), { name: "Test" });
  expect(overviewData(empty)).toEqual({
    milestones: [],
    columns: [],
    next: undefined,
    running: [],
    activity: [],
    attention: [],
  });
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".stintwork/roadmap.md": "## First\nId: first\nStatus: active\n- zed\n",
      ".scratch/zed/spec.md": "# Zed",
      ".scratch/alpha/spec.md": "# Alpha",
    }),
    { name: "Test" },
  );
  const data = overviewData(snapshot);
  expect(data.next?.slug).toBe("zed");
  expect(data.milestones).toMatchObject([{ total: 1, shipped: 0 }]);
  expect(data.columns.reduce((sum, column) => sum + column.count, 0)).toBe(2);
  expect(data.running).toEqual([]);
  expect(data.activity).toEqual([]);
  snapshot.workItems
    .find((item) => item.slug === "zed")
    ?.tickets.push({
      number: 1,
      slug: "blocked",
      title: "Blocked",
      status: "open",
      resolved: false,
      blockedBy: [2],
      blocked: true,
      comments: [],
      body: "",
      path: "",
    });
  expect(overviewData(snapshot).next?.slug).toBe("alpha");
});

test("derives running stints, attention and timestamped activity in newest-first order", () => {
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".scratch/one/spec.md": "# One",
      ".scratch/two/spec.md": "# Two",
    }),
    { name: "Test" },
  );
  const [one, two] = snapshot.workItems;
  one.activeStint = { id: "running" } as NonNullable<typeof one.activeStint>;
  one.stints = [
    { id: "older", startedAt: "2026-01-01T00:00:00Z", endedAt: null },
    { id: "invalid", startedAt: "", endedAt: null },
  ] as typeof one.stints;
  two.stints = [
    { id: "newer", startedAt: "2026-02-01T00:00:00Z", endedAt: null },
  ] as typeof two.stints;
  snapshot.attentionItems = [
    { id: "attention", workItem: one.slug },
  ] as typeof snapshot.attentionItems;
  const data = overviewData(snapshot);
  expect(data.running.map((item) => item.slug)).toEqual([one.slug]);
  expect(data.attention.map((item) => item.id)).toEqual(["attention"]);
  expect(data.activity.map(({ stint }) => stint.id)).toEqual(["newer", "older"]);
  expect(data.next).toBeUndefined();
});

test("Next up accepts ready or no tickets and excludes items with only blocked or resolved tickets", () => {
  const snapshot = indexProject(createMemoryRepoFiles({ ".scratch/one/spec.md": "# One" }), {
    name: "Test",
  });
  const item = snapshot.workItems[0];
  const ticket = {
    number: 1,
    slug: "blocked",
    title: "Blocked",
    status: "open",
    resolved: false,
    blockedBy: [2],
    blocked: true,
    comments: [],
    body: "",
    path: "",
  };
  expect(overviewData(snapshot).next?.slug).toBe("one");
  item.tickets = [ticket];
  expect(overviewData(snapshot).next).toBeUndefined();
  item.tickets.push({ ...ticket, number: 2, slug: "ready", blocked: false, blockedBy: [] });
  expect(overviewData(snapshot).next?.slug).toBe("one");
  item.tickets[1].resolved = true;
  expect(overviewData(snapshot).next).toBeUndefined();
});
