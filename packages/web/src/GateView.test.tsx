// SPDX-License-Identifier: Apache-2.0
import {
  createMemoryRepoFiles,
  deriveAttentionItems,
  indexProject,
  type ProjectSnapshot,
  type StintSummary,
} from "@stintwork/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, expect, test, vi } from "vitest";
import { Board } from "./Board";
import { GateView } from "./GateView";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { WorkItemDrawer } from "./WorkItemDrawer";

function project(stage = "implement", approved = false): ProjectSnapshot {
  return indexProject(
    createMemoryRepoFiles({
      ".scratch/first/workflow.yaml": `workflow: feature\nstage: ${stage}\n${approved ? "stages:\n  implement:\n    approved: {by: You, at: '2026-10-09T10:00:00Z', commit: checkpoint}\n" : ""}`,
      ".scratch/first/spec.md": "# First work item",
      ".scratch/first/issues/01-first.md": "# First ticket\nStatus: resolved\nBlocked by: none",
    }),
    { name: "Test" },
  );
}
const stint: StintSummary = {
  id: "finished-stint",
  workItem: "first",
  stage: "implement",
  ticket: 1,
  agent: "codex",
  status: "finished",
  startedAt: "2026-10-09T09:00:00Z",
  endedAt: "2026-10-09T09:30:00Z",
  checkpointCommit: "evidence-checkpoint",
  handoff: {
    stint: "finished-stint",
    agent: "codex",
    stoppedAt: "All edits checkpointed",
    unresolved: "Confirm the output",
    nextStep: "Approve Implement",
  },
};
afterEach(() => {
  localStorage.removeItem(languageStorageKey);
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

test("reopen uses its own evidence when dependency detail prevents approval", async () => {
  const item = project("implement").workItems[0];
  item.stages.tickets = { approved: { remoteState: "unknown" } };
  item.github = {
    repository: "a/b",
    repositoryId: "R",
    issueId: "I",
    number: 1,
    url: "https://github.com/a/b/issues/1",
    complete: false,
    dependenciesUnknown: true,
    reopenDigest: "incomplete-digest",
    reviewHead: "head",
  };
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ approval: "unknown" }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  render(
    <LanguageProvider>
      <GateView item={item} />
    </LanguageProvider>,
  );
  expect(screen.getByRole("button", { name: "Approve Implement" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Reopen Tickets" }));
  expect(fetcher).toHaveBeenCalledWith(
    "/api/github/items/1/gates/reopen",
    expect.objectContaining({
      body: JSON.stringify({
        stage: "tickets",
        reviewedDigest: "incomplete-digest",
        reviewedHead: "head",
      }),
    }),
  );
});

test.each([
  ["en", "A stint, check or workflow write is active for this work item."],
  ["zh-CN", "此工作项有活跃的 Stint、检查或工作流写入。"],
])("gate reports a busy write in %s", (language, reason) => {
  localStorage.setItem(languageStorageKey, language);
  const item = project().workItems[0];
  item.gateWriteActive = true;
  render(
    <LanguageProvider>
      <GateView item={item} />
    </LanguageProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent(reason);
});

test.each([
  ["en", "A stint, check or workflow write is active for this work item."],
  ["zh-CN", "此工作项有活跃的 Stint、检查或工作流写入。"],
])("gate displays a coded refusal in %s", async (language, reason) => {
  localStorage.setItem(languageStorageKey, language);
  const item = project().workItems[0];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          reasonMessage: { code: "gate.activeWrite" },
        }),
        { status: 409 },
      ),
    ),
  );
  render(
    <LanguageProvider>
      <GateView item={item} />
    </LanguageProvider>,
  );
  await userEvent.click(
    screen.getByRole("button", { name: language === "en" ? "Approve Implement" : "批准实现" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(reason);
});

test.each([
  [false, "所有工单都必须解决后才能批准。"],
  [true, "此工作项有正在运行的 Stint。请先结束或停止，再批准。"],
])("Chinese gate shows the blocking reason and output label (%s)", (running, reason) => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  const item = project().workItems[0];
  item.tickets[0].resolved = false;
  if (running) item.stints = [{ ...stint, status: "running" }];
  render(
    <LanguageProvider>
      <GateView item={item} />
    </LanguageProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent(reason);
  expect(screen.getByText("由开发者批准，无需输出文件")).toBeInTheDocument();
});

test("Chinese gate translates its required path but keeps parser warnings verbatim", () => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  const item = project("spec").workItems[0];
  item.spec = null;
  item.outputWarnings = [{ path: ".scratch/first/spec.md", message: "Repo parser 原文" }];
  item.stints = [{ ...stint, stage: "spec", ticket: null }];
  render(
    <LanguageProvider>
      <GateView item={item} />
    </LanguageProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "编写或编辑 .scratch/first/spec.md，加入非空的 # 标题。 Repo parser 原文",
  );
  expect(screen.getByText("spec.md 存在且可解析")).toBeInTheDocument();
});

test.each([
  [
    "en",
    "The GitHub parent issue body is empty",
    "Edit parent issue on GitHub",
    "Refresh GitHub evidence",
  ],
  ["zh-CN", "GitHub 父 Issue 的正文为空", "在 GitHub 上编辑父 Issue", "刷新 GitHub 证据"],
])(
  "empty GitHub Spec offers an issue link and refresh in %s",
  (language, reason, link, refresh) => {
    localStorage.setItem(languageStorageKey, language);
    const item = project("spec").workItems[0];
    item.spec = null;
    item.github = {
      repository: "a/b",
      repositoryId: "R",
      issueId: "I",
      number: 1,
      url: "https://github.com/a/b/issues/1",
      complete: true,
      reviewDigest: "digest",
      reviewHead: "head",
    };
    item.stages.clarify = { approved: { remoteState: "current" } };
    item.stints = [{ ...stint, stage: "spec", ticket: null }];
    render(
      <LanguageProvider>
        <GateView item={item} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(reason);
    expect(screen.getByRole("link", { name: link })).toHaveAttribute("href", item.github.url);
    expect(screen.getByRole("link", { name: link })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: link })).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByRole("button", { name: refresh })).toBeEnabled();
    expect(screen.queryByText(/\.scratch\/github-1\/spec\.md/)).not.toBeInTheDocument();
  },
);

function reviewItem() {
  const item = project("review").workItems[0];
  item.headCommit = "head";
  item.riskyPaths = [];
  item.evidenceChangedPaths = { reviewed: [".scratch/first/review.yaml"] };
  item.stints = [{ ...stint, stage: "review", findings: { commit: "reviewed", findings: [] } }];
  item.checkCommands = [{ name: "Test", command: "node test.cjs" }];
  item.checks = [
    {
      ...item.checkCommands[0],
      status: "passed",
      commit: "reviewed",
      durationMs: 1,
      outputExcerpt: "OK",
    },
  ];
  return item;
}

test("risky branch files block the Review condition with a removal or acceptance action", () => {
  const item = reviewItem();
  item.riskyPaths = [{ path: ".env", reasons: ["likely-secret"], blob: "a".repeat(40) }];
  render(<GateView item={item} />);
  const condition = screen.getByText("No risky files on the branch").closest("li") as HTMLElement;
  expect(condition).toHaveTextContent("Blocked");
  expect(condition).toHaveTextContent("follow-up commit");
  expect(condition).toHaveTextContent("Accept each path with a reason");
  expect(screen.getByRole("button", { name: "Approve Review" })).toBeDisabled();
});

test("Review lists every evidence condition with state and an actionable remedy", () => {
  const item = reviewItem();
  item.stints[0].findings = {
    commit: "reviewed",
    findings: [
      {
        id: "finding",
        axis: "Spec",
        severity: "major",
        path: "src/file.ts",
        line: 1,
        title: "Fix input",
        body: "Bound input.",
      },
    ],
  };
  item.checks = [];
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
  render(<GateView item={item} />);
  const conditions = within(screen.getByRole("list", { name: "Review gate conditions" }));
  expect(conditions.getAllByRole("listitem")).toHaveLength(6);
  expect(screen.getByRole("progressbar", { name: "Review gate conditions" })).toHaveAttribute(
    "aria-valuemax",
    "6",
  );
  expect(screen.getByRole("progressbar", { name: "Review gate conditions" })).not.toHaveAttribute(
    "aria-valuenow",
    "6",
  );
  expect(conditions.getByText("Latest Review stint finished").closest("li")).toHaveTextContent(
    "Ready",
  );
  expect(
    conditions.getByText("Every finding resolved or accepted").closest("li"),
  ).toHaveTextContent("Blocked");
  expect(conditions.getByText("Every configured check passing").closest("li")).toHaveTextContent(
    "Blocked",
  );
  expect(conditions.getByText("No stale evidence").closest("li")).toHaveTextContent("Blocked");
  expect(conditions.getByText("No open memory proposals").closest("li")).toHaveTextContent(
    "Blocked",
  );
  expect(conditions.getByText(/Resolve or accept each current finding/)).toBeInTheDocument();
  expect(conditions.getByText(/Run all configured checks/)).toBeInTheDocument();
  expect(conditions.getByText(/Start a new Review stint and rerun checks/)).toBeInTheDocument();
  expect(conditions.getByText(/Accept or reject every open memory proposal/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve Review" })).toBeDisabled();
});

test("fresh bookkeeping evidence enables Review approval, but the server's refusal is shown", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response('{"reason":"Review evidence became stale"}', { status: 409 }),
      ),
  );
  render(<GateView item={reviewItem()} />);
  const conditions = within(screen.getByRole("list", { name: "Review gate conditions" }));
  expect(conditions.getAllByText("No action needed.")).toHaveLength(6);
  expect(screen.getByRole("progressbar", { name: "Review gate conditions" })).toHaveAttribute(
    "aria-valuenow",
    "6",
  );
  const approve = screen.getByRole("button", { name: "Approve Review" });
  expect(approve).toBeEnabled();
  await user.click(approve);
  expect(fetch).toHaveBeenCalledWith(
    "/api/work-items/first/gates/review/approve",
    expect.objectContaining({ method: "POST" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Review evidence became stale");
  expect(screen.queryByText(/Gate approved/)).not.toBeInTheDocument();
});

test("gate evidence shows tickets, last checkpoint, handoff and open warnings in the drawer", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"agents":[]}')));
  const item = project().workItems[0];
  item.stints = [stint];
  render(
    <WorkItemDrawer
      item={item}
      warnings={[{ path: ".scratch/first/spec.md", message: "Spec needs attention" }]}
      onClose={() => {}}
    />,
  );
  const gate = within(screen.getByRole("region", { name: "Implement gate" }));
  expect(gate.getByText("1/1 tickets resolved")).toBeInTheDocument();
  expect(gate.getByText("01 · First ticket · Resolved")).toBeInTheDocument();
  expect(gate.getAllByText("evidence-checkpoint").length).toBeGreaterThan(0);
  expect(gate.getByText("All edits checkpointed")).toBeInTheDocument();
  expect(gate.getByText("Confirm the output")).toBeInTheDocument();
  expect(gate.getByText("Spec needs attention")).toBeInTheDocument();
  expect(gate.getByRole("button", { name: "Approve Implement" })).toBeEnabled();
});

test.each([
  ["en", "Mark resolved", "Confirm resolution"],
  ["zh-CN", "标记为已解决", "确认解决"],
])("last handoff offers resolution in %s", async (language, label, confirmation) => {
  localStorage.setItem(languageStorageKey, language);
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const item = project().workItems[0];
  item.stints = [stint];
  render(
    <LanguageProvider>
      <GateView item={item} />
    </LanguageProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: label }));
  expect(fetch).not.toHaveBeenCalled();
  await userEvent.click(
    within(screen.getByRole("dialog", { name: confirmation })).getByRole("button", {
      name: confirmation,
    }),
  );
  expect(fetch).toHaveBeenCalledWith(
    "/api/stints/finished-stint/resolve-handoff",
    expect.objectContaining({ method: "POST" }),
  );
});

test("changing the last handoff resets its draft and resolution confirmation", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetcher);
  const item = project().workItems[0];
  item.stints = [stint];
  const { rerender } = render(<GateView item={item} />);
  await user.type(screen.getByRole("textbox", { name: /developer note/i }), "Earlier note");
  await user.click(screen.getByRole("button", { name: "Mark resolved" }));
  expect(screen.getByRole("dialog", { name: "Confirm resolution" })).toBeInTheDocument();

  const later = {
    ...stint,
    id: "later-stint",
    handoff: stint.handoff && { ...stint.handoff, stint: "later-stint" },
  };
  rerender(<GateView item={{ ...item, stints: [later, stint] }} />);
  expect(screen.queryByRole("dialog", { name: "Confirm resolution" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /developer note/i })).toHaveValue("");
  expect(screen.getByRole("button", { name: "Save developer note" })).toBeDisabled();
  expect(fetcher).not.toHaveBeenCalled();
  await user.type(screen.getByRole("textbox", { name: /developer note/i }), "New note");
  await user.click(screen.getByRole("button", { name: "Save developer note" }));
  expect(fetcher).toHaveBeenCalledWith(
    "/api/stints/later-stint/handoff-answer",
    expect.objectContaining({ body: JSON.stringify({ note: "New note" }) }),
  );
});

test("approving sends the action once and waits for acknowledgement", async () => {
  const user = userEvent.setup();
  let complete: (response: Response) => void = () => {};
  const fetchAction = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetchAction);
  render(<GateView item={project().workItems[0]} />);
  await user.click(screen.getByRole("button", { name: "Approve Implement" }));
  expect(fetchAction).toHaveBeenCalledWith(
    "/api/work-items/first/gates/implement/approve",
    expect.objectContaining({ method: "POST", body: "{}" }),
  );
  const pending = screen.getByRole("button", { name: "Approve Implement" });
  expect(pending).toBeDisabled();
  expect(pending).toHaveAttribute("aria-busy", "true");
  expect(pending).toHaveTextContent("Approving…");
  expect(screen.queryByText(/Gate approved/)).not.toBeInTheDocument();
  complete(new Response('{"stage":"review"}'));
  expect(await screen.findByText("Gate approved. Stage advances to Review.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Approve Implement" }));
  expect(fetchAction).toHaveBeenCalledTimes(1);
});

test("reopen sends the approved earlier stage and shows confirmation", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"stage":"implement"}')));
  render(<GateView item={project("review", true).workItems[0]} />);
  await user.click(screen.getByRole("button", { name: "Reopen Implement" }));
  expect(fetch).toHaveBeenCalledWith(
    "/api/work-items/first/gates/implement/reopen",
    expect.objectContaining({ method: "POST", body: "{}" }),
  );
  expect(await screen.findByText("Implement reopened.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reopen Spec" })).not.toBeInTheDocument();
});

test.each(["approve", "reopen"])(
  "%s refusal is shown and the action can be retried",
  async (action) => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ reason: "A stint is running on this work item." }), {
          status: 409,
        }),
      ),
    );
    render(
      <GateView
        item={
          project(action === "approve" ? "implement" : "review", action === "reopen").workItems[0]
        }
      />,
    );
    const button = screen.getByRole("button", {
      name: action === "approve" ? "Approve Implement" : "Reopen Implement",
    });
    await user.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A stint is running on this work item.",
    );
    expect(button).toBeEnabled();
  },
);

test("in-progress evidence disables approval and explains the refusal", () => {
  const item = project().workItems[0];
  item.stints = [{ ...stint, status: "running", handoff: null, checkpointCommit: null }];
  render(<GateView item={item} />);
  expect(screen.getByText(/stint is running/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve Implement" })).toBeDisabled();
  expect(screen.getByText("No handoff recorded.")).toBeInTheDocument();
  expect(screen.getByText("No open warnings.")).toBeInTheDocument();
});

test("the Needs-you gate item contains evidence and an approval action", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"stage":"review"}')));
  render(<Board snapshot={project()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  const queue = within(screen.getByRole("dialog", { name: "Needs you 1" }));
  expect(queue.getByText("Implement ready to approve")).toBeInTheDocument();
  expect(queue.getByText("1/1 tickets resolved")).toBeInTheDocument();
  expect(queue.getByText("No readiness time recorded")).toBeInTheDocument();
  await user.click(queue.getByRole("button", { name: "Approve Implement" }));
  expect(await queue.findByText("Gate approved. Stage advances to Review.")).toBeInTheDocument();
});

test("approval and reopen snapshots move the board card between Implement and Review", () => {
  const snapshot = project();
  const { rerender } = render(<Board snapshot={snapshot} />);
  const card = () => screen.getByRole("article", { name: "first: First work item" });
  expect(card().closest("[data-card-column]")).toHaveAttribute("data-card-column", "implement");
  rerender(<Board snapshot={project("review", true)} />);
  expect(card().closest("[data-card-column]")).toHaveAttribute("data-card-column", "review");
  rerender(<Board snapshot={snapshot} />);
  expect(card().closest("[data-card-column]")).toHaveAttribute("data-card-column", "implement");
});

test.each([
  ["spec", "Spec", "spec.md exists and parses", ".scratch/first/spec.md"],
  [
    "tickets",
    "Tickets",
    "At least one ticket, no ticket warnings, valid dependency order",
    ".scratch/first/issues/",
  ],
])(
  "%s lists its output condition, state and action alongside the stage evidence",
  (stage, name, label, path) => {
    const snapshot = project(stage);
    const item = snapshot.workItems[0];
    item.stints = [{ ...stint, stage, ticket: null }];
    const valid = { ...item };
    if (stage === "spec") item.spec = null;
    else item.tickets = [];
    const { rerender } = render(<GateView item={item} />);
    const conditions = within(screen.getByRole("list", { name: `${name} gate conditions` }));
    expect(conditions.getByText(label).closest("li")).toHaveTextContent("Blocked");
    expect(
      conditions.getByText(new RegExp(`Write or ${stage === "spec" ? "edit" : "fix"}`)),
    ).toHaveTextContent(path);
    expect(screen.getByRole("button", { name: `Approve ${name}` })).toBeDisabled();
    rerender(<GateView item={valid} />);
    expect(conditions.getByText(label).closest("li")).toHaveTextContent("Ready");
    expect(conditions.getByText("No action needed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Approve ${name}` })).toBeEnabled();
  },
);

test("the Needs-you gate uses the workflow's customised gate kind", async () => {
  const snapshot = project("implement");
  const definition = snapshot.workflows.feature;
  snapshot.workflows = {
    ...snapshot.workflows,
    feature: {
      ...definition,
      stages: definition.stages.map((stage) =>
        stage.id === "implement" ? { ...stage, gate: "spec" as const } : stage,
      ),
    },
  };
  snapshot.workItems[0].stints = [
    { ...stint, handoff: stint.handoff ? { ...stint.handoff, unresolved: "None" } : null },
  ];
  snapshot.workItems[0].tickets[0].resolved = false;
  snapshot.attentionItems = deriveAttentionItems(snapshot);
  render(<Board snapshot={snapshot} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Needs you 1" }));
  const queue = within(screen.getByRole("dialog", { name: "Needs you 1" }));
  expect(queue.getByText("spec.md exists and parses").closest("li")).toHaveTextContent("Ready");
  expect(queue.getByRole("button", { name: "Approve Implement" })).toBeEnabled();
});

test.each([
  ["spec", "Spec", ".scratch/first/spec.md"],
  ["tickets", "Tickets", ".scratch/first/issues/"],
])("%s output in another folder leaves the gate naming the expected path", (stage, name, path) => {
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".scratch/first/workflow.yaml": `workflow: feature\nstage: ${stage}\n`,
      ".scratch/wrong/spec.md": "# Wrong folder",
      ".scratch/wrong/issues/01-first.md": "# First\nStatus: ready-for-agent\nBlocked by: none",
    }),
    { name: "Test" },
  );
  const item = snapshot.workItems.find(({ slug }) => slug === "first");
  expect(item).toBeDefined();
  if (!item) throw new Error("Fixture work item is missing.");
  item.stints = [{ ...stint, stage, ticket: null }];
  render(<GateView item={item} />);
  expect(screen.getByRole("status")).toHaveTextContent(path);
  expect(screen.getByRole("list", { name: `${name} gate conditions` })).toHaveTextContent(path);
  expect(screen.getByRole("button", { name: `Approve ${name}` })).toBeDisabled();
});

for (const language of ["en", "zh-CN"] as const) {
  test(`${language} GitHub Spec gate enables approval with current prior evidence`, () => {
    localStorage.setItem(languageStorageKey, language);
    const item = project("spec").workItems[0];
    item.stints = [{ ...stint, stage: "spec", ticket: null }];
    item.stages = { clarify: { approved: { remoteState: "current" } } };
    item.github = {
      repository: "Example/Project",
      repositoryId: "R",
      issueId: "I",
      number: 1,
      url: "https://github.com/Example/Project/issues/1",
      complete: true,
      reviewDigest: "digest",
      reviewHead: "head",
    };
    render(
      <LanguageProvider>
        <GateView item={item} />
      </LanguageProvider>,
    );
    expect(
      screen.getByRole("button", { name: language === "en" ? "Approve Spec" : "批准规格说明" }),
    ).toBeEnabled();
  });
  test.each(["current", "stale", "unknown"] as const)(
    `${language} GitHub approval sends reviewed evidence and shows %s`,
    async (state) => {
      localStorage.setItem(languageStorageKey, language);
      const item = project().workItems[0];
      for (const stage of ["clarify", "spec", "tickets"])
        item.stages[stage] = { approved: { remoteState: "current" } };
      item.github = {
        repository: "Example/Project",
        repositoryId: "R",
        issueId: "I",
        number: 1,
        url: "https://github.com/Example/Project/issues/1",
        complete: true,
        reviewDigest: "digest",
        reviewHead: "head",
      };
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ approval: state }), { status: 200 }));
      vi.stubGlobal("fetch", fetcher);
      render(
        <LanguageProvider>
          <GateView item={item} />
        </LanguageProvider>,
      );
      const button = screen.getByRole("button", {
        name: language === "en" ? "Approve Implement" : "批准实现",
      });
      expect(button).toBeEnabled();
      await userEvent.click(button);
      expect(fetcher).toHaveBeenCalledWith(
        "/api/github/items/1/gates/approve",
        expect.objectContaining({
          body: JSON.stringify({
            stage: "implement",
            reviewedDigest: "digest",
            reviewedHead: "head",
          }),
        }),
      );
      expect(
        screen.getByText(
          (language === "en"
            ? {
                current: "Approval is current.",
                stale: "Approval is stale; GitHub evidence changed.",
                unknown: "Approval status is unknown; GitHub evidence is unavailable.",
              }
            : {
                current: "批准仍然有效。",
                stale: "GitHub 证据已变化，批准已过期。",
                unknown: "无法获取 GitHub 证据，批准状态未知。",
              })[state],
        ),
      ).toBeInTheDocument();
    },
  );
  test(`${language} GitHub gate explains unavailable evidence`, () => {
    localStorage.setItem(languageStorageKey, language);
    const item = project().workItems[0];
    item.github = {
      repository: "Example/Project",
      repositoryId: "R",
      issueId: "I",
      number: 1,
      url: "https://github.com/Example/Project/issues/1",
      complete: false,
    };
    render(
      <LanguageProvider>
        <GateView item={item} />
      </LanguageProvider>,
    );
    expect(
      screen.getByRole("button", { name: language === "en" ? "Approve Implement" : "批准实现" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        language === "en"
          ? "Refresh complete GitHub evidence before approving."
          : "批准前请刷新 GitHub 证据，获取完整信息。",
      ),
    ).toBeInTheDocument();
  });
  test.each(["detail-unavailable", "evidence-changed", "head-changed"] as const)(
    `${language} GitHub gate offers refresh after %s`,
    async (code) => {
      localStorage.setItem(languageStorageKey, language);
      const item = project().workItems[0];
      for (const stage of ["clarify", "spec", "tickets"])
        item.stages[stage] = { approved: { remoteState: "current" } };
      item.github = {
        repository: "Example/Project",
        repositoryId: "R",
        issueId: "I",
        number: 1,
        url: "https://github.com/Example/Project/issues/1",
        complete: true,
        reviewDigest: "digest",
        reviewHead: "head",
      };
      const codes = {
        "detail-unavailable": "gate.detailUnavailable",
        "evidence-changed": "gate.evidenceChanged",
        "head-changed": "gate.headChanged",
      } as const;
      const { coreText, coreTextWire } = await import("@stintwork/core");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify(
              coreTextWire({
                code,
                reason: coreText({ code: codes[code as keyof typeof codes] }),
              }),
            ),
            { status: 409 },
          ),
        ),
      );
      render(
        <LanguageProvider>
          <GateView item={item} />
        </LanguageProvider>,
      );
      await userEvent.click(
        screen.getByRole("button", { name: language === "en" ? "Approve Implement" : "批准实现" }),
      );
      expect(screen.getByRole("alert")).toHaveTextContent(
        language === "en"
          ? {
              "detail-unavailable": "Complete GitHub evidence is unavailable.",
              "evidence-changed": "GitHub evidence changed since review.",
              "head-changed": "The worktree HEAD changed since review.",
            }[code]
          : {
              "detail-unavailable": "无法获取完整的 GitHub 证据。",
              "evidence-changed": "GitHub 证据在审阅后发生了变化。",
              "head-changed": "工作树 HEAD 在审阅后发生了变化。",
            }[code],
      );
      expect(
        screen.getByRole("button", {
          name: language === "en" ? "Refresh GitHub evidence" : "刷新 GitHub 证据",
        }),
      ).toBeEnabled();
    },
  );
}

test.each(["en", "zh-CN"] as const)(
  "%s shows stored stale and unknown GitHub approvals",
  (language) => {
    localStorage.setItem(languageStorageKey, language);
    const item = project().workItems[0];
    item.github = {
      repository: "Example/Project",
      repositoryId: "R",
      issueId: "I",
      number: 1,
      url: "https://github.com/Example/Project/issues/1",
      complete: true,
      reviewDigest: "digest",
      reviewHead: "head",
    };
    item.stages = {
      clarify: { approved: { remoteState: "stale" } },
      spec: { approved: { remoteState: "unknown" } },
    };
    render(
      <LanguageProvider>
        <GateView item={item} />
      </LanguageProvider>,
    );
    expect(
      screen.getByText(
        language === "en"
          ? /Approval is stale; GitHub evidence changed/
          : /GitHub 证据已变化，批准已过期/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        language === "en" ? /Approval status is unknown/ : /无法获取 GitHub 证据，批准状态未知/,
      ),
    ).toBeInTheDocument();
  },
);

test.each([
  [
    "en",
    "Approve Implement",
    "Gate approved, but HEAD changed while the approval was recorded. The approval is stale; reopen Implement to review the newer commits.",
  ],
  [
    "zh-CN",
    "批准实现",
    "关卡已批准，但记录批准时 HEAD 已变化。批准已过期；请重新开启实现以审查较新的提交。",
  ],
])(
  "local stale approve response shows the head-changed message (%s)",
  async (language, button, message) => {
    localStorage.setItem(languageStorageKey, language);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ stage: "review", approval: "stale", reason: "head-changed" }),
          ),
        ),
    );
    render(
      <LanguageProvider>
        <GateView item={project().workItems[0]} />
      </LanguageProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: button }));
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText("Gate approved. Stage advances to Review.")).not.toBeInTheDocument();
  },
);

test.each([
  [
    "en",
    "Implement: Approval is stale; HEAD changed while it was recorded. Reopen Implement to review the newer commits.",
  ],
  ["zh-CN", "实现: 批准已过期；记录批准时 HEAD 已变化。请重新开启实现以审查较新的提交。"],
])("a projected stale local approval is listed with its stage (%s)", (language, line) => {
  localStorage.setItem(languageStorageKey, language);
  const item = project("review", true).workItems[0];
  const approval = { by: "You", at: "2026-10-09T10:00:00Z", commit: "checkpoint" };
  item.stages.implement = {
    approved: { ...approval, state: "stale", stateReason: "head-changed" },
  };
  const { rerender } = render(
    <LanguageProvider>
      <GateView item={item} />
    </LanguageProvider>,
  );
  expect(screen.getByText(line)).toBeInTheDocument();
  item.stages.implement = { approved: approval };
  rerender(
    <LanguageProvider>
      <GateView item={item} />
    </LanguageProvider>,
  );
  expect(screen.queryByText(line)).not.toBeInTheDocument();
});

test.each([
  [
    "en",
    "Implement: Approval is stale; HEAD changed while it was recorded. Reopen Implement to review the newer commits.",
    "Reopen Implement",
  ],
  [
    "zh-CN",
    "实现: 批准已过期；记录批准时 HEAD 已变化。请重新开启实现以审查较新的提交。",
    "重新开启实现",
  ],
])("local stale approval survives the stage advance (%s)", (language, line, reopen) => {
  localStorage.setItem(languageStorageKey, language);
  const item = project().workItems[0];
  const { rerender } = render(
    <LanguageProvider>
      <GateView key={item.stage} item={item} />
    </LanguageProvider>,
  );
  const advanced = project("review").workItems[0];
  advanced.stages.implement = {
    approved: {
      by: "You",
      at: "2026-10-09T10:00:00Z",
      commit: "checkpoint",
      state: "stale",
      stateReason: "head-changed",
    },
  };
  rerender(
    <LanguageProvider>
      <GateView key={advanced.stage} item={advanced} />
    </LanguageProvider>,
  );
  expect(screen.getByText(line)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: reopen })).toBeInTheDocument();
});

test("a reopened local stage does not ask to reopen its stale approval again", () => {
  const item = project("implement").workItems[0];
  item.stages.implement = {
    approved: {
      by: "You",
      at: "2026-10-09T10:00:00Z",
      commit: "checkpoint",
      state: "stale",
      stateReason: "head-changed",
    },
    reopened: { by: "You", at: "2026-10-09T10:05:00Z", commit: "later" },
  };
  item.stages.review = { approved: { state: "stale", stateReason: "head-changed" } };
  render(<GateView item={item} />);
  expect(screen.queryByText(/Approval is stale; HEAD changed/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reopen Implement" })).not.toBeInTheDocument();
});

test("local gate keeps its original request and confirmation", async () => {
  const success = vi.spyOn(toast, "success");
  const item = project().workItems[0];
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ stage: "review" }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  render(<GateView item={item} />);
  await userEvent.click(screen.getByRole("button", { name: "Approve Implement" }));
  expect(fetcher).toHaveBeenCalledWith(
    "/api/work-items/first/gates/implement/approve",
    expect.objectContaining({ body: "{}" }),
  );
  expect(screen.getByText("Gate approved. Stage advances to Review.")).toBeInTheDocument();
  expect(success).toHaveBeenCalledWith("Gate updated.");
  success.mockRestore();
});

test("GitHub refresh recovery requests fresh detail", async () => {
  const item = project().workItems[0];
  item.github = {
    repository: "Example/Project",
    repositoryId: "R",
    issueId: "I",
    number: 1,
    url: "https://github.com/Example/Project/issues/1",
    complete: false,
  };
  const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  render(<GateView item={item} />);
  await userEvent.click(screen.getByRole("button", { name: "Refresh GitHub evidence" }));
  expect(fetcher).toHaveBeenCalledWith("/api/github/items/1/refresh", { method: "POST" });
});

test("GitHub refresh failure re-enables the action", async () => {
  const item = project().workItems[0];
  item.github = {
    repository: "Example/Project",
    repositoryId: "R",
    issueId: "I",
    number: 1,
    url: "https://github.com/Example/Project/issues/1",
    complete: false,
  };
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failure")));
  render(<GateView item={item} />);
  const button = screen.getByRole("button", { name: "Refresh GitHub evidence" });
  await userEvent.click(button);
  expect(screen.getByRole("alert")).toHaveTextContent("Network failure");
  expect(button).toBeEnabled();
});

test("gate ticket numbers distinguish GitHub and Markdown", () => {
  const item = project().workItems[0];
  const { rerender } = render(<GateView item={item} />);
  expect(screen.getByText(/01 · First ticket/)).toBeInTheDocument();
  item.github = {
    repository: "a/b",
    repositoryId: "R",
    issueId: "I",
    number: 1,
    url: "https://github.com/a/b/issues/1",
    complete: true,
  };
  rerender(<GateView item={item} />);
  expect(screen.getByText(/#1 · First ticket/)).toBeInTheDocument();
});
