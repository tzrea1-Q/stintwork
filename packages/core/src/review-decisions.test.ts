// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import {
  parseReviewDecisions,
  recordReviewDecision,
  type ReviewDecision,
  parseReviewDeveloperNotes,
  recordReviewDeveloperNote,
} from "./review-decisions.js";
import { createMemoryRepoFiles } from "./work-items.js";
import { indexProject } from "./project.js";

const memory: ReviewDecision = {
  id: "proposal",
  kind: "memory-proposal",
  status: "accepted",
  reason: "Agreed",
  by: "Developer",
  at: "2026-10-10T10:00:00Z",
};
const finding: ReviewDecision = {
  ...memory,
  id: "finding",
  kind: "finding",
  status: "resolved",
  reason: "Fixed",
};

test("risky path acceptances round-trip a path, reason and exact blob, rejecting invalid decisions", () => {
  const decision: ReviewDecision = {
    ...memory,
    kind: "risky-path",
    id: ".env.fixture",
    blob: "a".repeat(40),
  };
  const text = recordReviewDecision(recordReviewDecision(undefined, finding), decision);
  expect(parseReviewDecisions(text)).toEqual([finding, decision]);
  for (const invalid of [
    { ...decision, reason: " " },
    { ...decision, blob: undefined },
    { ...decision, blob: "not-a-blob" },
    { ...decision, status: "resolved" },
    { ...decision, id: "../.env" },
    { ...decision, id: "/.env" },
  ])
    expect(() => recordReviewDecision(text, invalid as ReviewDecision)).toThrow(
      "Invalid review decision",
    );
});

test("one entry per kind and id round-trips both finding and memory decisions", () => {
  expect(parseReviewDecisions(undefined)).toEqual([]);
  const first = recordReviewDecision(undefined, finding);
  const both = recordReviewDecision(first, memory);
  expect(parseReviewDecisions(both)).toEqual([finding, memory]);
  const updated = recordReviewDecision(both, {
    ...memory,
    status: "rejected",
    reason: "Not needed",
  });
  expect(parseReviewDecisions(updated)).toEqual([
    finding,
    { ...memory, status: "rejected", reason: "Not needed" },
  ]);
  expect(
    parseReviewDecisions(recordReviewDecision(both, { ...finding, id: memory.id })),
  ).toHaveLength(3);
});

test("updates retain unrelated review metadata and decisions", () => {
  const text = `# Developer record\nversion: 1\n${recordReviewDecision(undefined, finding)}`;
  const updated = recordReviewDecision(text, memory);
  expect(updated).toContain("# Developer record");
  expect(updated).toContain("version: 1");
  expect(parseReviewDecisions(updated)).toEqual([finding, memory]);
});

test.each([
  "decisions: [",
  "decisions: nope",
  "decisions: []\ndecisions: []",
  "decisions: [{}]",
  `decisions:\n${[memory, memory].map((entry) => `  - ${JSON.stringify(entry)}`).join("\n")}`,
])("malformed or duplicate review entries are not silently overwritten", (text) => {
  expect(() => parseReviewDecisions(text)).toThrow(/review.yaml/);
  expect(() => recordReviewDecision(text, finding)).toThrow(/review.yaml/);
});

test.each([
  { ...memory, at: "not-a-date" },
  { ...memory, by: "" },
  { ...memory, status: "resolved" },
  { ...memory, status: ["accepted"] },
  { ...finding, status: "rejected" },
  { ...finding, status: "accepted", reason: "" },
])("validates decision metadata and kind-specific statuses", (entry) => {
  expect(() => recordReviewDecision(undefined, entry as ReviewDecision)).toThrow(
    "Invalid review decision",
  );
});

test("snapshot exposes decisions and reports invalid review files", () => {
  const files = {
    ".scratch/first/spec.md": "# First",
    ".scratch/first/review.yaml": recordReviewDecision(undefined, memory),
  };
  expect(
    indexProject(createMemoryRepoFiles(files), { name: "Project" }).workItems[0].reviewDecisions,
  ).toEqual([memory]);
  const snapshot = indexProject(
    createMemoryRepoFiles({ ...files, ".scratch/first/review.yaml": "invalid" }),
    { name: "Project" },
  );
  expect(snapshot.warnings).toContainEqual(
    expect.objectContaining({ path: ".scratch/first/review.yaml" }),
  );
});

test("review-origin notes round-trip alongside both kinds of decisions", () => {
  const note = {
    id: "review:feedback",
    at: memory.at,
    source: "review" as const,
    text: "## Review findings\nFix input validation.",
  };
  const text = recordReviewDeveloperNote(recordReviewDecision(undefined, finding), note);
  const updated = recordReviewDecision(text, memory);
  expect(parseReviewDecisions(updated)).toEqual([finding, memory]);
  expect(parseReviewDeveloperNotes(updated)).toEqual([note]);
  expect(parseReviewDeveloperNotes(undefined)).toEqual([]);
  expect(() => recordReviewDeveloperNote(updated, note)).toThrow("already exists");
  expect(() => parseReviewDecisions("decisions: []\ndeveloperNotes: null")).toThrow(/review.yaml/);
  expect(() =>
    parseReviewDecisions(
      `decisions: []\ndeveloperNotes: [${JSON.stringify(note)}, ${JSON.stringify(note)}]`,
    ),
  ).toThrow(/review.yaml/);
  for (const invalid of [
    { ...note, source: "agent" },
    { ...note, text: " " },
    { ...note, at: "invalid" },
  ]) {
    expect(() =>
      parseReviewDecisions(`decisions: []\ndeveloperNotes: [${JSON.stringify(invalid)}]`),
    ).toThrow(/review.yaml/);
  }
});
