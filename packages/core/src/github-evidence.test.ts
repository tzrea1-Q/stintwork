// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { githubEvidenceDigest, githubEvidenceJson } from "./github-evidence.js";

test("version 1 digest hashes UTF-8 canonical JSON", async () => {
  expect(await githubEvidenceDigest({ parentId: "I_1", body: "hello", tickets: [] }, false)).toBe(
    "sha256:bb8901d6acaf063b2b172c54ca760129fe172c1761f0f1038b46e3f38b7dfc32",
  );
});

test("version 1 spec evidence preserves exact body and excludes discussion", () => {
  expect(githubEvidenceJson({ parentId: "I_1", body: "spec\r\n雪", tickets: [] }, false)).toBe(
    '{"version":1,"parentId":"I_1","body":"spec\\r\\n雪"}',
  );
});

test("ticket evidence sorts identities and includes only configured triage labels", () => {
  const input = {
    parentId: "I_1",
    body: "spec",
    tickets: [
      {
        id: "I_b",
        body: "body",
        state: "open",
        stateReason: null,
        labels: ["other", "READY"],
        blockers: [
          { id: "I_z", state: "closed" },
          { id: "I_a", state: "open" },
        ],
        commentRecords: [
          { id: "C_z", body: "last" },
          { id: "C_a", body: "first" },
        ],
      },
      {
        id: "I_a",
        body: "",
        state: "closed",
        stateReason: "completed",
        labels: [],
        blockers: [],
        commentRecords: [],
      },
    ],
  };
  expect(githubEvidenceJson(input, true, ["ready"])).toBe(
    '{"version":1,"parentId":"I_1","body":"spec","tickets":[{"id":"I_a","body":"","state":"closed","stateReason":"completed","labels":[],"blockers":[],"comments":[]},{"id":"I_b","body":"body","state":"open","stateReason":null,"labels":["ready"],"blockers":[{"id":"I_a","state":"open"},{"id":"I_z","state":"closed"}],"comments":[{"id":"C_a","body":"first"},{"id":"C_z","body":"last"}]}]}',
  );
});

test("irrelevant metadata and parent comments are excluded, ticket comments are included", () => {
  const ticket = {
    id: "I_2",
    body: "body",
    state: "open",
    stateReason: null,
    labels: [],
    blockers: [],
    commentRecords: [{ id: "C_1", body: "first" }],
    title: "Old",
    assignees: ["a"],
    updatedAt: "old",
  };
  const input = { parentId: "I_1", body: "spec", tickets: [ticket], comments: ["discussion"] };
  const before = githubEvidenceJson(input, true);
  ticket.title = "New";
  ticket.assignees = ["b"];
  ticket.updatedAt = "new";
  input.comments = ["changed discussion"];
  expect(githubEvidenceJson(input, true)).toBe(before);
  ticket.commentRecords[0].body = "changed";
  expect(githubEvidenceJson(input, true)).not.toBe(before);
  expect(githubEvidenceJson(input, false)).not.toContain("changed");
});

test("digest covers each evidence field and is independent of collection order", async () => {
  const ticket = {
    id: "I_2",
    body: "ticket",
    state: "open",
    stateReason: null as string | null,
    labels: ["ready", "needs-info"],
    blockers: [
      { id: "I_4", state: "closed" },
      { id: "I_3", state: "open" },
    ],
    commentRecords: [
      { id: "C_2", body: "two" },
      { id: "C_1", body: "one" },
    ],
  };
  const input = { parentId: "I_1", body: "spec", tickets: [ticket, { ...ticket, id: "I_5" }] };
  const labels = ["ready", "needs-info"];
  const original = await githubEvidenceDigest(input, true, labels);
  const reordered = structuredClone(input);
  reordered.tickets.reverse();
  for (const entry of reordered.tickets) {
    entry.labels.reverse();
    entry.blockers.reverse();
    entry.commentRecords.reverse();
  }
  expect(await githubEvidenceDigest(reordered, true, labels)).toBe(original);
  const changes: ((value: typeof input) => void)[] = [
    (v) => {
      v.parentId = "I_changed";
    },
    (v) => {
      v.body = "changed";
    },
    (v) => {
      v.tickets.pop();
    },
    (v) => {
      v.tickets[0].id = "I_changed";
    },
    (v) => {
      v.tickets[0].body = "changed";
    },
    (v) => {
      v.tickets[0].state = "closed";
    },
    (v) => {
      v.tickets[0].stateReason = "completed";
    },
    (v) => {
      v.tickets[0].labels.pop();
    },
    (v) => {
      v.tickets[0].blockers[0].id = "I_changed";
    },
    (v) => {
      v.tickets[0].blockers[0].state = "open";
    },
    (v) => {
      v.tickets[0].commentRecords[0].id = "C_changed";
    },
    (v) => {
      v.tickets[0].commentRecords[0].body = "changed";
    },
  ];
  for (const change of changes) {
    const changed = structuredClone(input);
    change(changed);
    expect(await githubEvidenceDigest(changed, true, labels)).not.toBe(original);
  }
});
