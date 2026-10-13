// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject, type StintSummary } from "@stintwork/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ShipActions } from "./ShipActions";
import { WorkItemDrawer } from "./WorkItemDrawer";
import { Board } from "./Board";
import { GateView } from "./GateView";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { LanguageSelect } from "./i18n/LanguageSelect";

function project() {
  return indexProject(
    createMemoryRepoFiles({
      ".scratch/first/spec.md": "# First work item",
      ".scratch/first/workflow.yaml": "workflow: feature\nstage: ship\n",
      ".scratch/first/issues/01-first.md": "# Ticket\nStatus: resolved\nBlocked by: none",
    }),
    { name: "Test" },
  );
}
const stint: StintSummary = {
  id: "review-stint",
  workItem: "first",
  stage: "review",
  ticket: null,
  agent: "codex",
  status: "finished",
  startedAt: "2026-10-10T09:00:00Z",
  endedAt: "2026-10-10T09:01:00Z",
  checkpointCommit: "a".repeat(40),
  handoff: {
    stint: "review-stint",
    agent: "codex",
    stoppedAt: "Review finished",
    unresolved: "None",
    nextStep: "Ship locally",
  },
};
afterEach(() => {
  localStorage.removeItem(languageStorageKey);
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

test.each(["ship.running", "ship.future"])(
  "Ship refusals render known codes and retain unknown English (%s)",
  async (code) => {
    localStorage.setItem(languageStorageKey, "zh-CN");
    const reason = "A stint is running on this work item. Finish or stop it before shipping.";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ reason, reasonMessage: { code } }), { status: 409 }),
        ),
    );
    render(
      <LanguageProvider>
        <LanguageSelect />
        <ShipActions item={project().workItems[0]} />
      </LanguageProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "本地合并" }));
    expect(screen.getByRole("alert").textContent).toBe(
      code === "ship.running" ? "此工作项有正在运行的 Stint。请先结束或停止，再交付。" : reason,
    );
    await user.selectOptions(screen.getByRole("combobox", { name: "语言" }), "en");
    expect(screen.getByRole("alert").textContent).toBe(reason);
  },
);

test("Merge locally sends a Ship action and reports the recorded commit", async () => {
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ merged: { at: "2026-10-10T10:00:00Z", commit: "a".repeat(40) } }),
      ),
    );
  vi.stubGlobal("fetch", fetch);
  render(<ShipActions item={project().workItems[0]} />);
  await user.click(screen.getByRole("button", { name: "Merge locally" }));
  expect(fetch).toHaveBeenCalledWith(
    "/api/work-items/first/ship/merge-local",
    expect.objectContaining({
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    `Shipped locally at ${"a".repeat(40)}`,
  );
  expect(screen.getByRole("button", { name: "Merge locally" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Open pull request" })).toBeDisabled();
});

test("the dry-run conflict report lists paths and Send back reopens implementation", async () => {
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          reason: "Merge conflicts with the main branch.",
          conflicts: ["src/input.ts", "code.txt"],
        }),
        { status: 409 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ stage: "implement", stageName: "Implement" })),
    );
  vi.stubGlobal("fetch", fetch);
  render(<ShipActions item={project().workItems[0]} />);
  await user.click(screen.getByRole("button", { name: "Merge locally" }));
  const report = await screen.findByRole("region", { name: "Merge conflicts" });
  expect(
    within(report)
      .getAllByRole("listitem")
      .map((entry) => entry.textContent),
  ).toEqual(["src/input.ts", "code.txt"]);
  expect(screen.getByRole("alert")).toHaveTextContent("Merge conflicts");
  await user.click(within(report).getByRole("button", { name: "Send back" }));
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/work-items/first/ship/send-back",
    expect.objectContaining({ method: "POST" }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent("Sent back to Implement.");
});

test.each([
  "Accept or reject every open memory proposal before shipping.",
  "A stint is running on this work item.",
  "The main checkout has uncommitted changes to files this merge touches.",
])("server refusal is shown and retry remains available: %s", async (reason) => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ reason, paths: ["code.txt"] }), { status: 409 }),
      ),
  );
  render(<ShipActions item={project().workItems[0]} />);
  await user.click(screen.getByRole("button", { name: "Merge locally" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(reason);
  expect(screen.getByRole("list", { name: "Uncommitted merge paths" })).toHaveTextContent(
    "code.txt",
  );
  expect(screen.getByRole("button", { name: "Merge locally" })).toBeEnabled();
});

test("known blockers disable merging with actionable reasons", () => {
  const item = project().workItems[0];
  item.stints = [{ ...stint, status: "running" }];
  item.memoryProposals = [
    {
      kind: "memory-proposal",
      id: "proposal",
      workItem: "first",
      ticket: null,
      stintId: stint.id,
      agent: "codex",
      title: "Memory proposal",
      details: "Decide",
      raisedAt: stint.endedAt as string,
      path: "GLOSSARY.md",
      diff: "diff",
      baseCommit: "base",
      checkpointCommit: "head",
    },
  ];
  render(<ShipActions item={item} />);
  expect(screen.getByRole("button", { name: "Merge locally" })).toBeDisabled();
  const reasons = screen.getByRole("list", { name: "Shipping refusals" });
  expect(reasons).toHaveTextContent("Finish or stop the running stint");
  expect(reasons).toHaveTextContent("every open memory proposal");
});

test("Ship is not Shipped until merged; the drawer then retains history, findings and checks read-only", async () => {
  const user = userEvent.setup();
  const snapshot = project();
  const item = snapshot.workItems[0];
  const board = render(<Board snapshot={snapshot} />);
  expect(
    within(screen.getByRole("region", { name: "Ship" })).getByRole("article", { name: /^first:/ }),
  ).toBeInTheDocument();
  board.unmount();
  item.merged = { at: "2026-10-10T10:00:00Z", commit: "b".repeat(40) };
  item.headCommit = item.merged.commit;
  item.stints = [
    {
      ...stint,
      findings: {
        commit: "a".repeat(40),
        findings: [
          {
            id: "finding",
            axis: "Spec",
            severity: "minor",
            path: "code.txt",
            line: 1,
            title: "Kept finding",
            body: "Finding explanation",
          },
        ],
      },
    },
  ];
  item.reviewDecisions = [
    {
      kind: "finding",
      id: "finding",
      status: "accepted",
      reason: "History verified",
      by: "You",
      at: item.merged.at,
    },
  ];
  item.checks = [
    {
      name: "Test",
      command: "node check.cjs",
      commit: "a".repeat(40),
      status: "passed",
      durationMs: 12,
      outputExcerpt: "passed output",
    },
  ];
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const shippedBoard = render(<Board snapshot={snapshot} />);
  expect(
    within(screen.getByRole("region", { name: "Ship" })).queryByRole("article", {
      name: /^first:/,
    }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("heading", { name: "Shipped" }));
  expect(screen.getByRole("article", { name: /^first:/ })).toHaveTextContent("Shipped");
  shippedBoard.unmount();
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  expect(screen.getByRole("region", { name: "Ship actions" })).toHaveTextContent("Shipped");
  expect(screen.getByText(item.merged.commit)).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Stint history" })).toHaveTextContent("Review finished");
  const finding = screen.getByRole("article", { name: "Kept finding" });
  expect(finding).toHaveTextContent("Finding explanation");
  expect(finding).toHaveTextContent("History verified");
  expect(screen.getByRole("list", { name: "Latest checks" })).toHaveTextContent("passed output");
  expect(screen.queryByRole("button", { name: "Merge locally" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Run checks" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Reopen Review/ })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

test("a finished Review stint predating reopen asks for a new Review stint, not a finish", () => {
  const item = project().workItems[0];
  item.stage = "review";
  item.stints = [{ ...stint, findings: { commit: "a".repeat(40), findings: [] } }];
  item.stages.review = { reopened: { at: "2026-10-10T09:02:00Z" } };
  render(<GateView item={item} />);
  const conditions = screen.getByRole("list", { name: "Review gate conditions" });
  expect(
    within(conditions).getByText("Latest Review stint finished").closest("li"),
  ).toHaveTextContent("Start a new Review stint");
  expect(
    within(conditions).queryByText("The stage stint must finish before approving."),
  ).not.toBeInTheDocument();
});
