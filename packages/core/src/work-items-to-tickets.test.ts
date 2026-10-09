import { readFileSync, readdirSync, statSync } from "node:fs";
import { expect, test } from "vitest";
import { createMemoryRepoFiles, indexWorkItems } from "./index.js";

const plainTicket = readFileSync(
  new URL("../tests/fixtures/to-tickets/02-brief-preview.md", import.meta.url),
  "utf8",
);
const boldTicket = plainTicket
  .replace("# 02 —", "# 02:")
  .replace("Status: ready-for-agent\nBlocked by: none\n\n", "")
  .replace("## What to build\n\n", "**What to build:** ")
  .replace(
    "## Acceptance criteria",
    "**Blocked by:** None (can start immediately)\n\n**Status:** ready-for-agent\n\n## Acceptance criteria",
  );
const ticketPath = ".scratch/example/issues/02-brief-preview.md";

function indexTicket(text: string, others: Record<string, string> = {}) {
  return indexWorkItems(createMemoryRepoFiles({ ...others, [ticketPath]: text }));
}

test("indexes a ticket copied from this repo's real to-tickets output", () => {
  const { workItems, warnings } = indexTicket(plainTicket);
  expect(warnings).toEqual([]);
  expect(workItems[0].tickets[0]).toMatchObject({
    number: 2,
    title: "Brief preview",
    status: "ready-for-agent",
    resolved: false,
    blockedBy: [],
    blocked: false,
    body: plainTicket,
  });
});

test.each([
  ["resolved", true],
  ["ready-for-agent", false],
] as const)("reads bold Status: %s after the What to build paragraph", (status, resolved) => {
  const text = boldTicket.replace("**Status:** ready-for-agent", `**Status:** ${status}`);
  const { workItems, warnings } = indexTicket(text);
  expect(warnings).toEqual([]);
  expect(workItems[0].tickets[0]).toMatchObject({
    title: "Brief preview",
    status,
    resolved,
    blockedBy: [],
    blocked: false,
    body: text,
  });
});

test.each(["none", "None (can start immediately)", "NONE (no dependencies)"])(
  "reads bold Blocked by: %s as no blockers",
  (blockers) => {
    const { workItems, warnings } = indexTicket(
      boldTicket.replace("None (can start immediately)", blockers),
    );
    expect(warnings).toEqual([]);
    expect(workItems[0].tickets[0]).toMatchObject({ blockedBy: [], blocked: false });
  },
);

test.each([
  ["01, 03", [1, 3]],
  ["01 (Index work items), 03", [1, 3]],
  ["01 Index work items, 03 — Compile briefs", [1, 3]],
  ["01, 1 (Index work items)", [1]],
] as const)("reads bold blocker numbers with optional titles: %s", (blockers, blockedBy) => {
  const { workItems, warnings } = indexTicket(
    boldTicket.replace("None (can start immediately)", blockers),
    {
      ".scratch/example/issues/01-index.md":
        "# Index work items\nStatus: resolved\nBlocked by: none",
      ".scratch/example/issues/03-brief.md": "# Compile briefs\nStatus: resolved\nBlocked by: none",
    },
  );
  expect(warnings).toEqual([]);
  expect(workItems[0].tickets.find((ticket) => ticket.number === 2)).toMatchObject({
    blockedBy,
    blocked: false,
  });
});

test.each(["# 02:", "# 02 —", "# 02 -"])("strips the title prefix %s", (prefix) => {
  const { workItems, warnings } = indexTicket(boldTicket.replace("# 02:", prefix));
  expect(warnings).toEqual([]);
  expect(workItems[0].tickets[0].title).toBe("Brief preview");
});

test.each([
  "**Status:** resolved\n\n**Blocked by:** None (can start immediately)",
  "**Blocked by:** None (can start immediately)\n\n**Status:** resolved",
])("finds metadata before the first section in either order: %s", (metadata) => {
  const text = boldTicket.replace(
    "**Blocked by:** None (can start immediately)\n\n**Status:** ready-for-agent",
    metadata,
  );
  const { workItems, warnings } = indexTicket(
    `${text}\n**Status:** ready-for-agent\n**Blocked by:** 99\n`,
  );
  expect(warnings).toEqual([]);
  expect(workItems[0].tickets[0]).toMatchObject({
    status: "resolved",
    resolved: true,
    blockedBy: [],
  });
});

test("ignores bold metadata after the first section", () => {
  const text = boldTicket.replace(
    "**Blocked by:** None (can start immediately)\n\n**Status:** ready-for-agent\n\n",
    "",
  );
  const { workItems, warnings } = indexTicket(
    `${text}\n**Status:** resolved\n**Blocked by:** 99\n`,
  );
  expect(workItems[0].tickets[0]).toMatchObject({ status: "", resolved: false, blockedBy: [] });
  expect(warnings).toHaveLength(2);
  expect(warnings.every((warning) => warning.path === ticketPath)).toBe(true);
});

test.each(["resolved", "ready-for-agent"])(
  "mixes plain and bold tickets and respects the plain blocker's %s status",
  (status) => {
    const { workItems, warnings } = indexTicket(
      boldTicket.replace("None (can start immediately)", "01 (Index work items)"),
      {
        ".scratch/example/issues/01-index.md": `# 01 — Index work items\nStatus: ${status}\nBlocked by: none`,
      },
    );
    expect(warnings).toEqual([]);
    expect(workItems[0].tickets.map((ticket) => ticket.number)).toEqual([1, 2]);
    expect(workItems[0].tickets[1]).toMatchObject({
      status: "ready-for-agent",
      resolved: false,
      blockedBy: [1],
      blocked: status !== "resolved",
    });
  },
);

test("keeps the first metadata value when plain and bold labels are mixed", () => {
  const text = boldTicket
    .replace("**Status:** ready-for-agent", "Status: resolved\n**Status:** ready-for-agent")
    .replace(
      "**Blocked by:** None (can start immediately)",
      "Blocked by: none\n**Blocked by:** 99",
    );
  const { workItems, warnings } = indexTicket(text);
  expect(warnings).toEqual([]);
  expect(workItems[0].tickets[0]).toMatchObject({
    status: "resolved",
    resolved: true,
    blockedBy: [],
  });
});

test("checked acceptance criteria do not resolve an open ticket", () => {
  const text = boldTicket.replaceAll("- [ ]", "- [x]");
  const { workItems, warnings } = indexTicket(text);
  expect(warnings).toEqual([]);
  expect(workItems[0].tickets[0]).toMatchObject({ resolved: false, body: text });
});

test.each(["01oops", "0 (Invalid)", "9007199254740992 (Too large)", "None, 01", "01,"])(
  "still rejects malformed bold blocker lists: %s",
  (blockers) => {
    const { workItems, warnings } = indexTicket(
      boldTicket.replace("None (can start immediately)", blockers),
    );
    expect(workItems[0].tickets).toEqual([]);
    expect(warnings).toEqual([
      { path: ticketPath, message: "Blocked by must be none or comma-separated ticket numbers" },
    ]);
  },
);

test("indexes this repo's board and first-stint tickets without warnings", () => {
  const root = new URL("../../../", import.meta.url);
  const { workItems, warnings } = indexWorkItems({
    list: (prefix) =>
      readdirSync(new URL(prefix, root), { recursive: true })
        .map((path) => `${prefix}${path}`)
        .filter((path) => statSync(new URL(path, root)).isFile()),
    read: (path) => readFileSync(new URL(path, root), "utf8"),
  });
  expect(warnings).toEqual([]);
  expect(
    workItems.find((item) => item.slug === "board")?.tickets.map((ticket) => ticket.number),
  ).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(
    workItems.find((item) => item.slug === "first-stint")?.tickets.map((ticket) => ticket.number),
  ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
