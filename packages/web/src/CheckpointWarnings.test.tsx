// SPDX-License-Identifier: Apache-2.0
import { deriveAttentionItems, type CheckpointWarning } from "@stintwork/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { attentionSnapshot } from "./attention-test-fixtures";
import { Board } from "./Board";
import { HandoffCard } from "./HandoffCard";
import { ReviewOverlay } from "./ReviewOverlay";

const warnings: CheckpointWarning[] = [
  { path: ".env", reasons: ["likely-secret"], excluded: true },
  { path: "large.bin", reasons: ["large-file"], excluded: true },
  { path: "dist/output.js", reasons: ["generated-directory"], excluded: true },
];
function snapshot() {
  const project = attentionSnapshot([]);
  project.workItems[0].activeStint = null;
  Object.assign(project.workItems[0].stints[0], {
    status: "finished",
    endedAt: "2026-10-09T10:30:00Z",
    checkpointWarnings: warnings,
  });
  project.attentionItems = deriveAttentionItems(project);
  return project;
}
function expectWarnings(scope: HTMLElement) {
  const region = within(scope);
  for (const { path } of warnings)
    expect(region.getByText(path, { selector: "code" })).toBeInTheDocument();
  expect(region.getByText(/Excluded from the checkpoint and left uncommitted/)).toBeInTheDocument();
  expect(region.getByText(/File contents are not shown/)).toBeInTheDocument();
  expect(scope).toHaveTextContent("Likely secret");
  expect(scope).toHaveTextContent("Larger than 1 MiB");
  expect(scope).toHaveTextContent("Generated directory");
}
afterEach(() => vi.unstubAllGlobals());

test("handoff cards show excluded paths even when the agent gave no handoff", () => {
  render(<HandoffCard stint={snapshot().workItems[0].stints[0]} />);
  expectWarnings(screen.getByRole("region", { name: "Checkpoint warnings" }));
  expect(screen.getByText("No handoff was given.")).toBeInTheDocument();
});

test("the review overlay shows checkpoint warnings outside the committed diff", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        branch: "stintwork/first",
        mainBranch: "main",
        mainCommit: "a".repeat(40),
        mergeBase: "a".repeat(40),
        headCommit: "b".repeat(40),
        files: [],
      }),
    })),
  );
  render(<ReviewOverlay item={snapshot().workItems[0]} onClose={() => {}} />);
  await waitFor(() =>
    expect(screen.getByText(/No changes between the merge base/)).toBeInTheDocument(),
  );
  expectWarnings(screen.getByRole("region", { name: "Checkpoint warnings" }));
  expect(screen.getByText(/staged and uncommitted changes are not included/)).toBeInTheDocument();
});

test("Needs you raises a checkpoint attention item with paths and remediation", async () => {
  const project = snapshot();
  expect(project.attentionItems).toHaveLength(1);
  expect(project.attentionItems[0]).toMatchObject({
    kind: "checkpoint-warning",
    stintId: "stint",
    warnings,
  });
  render(<Board snapshot={project} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Needs you 1" }));
  const queue = screen.getByRole("dialog", { name: "Needs you 1" });
  expectWarnings(within(queue).getByRole("region", { name: "Checkpoint warnings" }));
  expect(
    within(queue).getByText(/Remove these files or deliberately ignore them/),
  ).toBeInTheDocument();
});

test("a clean follow-up stint clears attention but keeps the earlier warning in history", () => {
  const project = snapshot();
  const item = project.workItems[0];
  item.stints.unshift({ ...item.stints[0], id: "follow-up", checkpointWarnings: undefined });
  expect(deriveAttentionItems(project)).toEqual([]);
  expect(item.stints[1].checkpointWarnings).toEqual(warnings);
});

test("legacy stint handoffs do not invent checkpoint warnings", () => {
  render(<HandoffCard stint={attentionSnapshot([]).workItems[0].stints[0]} />);
  expect(screen.queryByRole("region", { name: "Checkpoint warnings" })).not.toBeInTheDocument();
});
