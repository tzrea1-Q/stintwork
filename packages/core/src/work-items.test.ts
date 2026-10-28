// SPDX-License-Identifier: Apache-2.0
import { readFileSync, readdirSync, statSync } from "node:fs";
import { expect, test } from "vitest";
import { createMemoryRepoFiles, indexWorkItems, type RepoFiles } from "./index.js";

function diskFiles(root: URL): RepoFiles {
  return {
    list: (prefix) =>
      readdirSync(new URL(prefix, root), { recursive: true })
        .map((path) => `${prefix}${path}`)
        .filter((path) => statSync(new URL(path, root)).isFile()),
    read: (path) => readFileSync(new URL(path, root), "utf8"),
  };
}

const fixtureFiles = diskFiles(new URL("../tests/fixtures/", import.meta.url));
const contractPackage = Object.fromEntries(
  fixtureFiles.list(".scratch/").map((path) => [path, fixtureFiles.read(path) as string]),
);

function ticket(number: number, status = "open", blockedBy = "none"): [string, string] {
  const label = String(number).padStart(2, "0");
  return [
    `.scratch/example/issues/${label}-ticket.md`,
    `# ${label} — Ticket ${label}\n\nStatus: ${status}\nBlocked by: ${blockedBy}\n`,
  ];
}

function indexTickets(...entries: [string, string][]) {
  return indexWorkItems(createMemoryRepoFiles(Object.fromEntries(entries)));
}

test("indexes a work item with spec and tickets", () => {
  const { workItems, warnings } = indexWorkItems(createMemoryRepoFiles(contractPackage));
  expect(warnings).toEqual([]);
  expect(workItems).toHaveLength(1);
  const workItem = workItems[0];
  expect(workItem).toMatchObject({
    slug: "contract-package",
    title: "Contract package",
    type: "feature",
    spec: {
      path: ".scratch/contract-package/spec.md",
      text: contractPackage[".scratch/contract-package/spec.md"],
    },
  });
  expect(workItem.tickets).toHaveLength(6);
  expect(workItem.tickets.filter((ticket) => ticket.resolved)).toHaveLength(3);
  expect(workItem.tickets[0]).toEqual({
    number: 1,
    slug: "package-skeleton",
    title: "Create the contract package skeleton",
    status: "resolved",
    resolved: true,
    blockedBy: [],
    blocked: false,
    comments: [],
    body: contractPackage[".scratch/contract-package/issues/01-package-skeleton.md"],
    path: ".scratch/contract-package/issues/01-package-skeleton.md",
  });
  expect(workItem.tickets.map((ticket) => ticket.blockedBy)).toEqual([
    [],
    [1],
    [2],
    [2],
    [4],
    [3, 5],
  ]);
});

test("orders tickets by dependency then number", () => {
  const { workItems, warnings } = indexTickets(
    ticket(5, "open", "03"),
    ticket(4),
    ticket(3, "open", "02"),
    ticket(2),
    ticket(1, "open", "04"),
  );
  expect(warnings).toEqual([]);
  expect(workItems[0].tickets.map((ticket) => ticket.number)).toEqual([2, 3, 4, 1, 5]);
});

test("treats resolved, done, closed and complete(d) as resolved, case-insensitively", () => {
  const statuses = [
    "resolved",
    "ReSoLvEd",
    "done",
    "DONE",
    "closed",
    "Closed",
    "complete",
    "Completed",
    "in progress",
  ];
  const { workItems, warnings } = indexTickets(
    ...statuses.map((status, index) => ticket(index + 1, status)),
  );
  expect(warnings).toEqual([]);
  expect(workItems[0].tickets.map((ticket) => ticket.status)).toEqual(statuses);
  expect(workItems[0].tickets.map((ticket) => ticket.resolved)).toEqual([
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    false,
  ]);
});

test("marks a ticket blocked until all its blockers are resolved", () => {
  const contents = { ...contractPackage };
  const blocked = () =>
    indexWorkItems(createMemoryRepoFiles(contents)).workItems[0].tickets.map(
      (ticket) => ticket.blocked,
    );
  expect(blocked()).toEqual([false, false, false, false, true, true]);
  const service = ".scratch/contract-package/issues/04-service-validation.md";
  contents[service] = contents[service].replace("Status: ready-for-agent", "Status: resolved");
  expect(blocked()).toEqual([false, false, false, false, false, true]);
  const client = ".scratch/contract-package/issues/05-client-adoption.md";
  contents[client] = contents[client].replace("Status: ready-for-agent", "Status: resolved");
  expect(blocked()).toEqual([false, false, false, false, false, false]);
});

test("warns on a Blocked by reference to a missing ticket and treats it as blocking", () => {
  const { workItems, warnings } = indexTickets(ticket(1, "resolved"), ticket(2, "open", "01, 99"));
  expect(workItems[0].tickets[1]).toMatchObject({ blockedBy: [1, 99], blocked: true });
  expect(warnings).toEqual([
    { path: ticket(2)[0], message: "Blocked by references missing ticket 99" },
  ]);
});

test("warns on a dependency cycle and falls back to numeric order", () => {
  const { workItems, warnings } = indexTickets(
    ticket(4, "open", "02"),
    ticket(3, "open", "02"),
    ticket(2, "open", "03"),
    ticket(1),
  );
  expect(workItems[0].tickets.map((ticket) => ticket.number)).toEqual([1, 2, 3, 4]);
  expect(warnings).toEqual([
    { path: ticket(2)[0], message: "Dependency cycle; falling back to numeric ticket order" },
  ]);
  expect(indexTickets(ticket(1, "open", "01")).warnings[0].message).toContain("cycle");
});

test("a malformed ticket produces a warning without affecting other work items", () => {
  const { workItems, warnings } = indexWorkItems(
    createMemoryRepoFiles({
      ...contractPackage,
      ".scratch/broken/issues/01-no-heading.md": "Status: open\nBlocked by: none\n",
      ".scratch/broken/issues/02-binary.md": "# Binary\n\u0000",
      ".scratch/broken/issues/bad-filename.md": "# Bad filename\n",
      ".scratch/broken/issues/03-valid.md": "# Valid\nStatus: open\nBlocked by: none\n",
    }),
  );
  expect(workItems.find((workItem) => workItem.slug === "contract-package")?.tickets).toHaveLength(
    6,
  );
  expect(workItems.find((workItem) => workItem.slug === "broken")?.tickets).toHaveLength(1);
  expect(warnings.map((warning) => warning.path)).toEqual([
    ".scratch/broken/issues/01-no-heading.md",
    ".scratch/broken/issues/02-binary.md",
    ".scratch/broken/issues/bad-filename.md",
  ]);
});

test("a directory with map.md is an effort", () => {
  const { workItems, warnings } = indexWorkItems(
    createMemoryRepoFiles({
      ".scratch/large-effort/map.md": "# Map\n",
      ".scratch/large-effort/issues/01-start.md": ticket(1)[1],
    }),
  );
  expect(warnings).toEqual([]);
  expect(workItems[0]).toMatchObject({
    slug: "large-effort",
    title: "Large Effort",
    type: "effort",
    spec: null,
  });
  expect(workItems[0].tickets).toHaveLength(1);
});

test("reads first header metadata and splits comment paragraphs and bold lead lines", () => {
  const path = ticket(1)[0];
  const text = [
    "# 01 - Parse metadata",
    "Status: ReSoLvEd  ",
    "Status: open",
    "Blocked by: NONE",
    "Blocked by: 99",
    "## Details",
    "Status: open",
    "Blocked by: 99",
    "## Comments",
    "First paragraph.",
    "Its continuation.",
    "",
    "**Alice** — reviewed",
    "Ready to ship.",
    "**Bob** — reply",
    "Agreed.",
    "",
    "Final paragraph.",
    "## Other section",
    "Not a comment.",
  ].join("\r\n");
  const { workItems, warnings } = indexWorkItems(
    createMemoryRepoFiles({ [path]: `\uFEFF${text}` }),
  );
  expect(warnings).toEqual([]);
  expect(workItems[0].tickets[0]).toMatchObject({
    title: "Parse metadata",
    status: "ReSoLvEd",
    resolved: true,
    blockedBy: [],
    comments: [
      "First paragraph.\nIts continuation.",
      "**Alice** — reviewed\nReady to ship.",
      "**Bob** — reply\nAgreed.",
      "Final paragraph.",
    ],
  });
});

test("missing header metadata warns and leaves the ticket open", () => {
  const path = ticket(1)[0];
  const { workItems, warnings } = indexWorkItems(
    createMemoryRepoFiles({ [path]: "# Title\n## Details\nStatus: resolved\nBlocked by: 99\n" }),
  );
  expect(workItems[0].tickets[0]).toMatchObject({ status: "", resolved: false, blockedBy: [] });
  expect(warnings).toHaveLength(2);
  expect(warnings.every((warning) => warning.path === path)).toBe(true);
});

test("invalid blocker lists skip tickets and leave their dependants blocked", () => {
  for (const reference of ["x", "1,", "none, 01", "-1", "0", "9007199254740992"]) {
    const { workItems, warnings } = indexTickets(
      ticket(1, "open", reference),
      ticket(2, "open", "01"),
    );
    expect(workItems[0].tickets).toHaveLength(1);
    expect(workItems[0].tickets[0].blocked).toBe(true);
    expect(warnings.map((warning) => warning.path)).toEqual([ticket(1)[0], ticket(2)[0]]);
  }
});

test("duplicate numbers warn deterministically and duplicate blockers count once", () => {
  const path = ".scratch/example/issues/01-another.md";
  const { workItems, warnings } = indexTickets(ticket(2, "open", "01, 1"), ticket(1), [
    path,
    ticket(1, "resolved")[1],
  ]);
  expect(workItems[0].tickets[0].path).toBe(path);
  expect(workItems[0].tickets[1]).toMatchObject({ blockedBy: [1], blocked: false });
  expect(warnings).toEqual([{ path: ticket(1)[0], message: "Duplicate ticket number 1" }]);
});

test("specs keep exact text and fall back to title-cased slugs when malformed", () => {
  const contents = {
    ".scratch/a/spec.md": "No heading\r\n",
    ".scratch/a-first/spec.md": "\uFEFF# First title\r\n# Later title\r\n",
    ".scratch/b/spec.md": "# Binary\u0000",
    ".scratch/über-café/notes.md": "Notes\n",
  };
  const { workItems, warnings } = indexWorkItems(createMemoryRepoFiles(contents));
  expect(workItems.map((workItem) => workItem.title)).toEqual([
    "A",
    "First title",
    "B",
    "Über Café",
  ]);
  expect(workItems[0].spec?.text).toBe(contents[".scratch/a/spec.md"]);
  expect(workItems[1].spec?.text).toBe(contents[".scratch/a-first/spec.md"]);
  expect(workItems[2].spec).toBeNull();
  expect(warnings.map((warning) => warning.path)).toEqual([
    ".scratch/a/spec.md",
    ".scratch/b/spec.md",
  ]);
});

test("file port failures become path-specific warnings", () => {
  const memory = createMemoryRepoFiles(Object.fromEntries([ticket(1)]));
  const { workItems, warnings } = indexWorkItems({
    list: () => [".scratch/example/spec.md", ticket(1)[0], ticket(2)[0]],
    read: (path) => {
      if (path.endsWith("spec.md")) throw new Error("unreadable");
      return memory.read(path);
    },
  });
  expect(workItems[0].tickets).toHaveLength(1);
  expect(warnings.map((warning) => warning.path)).toEqual([
    ".scratch/example/spec.md",
    ticket(2)[0],
  ]);
  expect(
    indexWorkItems({
      list: () => {
        throw new Error("cannot list");
      },
      read: () => undefined,
    }),
  ).toEqual({
    workItems: [],
    warnings: [{ path: ".scratch/", message: "Cannot list files: Error: cannot list" }],
  });
});

test("ignores unrelated files and warns about noncanonical paths", () => {
  const { workItems, warnings } = indexWorkItems({
    list: () => [
      "docs/spec.md",
      ".scratch/config.md",
      ".scratch/../outside/spec.md",
      ".scratch/example/issues/nested/01-ticket.md",
      ".scratch/example/issues/notes.txt",
    ],
    read: () => {
      throw new Error("Unrelated files should not be read");
    },
  });
  expect(workItems).toHaveLength(1);
  expect(workItems[0].tickets).toEqual([]);
  expect(warnings).toEqual([
    {
      path: ".scratch/../outside/spec.md",
      message: "Expected a repo-relative, slash-separated file path",
    },
  ]);
});

test("in-memory repo files are reusable read-only snapshots", () => {
  const contents = Object.fromEntries([ticket(1)]);
  const files = createMemoryRepoFiles(contents);
  contents[ticket(1)[0]] = "changed";
  expect(files.read(ticket(1)[0])).toBe(ticket(1)[1]);
  expect(files.read("missing")).toBeUndefined();
  expect(indexWorkItems(files)).toEqual(indexWorkItems(files));
  expect(indexWorkItems(createMemoryRepoFiles({}))).toEqual({ workItems: [], warnings: [] });
});

test("this repo's tickets parse without warnings and stay in dependency order", () => {
  const { workItems, warnings } = indexWorkItems(diskFiles(new URL("../../../", import.meta.url)));
  expect(warnings).toEqual([]);
  for (const workItem of workItems) {
    const preceding = new Set<number>();
    for (const ticket of workItem.tickets) {
      expect(ticket.blockedBy.every((number) => preceding.has(number))).toBe(true);
      preceding.add(ticket.number);
    }
  }
});

test("local cycle fallback retains numeric order even after an acyclic dependency was ordered", () => {
  const { workItems, warnings } = indexTickets(
    ticket(1, "open", "02"),
    ticket(2),
    ticket(3, "open", "04"),
    ticket(4, "open", "03"),
  );
  expect(workItems[0].tickets.map(({ number }) => number)).toEqual([1, 2, 3, 4]);
  expect(warnings).toEqual([
    { path: ticket(3)[0], message: "Dependency cycle; falling back to numeric ticket order" },
  ]);
});
