import {
  builtInWorkflows,
  compileBrief,
  createMemoryRepoFiles,
  indexProject,
  type Stint,
} from "@stintwork/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { StageBriefPreview } from "./BriefPreview";
import { WorkItemDrawer } from "./WorkItemDrawer";

const files = createMemoryRepoFiles({
  "AGENTS.md": "Conventions",
  ".scratch/planning/workflow.yaml": "workflow: feature\nstage: spec\n",
});
const item = indexProject(files, { name: "Project" }).workItems[0];
const brief = compileBrief({ files, workItem: item, stage: builtInWorkflows.feature.stages[1] });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test.each(["clarify", "spec", "tickets", "implement", "review"] as const)(
  "the %s drawer offers a stage stint even without tickets",
  (stage) => {
    render(<WorkItemDrawer item={{ ...item, stage }} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Start stint" })).toBeEnabled();
  },
);

test("the stage action previews the stage skill, starts with ticket null, and restores focus on Escape", async () => {
  const user = userEvent.setup();
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url === "/api/agents" ? { agents: [{ id: "codex", displayName: "Codex" }] } : brief,
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  const action = screen.getByRole("button", { name: "Start stint" });
  await user.click(action);
  const sheet = within(screen.getByRole("dialog", { name: "Brief preview" }));
  await sheet.findByRole("heading", { name: "Full prompt" });
  expect(sheet.getByText("planning · Spec")).toBeInTheDocument();
  expect(sheet.getByText("/to-spec .scratch/planning/", { selector: "code" })).toBeInTheDocument();
  expect(sheet.getByText(/Working instructions:/, { selector: "pre" })).toHaveTextContent(
    "No spec yet.",
  );
  expect(fetch).toHaveBeenCalledWith(
    "/api/work-items/planning/brief-preview",
    expect.objectContaining({ cache: "no-store" }),
  );
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Brief preview" })).not.toBeInTheDocument();
  expect(action).toHaveFocus();
  await user.click(action);
  const reopened = within(screen.getByRole("dialog", { name: "Brief preview" }));
  await reopened.findByRole("heading", { name: "Full prompt" });
  await user.click(reopened.getByRole("button", { name: "Start" }));
  expect(fetch).toHaveBeenCalledWith(
    "/api/stints",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ workItem: "planning", ticket: null, agent: "codex" }),
    }),
  );
  expect(screen.queryByRole("dialog", { name: "Brief preview" })).not.toBeInTheDocument();
});

test.each([
  {
    stage: "ship" as const,
    workflow: "feature" as const,
    reason: "This stage has no stint skill.",
  },
  { stage: "do" as const, workflow: "quick" as const, reason: "This stage has no stint skill." },
])("the $stage action explains why a stage stint is disabled", ({ stage, workflow, reason }) => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<WorkItemDrawer item={{ ...item, stage, workflow }} onClose={() => {}} />);
  expect(screen.getByRole("button", { name: "Start stint" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Start stint" })).toHaveAccessibleDescription(reason);
  expect(fetch).not.toHaveBeenCalled();
});

test("Fix offers a stage stint when there is no ticket yet", () => {
  render(<WorkItemDrawer item={{ ...item, workflow: "bug", stage: "fix" }} onClose={() => {}} />);
  expect(screen.getByRole("button", { name: "Start stint" })).toBeEnabled();
});

test("an active stint disables the stage action and closes an already-open preview", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  const { rerender } = render(<StageBriefPreview item={item} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  expect(screen.getByRole("dialog", { name: "Brief preview" })).toBeInTheDocument();
  rerender(<StageBriefPreview item={{ ...item, activeStint: { id: "active" } as Stint }} />);
  expect(screen.getByRole("button", { name: "Start stint" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Start stint" })).toHaveAccessibleDescription(
    "A stint is already active for this work item.",
  );
  expect(screen.queryByRole("dialog", { name: "Brief preview" })).not.toBeInTheDocument();
});

test("a stale stage start refusal stays visible in the preview", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url === "/api/agents"
              ? { agents: [{ id: "codex", displayName: "Codex" }] }
              : url === "/api/stints"
                ? { reason: "This stage has no stint skill." }
                : brief,
          ),
          { status: url === "/api/stints" ? 409 : 200 },
        ),
    ),
  );
  render(<StageBriefPreview item={item} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  const sheet = within(screen.getByRole("dialog", { name: "Brief preview" }));
  await sheet.findByRole("heading", { name: "Full prompt" });
  await user.click(sheet.getByRole("button", { name: "Start" }));
  expect(await sheet.findByRole("alert")).toHaveTextContent("This stage has no stint skill.");
});

test("changing stages closes the old preview rather than starting from a stale skill", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  const { rerender } = render(<StageBriefPreview item={item} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  expect(screen.getByRole("dialog", { name: "Brief preview" })).toBeInTheDocument();
  rerender(<StageBriefPreview item={{ ...item, stage: "tickets" }} />);
  expect(screen.queryByRole("dialog", { name: "Brief preview" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start stint" })).toBeEnabled();
});
