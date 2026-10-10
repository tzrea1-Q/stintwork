import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { deriveAttentionItems, type MemoryProposalAttentionItem } from "@stintwork/core";
import { Board } from "./Board";
import { attentionSnapshot } from "./attention-test-fixtures";

const proposal: MemoryProposalAttentionItem = {
  kind: "memory-proposal",
  id: 'memory-proposal:["stint","GLOSSARY.md"]',
  workItem: "first",
  ticket: 6,
  stintId: "stint",
  agent: "custom-agent",
  title: "Memory proposal: GLOSSARY.md",
  details:
    "Accept this project memory change, or reject it to restore the file to the stint's base commit.",
  raisedAt: "2026-10-10T10:00:00Z",
  path: "GLOSSARY.md",
  baseCommit: "base",
  checkpointCommit: "checkpoint",
  diff: "diff --git a/GLOSSARY.md b/GLOSSARY.md\n@@ -1 +1 @@\n-Old term\n+New term\n<script>alert('no')</script>",
};
function memorySnapshot() {
  const snapshot = attentionSnapshot([]);
  snapshot.workItems[0].memoryProposals = [proposal];
  snapshot.attentionItems = deriveAttentionItems(snapshot);
  return snapshot;
}
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

test.each(["accepted", "rejected"] as const)(
  "queue shows the diff and records a %s proposal",
  async (status) => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const snapshot = memorySnapshot();
    const { rerender } = render(<Board snapshot={snapshot} />);
    await user.click(screen.getByRole("button", { name: "Needs you 1" }));
    const article = within(screen.getByRole("article", { name: proposal.title }));
    expect(article.getByLabelText("Diff for GLOSSARY.md").textContent).toBe(proposal.diff);
    expect(article.getByLabelText("Diff for GLOSSARY.md").querySelector("script")).toBeNull();
    expect(article.getByText(/including any later committed changes/)).toBeInTheDocument();
    await user.click(
      article.getByRole("button", {
        name: status === "accepted" ? "Accept memory proposal" : "Reject memory proposal",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/work-items/first/memory-proposals/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: proposal.id, status, reason: "" }),
    });
    expect(article.getByRole("status")).toHaveTextContent("Memory proposal decision recorded.");
    expect(article.getByRole("button", { name: "Accept memory proposal" })).toBeDisabled();
    expect(article.getByRole("button", { name: "Reject memory proposal" })).toBeDisabled();
    rerender(<Board snapshot={{ ...snapshot, attentionItems: [] }} />);
    expect(screen.getByText("Nothing needs you right now.")).toBeInTheDocument();
  },
);

test("failed decisions keep the proposal actionable and surface the server reason", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ reason: "Commit the proposed file first." }),
    }),
  );
  render(<Board snapshot={memorySnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  await user.click(screen.getByRole("button", { name: "Reject memory proposal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Commit the proposed file first.");
  expect(screen.getByRole("button", { name: "Accept memory proposal" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Reject memory proposal" })).toBeEnabled();
});

test("a pending decision disables both actions so rejection cannot race acceptance", async () => {
  const user = userEvent.setup();
  let complete: (value: { ok: boolean }) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    ),
  );
  render(<Board snapshot={memorySnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  await user.click(screen.getByRole("button", { name: "Accept memory proposal" }));
  expect(screen.getByRole("button", { name: "Accept memory proposal" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reject memory proposal" })).toBeDisabled();
  complete({ ok: true });
  expect(
    await within(screen.getByRole("article", { name: proposal.title })).findByRole("status"),
  ).toHaveTextContent("Memory proposal decision recorded.");
});
