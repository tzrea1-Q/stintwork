// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { editRoadmap, parseRoadmap, serializeRoadmap } from "./index.js";

const preamble = "# Roadmap\n\nKeep this introduction exactly.\n<!-- handmade -->\n\n";
const first =
  "## First\nId: first\nStatus: active  # my status note\nTarget: 2026-12-01  # my date note\nOwner: Developer\n\n* board\n\n### Why\nA hand-written paragraph.\n- A hand-written bullet with spaces\n  - nested detail\n\n";
const second = "## Second\nId: second\nStatus: planned\n\n- next\n\nKeep second's note.\n";
const roadmap = preamble + first + second;

test.each(["", "\n", "\n\n", "\n\n\n"])(
  "adding Next and moving beta preserves hand-written text and canonical new spacing (ending %j)",
  (ending) => {
    const now = "## Now\nId: now\nStatus: active\n\n- alpha\n\nNotes kept by hand.";
    const added = editRoadmap(now + ending, { kind: "add", name: "Next" });
    expect(added.text).toBe(`${now}\n\n## Next\nId: next\nStatus: planned\n`);
    expect(serializeRoadmap(added.text, parseRoadmap(added.text).milestones)).toBe(added.text);
    const moved = editRoadmap(added.text, {
      kind: "move",
      workItem: "beta",
      milestone: "next",
    });
    expect(moved.text).toBe(`${now}\n\n## Next\nId: next\nStatus: planned\n\n- beta\n`);
    expect(parseRoadmap(moved.text)).toEqual({ milestones: moved.milestones, warnings: [] });
    expect(serializeRoadmap(moved.text, moved.milestones)).toBe(moved.text);
  },
);

test.each(["", "\n", "\n\n"])(
  "moving into an existing empty list inserts one blank line and preserves existing spacing (%j)",
  (spacing) => {
    const now = "## Now\nId: now\nStatus: active\n\n- alpha\n\nNotes kept by hand.\n\n";
    const next = `## Next\nId: next\nStatus: planned\n${spacing}Notes for Next.\n`;
    const moved = editRoadmap(now + next, {
      kind: "move",
      workItem: "beta",
      milestone: "next",
    });
    expect(moved.text).toBe(
      `${now}## Next\nId: next\nStatus: planned\n\n- beta\n${spacing}Notes for Next.\n`,
    );
    expect(serializeRoadmap(moved.text, parseRoadmap(moved.text).milestones)).toBe(moved.text);
    expect(editRoadmap(now + next, { kind: "rename", id: "next", name: "Renamed" }).text).toBe(
      now + next.replace("## Next\n", "## Renamed\n"),
    );
  },
);

test.each(["\n", "\r\n", "\r"])(
  "no-op serialization preserves bytes with %j line endings and a BOM",
  (newline) => {
    const text = `\uFEFF${roadmap.replaceAll("\n", newline)}`;
    expect(serializeRoadmap(text, parseRoadmap(text).milestones)).toBe(text);
  },
);

test("round trips an edit while preserving the preamble, unknown fields, prose and bullet notes", () => {
  const renamed = editRoadmap(roadmap, { kind: "rename", id: "first", name: "Renamed" });
  expect(renamed.text).toBe(roadmap.replace("## First\n", "## Renamed\n"));
  expect(renamed.milestones[0].id).toBe("first");
  expect(parseRoadmap(renamed.text).milestones).toEqual(renamed.milestones);
  expect(serializeRoadmap(renamed.text, renamed.milestones)).toBe(renamed.text);
});

test("reorders whole milestone sections with their hand-written notes attached", () => {
  const edited = editRoadmap(roadmap, { kind: "reorder", ids: ["second", "first"] });
  expect(edited.text).toBe(preamble + second + first);
  expect(parseRoadmap(edited.text).milestones.map(({ id }) => id)).toEqual(["second", "first"]);
});

test("status and target edits preserve field comments and removing a target keeps its comment", () => {
  const edited = editRoadmap(roadmap, {
    kind: "update",
    id: "first",
    status: "shipped",
    target: "2027-01-02",
  });
  expect(edited.text).toBe(
    roadmap
      .replace("Status: active", "Status: shipped")
      .replace("Target: 2026-12-01", "Target: 2027-01-02"),
  );
  const cleared = editRoadmap(edited.text, { kind: "update", id: "first", target: null });
  expect(cleared.text).toContain("# my date note\nOwner: Developer");
  expect(cleared.milestones[0].target).toBeUndefined();
});

test.each(["", "Target:  # optional\n"])(
  "adds a missing or empty target without duplicate fields: %j",
  (field) => {
    const text = `## First\nId: first\nStatus: planned\n${field}Keep me.\n`;
    const edited = editRoadmap(text, { kind: "update", id: "first", target: "2028-02-29" });
    expect(parseRoadmap(edited.text)).toEqual({ milestones: edited.milestones, warnings: [] });
    expect(edited.text).toContain("Keep me.\n");
    expect(edited.text.match(/^Target:/gm)).toHaveLength(1);
  },
);

test("adds milestones with collision-safe ids derived once and kept after a rename", () => {
  const added = editRoadmap(roadmap, { kind: "add", name: "First" });
  expect(added.milestones.at(-1)).toEqual({
    id: "first-2",
    name: "First",
    status: "planned",
    workItemSlugs: [],
  });
  expect(added.text.startsWith(roadmap)).toBe(true);
  const renamed = editRoadmap(added.text, { kind: "rename", id: "first-2", name: "Elsewhere" });
  expect(renamed.milestones.at(-1)?.id).toBe("first-2");
  expect(editRoadmap(renamed.text, { kind: "add", name: "First" }).milestones.at(-1)?.id).toBe(
    "first-3",
  );
});

test.each([
  ["中文里程碑", "中文里程碑"],
  ["🚀", "milestone"],
])("supports non-ASCII milestone names: %s", (name, id) => {
  expect(editRoadmap("", { kind: "add", name }).milestones[0]).toMatchObject({ id, name });
});

test("adds the first milestone without losing an arbitrary preamble or its final line", () => {
  expect(editRoadmap("Just my introduction", { kind: "add", name: "Next delivery" }).text).toBe(
    "Just my introduction\n\n## Next delivery\nId: next-delivery\nStatus: planned\n",
  );
});

test("moves work items, preserves all other lines, and can unassign or assign to an empty list", () => {
  const moved = editRoadmap(roadmap, { kind: "move", workItem: "board", milestone: "second" });
  expect(moved.text).toBe(
    roadmap.replace("* board\n", "").replace("- next\n", "- next\n- board\n"),
  );
  expect(moved.milestones.map(({ workItemSlugs }) => workItemSlugs)).toEqual([
    [],
    ["next", "board"],
  ]);
  const unassigned = editRoadmap(moved.text, { kind: "move", workItem: "board", milestone: null });
  const reassigned = editRoadmap(unassigned.text, {
    kind: "move",
    workItem: "board",
    milestone: "first",
  });
  expect(reassigned.milestones[0].workItemSlugs).toEqual(["board"]);
  expect(reassigned.text).toContain("Owner: Developer");
  expect(reassigned.text).toContain("- A hand-written bullet with spaces");
});

test("unchanged updates and moving to the current milestone do not rewrite anything", () => {
  expect(editRoadmap(roadmap, { kind: "update", id: "first", status: "active" }).text).toBe(
    roadmap,
  );
  expect(editRoadmap(roadmap, { kind: "move", workItem: "board", milestone: "first" }).text).toBe(
    roadmap,
  );
});

test("edits and reorders files with no final newline", () => {
  const text = "## First\nId: first\nStatus: planned\n## Second\nId: second\nStatus: active";
  expect(serializeRoadmap(text, parseRoadmap(text).milestones)).toBe(text);
  expect(
    parseRoadmap(editRoadmap(text, { kind: "reorder", ids: ["second", "first"] }).text).warnings,
  ).toEqual([]);
  expect(
    parseRoadmap(editRoadmap(text, { kind: "move", workItem: "board", milestone: "second" }).text)
      .milestones[1].workItemSlugs,
  ).toEqual(["board"]);
});

test.each([
  null,
  [],
  {},
  { kind: "unknown" },
  { kind: "add", name: "\n" },
  { kind: "rename", id: "first", name: "Injected\nId: bad" },
  { kind: "rename", id: "missing", name: "Name" },
  { kind: "update", id: "first" },
  { kind: "update", id: "first", status: "done" },
  { kind: "update", id: "first", target: "2027-02-29" },
  { kind: "update", id: "first", target: "2026-01-01\nStatus: shipped" },
  { kind: "reorder", ids: ["first", "first"] },
  { kind: "reorder", ids: ["first"] },
  { kind: "move", workItem: "../board", milestone: "first" },
  { kind: "move", workItem: "board", milestone: "missing" },
])("rejects invalid edits atomically: %j", (change) => {
  expect(() => editRoadmap(roadmap, change)).toThrow();
  expect(parseRoadmap(roadmap).milestones[0].name).toBe("First");
});

test.each(["## Broken\nId: broken\n", "## Broken\nId: broken\nStatus: planned\nId: other\n", "\0"])(
  "refuses malformed source instead of losing unknown sections: %j",
  (text) => {
    expect(() => editRoadmap(roadmap + text, { kind: "add", name: "Next" })).toThrow("warnings");
  },
);

test("refuses to discard milestone notes through the serializer", () => {
  expect(() => serializeRoadmap(roadmap, [])).toThrow("discard hand-written text");
});
