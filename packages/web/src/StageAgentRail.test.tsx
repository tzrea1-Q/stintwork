// SPDX-License-Identifier: Apache-2.0

import {
  applyStintLogEntry,
  builtInWorkflows,
  compileBrief,
  createMemoryRepoFiles,
  indexProject,
  type Stint,
} from "@stintwork/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  antigravityProfile,
  claudeProfile,
  codexProfile,
  grokProfile,
} from "../../agents/src/profiles";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { StageAgentRail } from "./StageAgentRail";
import { chooseOption } from "./select-test-helper";
import { Sheet, SheetContent, SheetTitle } from "./ui/Sheet";
import { WorkItemDrawer } from "./WorkItemDrawer";

const item = indexProject(
  createMemoryRepoFiles({
    ".scratch/first/spec.md": "# First",
    ".scratch/first/issues/01-first.md": "# First\nStatus: ready-for-agent\nBlocked by: none",
    ".scratch/first/workflow.yaml":
      "workflow: feature\nstage: implement\nstages:\n  implement:\n    agent: claude\n",
  }),
  { name: "Project" },
).workItems[0];
const agents = [
  codexProfile,
  claudeProfile,
  {
    ...grokProfile,
    id: "grok",
    displayName: "Grok Build",
    availability: {
      available: false,
      reason: { text: "Authentication required. Use grok login." },
    },
  },
];
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem(languageStorageKey);
});

test.each([200, 503])(
  "a stage picker returns focus after its pending save settles (%s)",
  async (status) => {
    let finishSave = (_response: Response) => {};
    const pendingSave = new Promise<Response>((resolve) => {
      finishSave = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) =>
        options?.method === "POST" ? pendingSave : new Response(JSON.stringify({ agents })),
      ),
    );
    const user = userEvent.setup();
    render(
      <Sheet defaultOpen>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Work item</SheetTitle>
          <StageAgentRail item={item} />
        </SheetContent>
      </Sheet>,
    );
    const picker = screen.getByRole("combobox", { name: "Review agent" });
    await waitFor(() => expect(picker).toBeEnabled());
    await user.click(picker);
    await user.click(screen.getByRole("option", { name: "Claude Code" }));
    expect(picker).toBeDisabled();
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    finishSave(
      new Response(
        JSON.stringify(status === 200 ? { agent: "claude" } : { reason: "Could not save" }),
        { status },
      ),
    );
    await waitFor(() => expect(picker).toBeEnabled());
    await waitFor(() => expect(picker).toHaveFocus());
  },
);

test("Chinese agent picker translates an internal error and preserves unknown agent diagnostics", async () => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            agents: [
              {
                ...codexProfile,
                availability: {
                  available: false,
                  reason: "Internal error",
                  reasonMessage: { code: "agent.internalError" },
                },
              },
              {
                ...claudeProfile,
                availability: {
                  available: false,
                  reason: "Raw Agent error",
                  reasonMessage: { code: "agent.future" },
                },
              },
            ],
          }),
        ),
    ),
  );
  render(
    <LanguageProvider>
      <StageAgentRail item={item} />
    </LanguageProvider>,
  );
  const picker = screen.getByRole("combobox", { name: "实现 Agent" });
  await waitFor(() => expect(picker).toBeEnabled());
  await userEvent.setup().click(picker);
  expect(await screen.findByRole("option", { name: "Codex — 内部错误" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.getByRole("option", { name: "Claude Code — Raw Agent error" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("the stage rail defaults to workflow agents, honours stage choices, disables unavailable agents with reasons and saves choices", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (_url: string, options?: RequestInit) =>
        new Response(
          JSON.stringify(
            options?.method === "POST"
              ? { agent: JSON.parse(options.body as string).agent }
              : { agents },
          ),
        ),
    ),
  );
  render(<StageAgentRail item={item} />);
  const picker = screen.getByRole("combobox", { name: "Implement agent" });
  await waitFor(() => expect(picker).toHaveTextContent("Claude Code"));
  expect(screen.getAllByRole("combobox")).toHaveLength(builtInWorkflows.feature.stages.length);
  const review = screen.getByRole("combobox", { name: "Review agent" });
  expect(review).toHaveTextContent("Codex");
  await user.click(review);
  expect(screen.getByRole("option", { name: /Grok Build.*grok login/ })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await user.keyboard("{ArrowDown}{Enter}");
  expect(fetch).toHaveBeenLastCalledWith("/api/work-items/first/stages/review/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: "claude" }),
  });
  await waitFor(() => expect(review).toHaveTextContent("Claude Code"));
  expect(review).toHaveFocus();
});

test("failed saves leave the recorded selection visible and expose the server reason", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) =>
      options?.method === "POST"
        ? new Response(JSON.stringify({ reason: "Could not commit workflow.yaml." }), {
            status: 503,
          })
        : new Response(JSON.stringify({ agents })),
    ),
  );
  render(<StageAgentRail item={item} />);
  const picker = screen.getByRole("combobox", { name: "Implement agent" });
  await waitFor(() => expect(picker).toHaveTextContent("Claude Code"));
  await chooseOption(userEvent.setup(), picker, "Codex");
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not commit workflow.yaml.");
  expect(picker).toHaveTextContent("Claude Code");
});

test("live workflow changes replace a saved local selection", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (_url: string, options?: RequestInit) =>
        new Response(JSON.stringify(options?.method === "POST" ? { agent: "claude" } : { agents })),
    ),
  );
  const { rerender } = render(<StageAgentRail item={item} />);
  const picker = screen.getByRole("combobox", { name: "Review agent" });
  await waitFor(() => expect(picker).toBeEnabled());
  await chooseOption(userEvent.setup(), picker, "Claude Code");
  expect(picker).toHaveTextContent("Claude Code");
  rerender(
    <StageAgentRail item={{ ...item, stages: { ...item.stages, review: { agent: "codex" } } }} />,
  );
  expect(picker).toHaveTextContent("Codex");
});

test("an unregistered stage agent remains visible instead of silently selecting another agent", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ agents }))),
  );
  render(<StageAgentRail item={{ ...item, stages: { implement: { agent: "removed" } } }} />);
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Implement agent" })).toHaveTextContent(
      "removed — Not registered",
    ),
  );
  await userEvent.setup().click(screen.getByRole("combobox", { name: "Implement agent" }));
  expect(screen.getByRole("option", { name: "removed — Not registered" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await userEvent.setup().keyboard("{Escape}");
  expect(screen.getByRole("combobox", { name: "Implement agent" })).toHaveTextContent(
    /removed.*Not registered/,
  );
});

test("the brief preview defaults to the persisted stage agent and starts that agent without changing its preference", async () => {
  const brief = {
    ...compileBrief({
      files: createMemoryRepoFiles({}),
      workItem: item,
      stage: builtInWorkflows.feature.stages[3],
      ticket: item.tickets[0],
    }),
    agent: "claude",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url === "/api/agents" ? { agents } : url === "/api/stints" ? { stint: {} } : brief,
          ),
        ),
    ),
  );
  const user = userEvent.setup();
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  const sheet = within(screen.getByRole("dialog", { name: "Brief preview" }));
  await waitFor(() =>
    expect(sheet.getByRole("combobox", { name: "Agent" })).toHaveTextContent("Claude Code"),
  );
  expect(sheet.getByRole("combobox", { name: "Agent" })).toHaveTextContent("Claude Code");
  await user.click(sheet.getByRole("combobox", { name: "Agent" }));
  expect(screen.getByRole("option", { name: /Grok Build.*grok login/ })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await user.keyboard("{Escape}");
  await user.click(sheet.getByRole("button", { name: "Start" }));
  expect(fetch).toHaveBeenLastCalledWith("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    signal: expect.any(AbortSignal),
    body: JSON.stringify({
      workItem: "first",
      ticket: 1,
      agent: "claude",
      permissionLevel: "edit-freely",
    }),
  });
});

test("an unavailable default cannot start a stint and explains how to log in", async () => {
  const brief = {
    ...compileBrief({
      files: createMemoryRepoFiles({}),
      workItem: item,
      stage: builtInWorkflows.feature.stages[3],
      ticket: item.tickets[0],
    }),
    agent: "grok",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(JSON.stringify(url === "/api/agents" ? { agents } : brief)),
    ),
  );
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Start stint" }));
  const sheet = within(screen.getByRole("dialog", { name: "Brief preview" }));
  await sheet.findByRole("heading", { name: "Full prompt" });
  expect(sheet.getByRole("button", { name: "Start" })).toBeDisabled();
  expect(sheet.getByText("Authentication required. Use grok login.")).toBeVisible();
});

test.each([
  ["en", "Implement agent", "Experimental"],
  ["zh-CN", "实现 Agent", "实验性"],
])("%s stage picker marks experimental agents", async (language, name, label) => {
  localStorage.setItem(languageStorageKey, language);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ agents: [codexProfile, grokProfile, antigravityProfile] })),
    ),
  );
  render(
    <LanguageProvider>
      <StageAgentRail item={item} />
    </LanguageProvider>,
  );
  const picker = screen.getByRole("combobox", { name });
  await waitFor(() => expect(picker).toBeEnabled());
  await userEvent.setup().click(picker);
  expect(screen.getByRole("option", { name: `Grok Build (${label})` })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: `Antigravity CLI (${label})` })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Codex" })).toBeInTheDocument();
});

test("the detail renders each stage picker once in its property list and marks the current stage", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ agents }))),
  );
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  const rail = screen.getByRole("list", { name: "Feature workflow stages" });
  expect(rail.closest("dl")).not.toBeNull();
  expect(within(rail).getAllByRole("combobox")).toHaveLength(
    builtInWorkflows.feature.stages.length,
  );
  expect(rail.querySelector('[aria-current="step"]')).toContainElement(
    screen.getByRole("combobox", { name: "Implement agent" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Implement agent" })).toBeEnabled(),
  );
});

test("a starting ticket preview stays mounted when its active stint arrives", async () => {
  const brief = {
    ...compileBrief({
      files: createMemoryRepoFiles({}),
      workItem: item,
      stage: builtInWorkflows.feature.stages[3],
      ticket: item.tickets[0],
    }),
    agent: "claude",
  };
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, options?: RequestInit) => {
      if (url === "/api/stints") {
        signal = options?.signal ?? undefined;
        return new Promise<Response>(() => {});
      }
      return Promise.resolve(
        new Response(JSON.stringify(url === "/api/agents" ? { agents } : brief)),
      );
    }),
  );
  const user = userEvent.setup();
  const view = render(<WorkItemDrawer item={item} onClose={() => {}} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  const preview = within(screen.getByRole("dialog", { name: "Brief preview" }));
  await waitFor(() => expect(preview.getByRole("button", { name: "Start" })).toBeEnabled());
  await user.click(preview.getByRole("button", { name: "Start" }));
  expect(signal?.aborted).toBe(false);
  const activeStint = applyStintLogEntry(null, {
    type: "started",
    at: "2026-10-09T10:00:00Z",
    stint: {
      id: "pending",
      workItem: item.slug,
      stage: "implement",
      ticket: item.tickets[0].number,
      agent: "claude",
      worktree: { path: "/tree", branch: "first" },
      baseCommit: "base",
      brief: { skill: null, pointers: [], lastHandoff: null, changedPaths: [], prompt: "Brief" },
    },
  }) as Stint;
  view.rerender(<WorkItemDrawer item={{ ...item, activeStint }} onClose={() => {}} />);
  expect(screen.getByRole("dialog", { name: "Brief preview" })).toBeInTheDocument();
  expect(signal?.aborted).toBe(false);
  view.unmount();
  expect(signal?.aborted).toBe(true);
});
