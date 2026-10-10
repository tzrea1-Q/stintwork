import {
  builtInWorkflows,
  compileBrief,
  createMemoryRepoFiles,
  indexProject,
} from "@stintwork/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { StageAgentRail } from "./StageAgentRail";
import { WorkItemDrawer } from "./WorkItemDrawer";
import { codexProfile, claudeProfile, grokProfile } from "../../agents/src/profiles";

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
    availability: { available: false, reason: "Authentication required. Use grok login." },
  },
];
afterEach(() => vi.unstubAllGlobals());

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
  await within(picker).findByRole("option", { name: "Claude Code" });
  expect(picker).toHaveValue("claude");
  expect(screen.getAllByRole("combobox")).toHaveLength(builtInWorkflows.feature.stages.length);
  const review = screen.getByRole("combobox", { name: "Review agent" });
  expect(review).toHaveValue("codex");
  expect(within(review).getByRole("option", { name: /Grok Build.*grok login/ })).toBeDisabled();
  await user.selectOptions(review, "claude");
  expect(fetch).toHaveBeenLastCalledWith("/api/work-items/first/stages/review/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: "claude" }),
  });
  expect(review).toHaveValue("claude");
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
  await within(picker).findByRole("option", { name: "Claude Code" });
  await userEvent.setup().selectOptions(picker, "codex");
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not commit workflow.yaml.");
  expect(picker).toHaveValue("claude");
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
  await within(picker).findByRole("option", { name: "Claude Code" });
  await userEvent.setup().selectOptions(picker, "claude");
  expect(picker).toHaveValue("claude");
  rerender(
    <StageAgentRail item={{ ...item, stages: { ...item.stages, review: { agent: "codex" } } }} />,
  );
  expect(picker).toHaveValue("codex");
});

test("an unregistered stage agent remains visible instead of silently selecting another agent", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ agents }))),
  );
  render(<StageAgentRail item={{ ...item, stages: { implement: { agent: "removed" } } }} />);
  expect(await screen.findByRole("option", { name: "removed — Not registered" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "Implement agent" })).toHaveValue("removed");
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
  await sheet.findByRole("option", { name: "Claude Code" });
  expect(sheet.getByRole("combobox", { name: "Agent" })).toHaveValue("claude");
  expect(sheet.getByRole("option", { name: /Grok Build.*grok login/ })).toBeDisabled();
  await user.click(sheet.getByRole("button", { name: "Start" }));
  expect(fetch).toHaveBeenLastCalledWith("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  await sheet.findByRole("option", { name: "Claude Code" });
  expect(sheet.getByRole("button", { name: "Start" })).toBeDisabled();
  expect(sheet.getByText("Authentication required. Use grok login.")).toBeVisible();
});
