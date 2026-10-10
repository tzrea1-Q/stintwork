import { expect, test } from "vitest";
import type { AgentProfile } from "./agents.js";
import { indexProject } from "./project.js";
import type { StintLogEntry } from "./stints.js";
import { createMemoryRepoFiles } from "./work-items.js";

const agent: AgentProfile = {
  id: "grok",
  displayName: "Grok Build",
  installationHint: "Install Grok Build",
  capabilities: {
    modes: [],
    defaultMode: null,
    additionalDirectories: false,
    permissionOptions: null,
    declineEndsTurn: null,
    configOptions: ["model", "reasoning_effort"],
    authenticationRequired: { message: "Authentication required", loginCommand: "grok login" },
  },
};
const started: StintLogEntry = {
  type: "started",
  at: "2026-10-09T10:00:00Z",
  stint: {
    id: "first",
    workItem: "first",
    stage: "implement",
    ticket: 1,
    agent: "grok",
    baseCommit: "base",
    worktree: { path: "/worktree", branch: "stintwork/first" },
    brief: { prompt: "Work", skill: null, pointers: [], changedPaths: [], lastHandoff: null },
  },
};
function project(profile = agent, entries: StintLogEntry[] = []) {
  return indexProject(
    createMemoryRepoFiles({
      ".scratch/first/spec.md": "# First",
      ".stintwork/local/stints/first.jsonl": entries
        .map((entry) => JSON.stringify(entry))
        .join("\n"),
    }),
    { name: "Project", agents: [profile] },
  );
}
const failed: StintLogEntry = {
  type: "ended",
  at: "2026-10-09T10:01:00Z",
  status: "failed",
  error: "Grok Build authentication required. Sign in with grok login.",
};

test("login attention derives stable agent identity from availability without inventing a work item or stint", () => {
  const profile: AgentProfile = {
    ...agent,
    availability: { available: false, status: "login-required", checkedAt: "2026-10-09T10:00:00Z" },
  };
  expect(project(profile).attentionItems).toEqual([
    expect.objectContaining({
      id: 'login-required:"grok"',
      kind: "login-required",
      workItem: null,
      stintId: null,
      ticket: null,
      agent: "grok",
      loginCommand: "grok login",
      raisedAt: profile.availability?.checkedAt,
    }),
  ]);
  expect(
    project({
      ...agent,
      availability: {
        available: false,
        status: "not-installed",
        checkedAt: "2026-10-09T10:00:00Z",
      },
    }).attentionItems,
  ).toEqual([]);
});

test("logged authentication failures rebuild one attention item; successful stints and unrelated failures do not need login", () => {
  const snapshot = project(agent, [started, failed]);
  expect(snapshot.attentionItems).toEqual([
    expect.objectContaining({
      workItem: "first",
      stintId: "first",
      ticket: 1,
      raisedAt: failed.at,
    }),
  ]);
  expect(project(agent, [started, failed]).attentionItems).toEqual(snapshot.attentionItems);
  expect(
    project(
      {
        ...agent,
        availability: {
          available: false,
          status: "login-required",
          checkedAt: "2026-10-09T10:05:00Z",
        },
      },
      [started, failed],
    ).attentionItems,
  ).toEqual(snapshot.attentionItems);
  expect(
    project(agent, [started, { ...failed, status: "finished", error: undefined }]).attentionItems,
  ).toEqual([]);
  expect(
    project(agent, [started, { ...failed, error: "Transport closed" }]).attentionItems,
  ).toEqual([]);
});

test("a successful newer stint clears an older authentication failure", () => {
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".scratch/first/spec.md": "# First",
      ".stintwork/local/stints/first.jsonl": [started, failed]
        .map((entry) => JSON.stringify(entry))
        .join("\n"),
      ".stintwork/local/stints/second.jsonl": [
        { ...started, at: "2026-10-09T10:02:00Z", stint: { ...started.stint, id: "second" } },
        { type: "ended", at: "2026-10-09T10:03:00Z", status: "finished" },
      ]
        .map((entry) => JSON.stringify(entry))
        .join("\n"),
    }),
    { name: "Project", agents: [agent] },
  );
  expect(snapshot.workItems[0].stints).toHaveLength(2);
  expect(snapshot.attentionItems).toEqual([]);
});

test("only an availability check newer than the failed stint clears its login attention", () => {
  expect(
    project({ ...agent, availability: { available: true, checkedAt: "2026-10-09T09:00:00Z" } }, [
      started,
      failed,
    ]).attentionItems,
  ).toHaveLength(1);
  expect(
    project({ ...agent, availability: { available: true, checkedAt: "2026-10-09T10:02:00Z" } }, [
      started,
      failed,
    ]).attentionItems,
  ).toEqual([]);
});
