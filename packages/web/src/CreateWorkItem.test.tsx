// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Board } from "./Board";

const contents = {
  ".stintwork/roadmap.md": "## First\nId: first\nStatus: active\n",
  ".stintwork/workflows/team.yaml": JSON.stringify({
    id: "team",
    name: "Team workflow",
    defaultAgent: "codex",
    stages: [
      { id: "design", name: "Design", column: "spec", skill: "/design", gate: "manual" },
      { id: "deliver", name: "Deliver", column: "ship", skill: null, gate: "merge" },
    ],
  }),
};
const snapshot = () => indexProject(createMemoryRepoFiles(contents), { name: "Fixture" });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function fetcher() {
  const fetch = vi.fn(async (path: string) =>
    response(
      path.endsWith("/preview")
        ? { slug: "server-preview" }
        : { slug: "server-preview", commit: "a".repeat(40) },
      path.endsWith("/preview") ? 200 : 201,
    ),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

test.each(["c", "palette", "button"])(
  "opens the create dialog from %s with title focus and keyboard dismissal",
  async (entry) => {
    const user = userEvent.setup();
    const fetch = fetcher();
    render(<Board snapshot={snapshot()} />);
    if (entry === "c") await user.keyboard("c");
    if (entry === "palette") {
      fireEvent.keyDown(document.body, { key: "k", metaKey: true });
      await user.type(
        screen.getByRole("combobox", { name: "Search work items and milestones" }),
        "Create work item",
      );
      await user.click(screen.getByRole("option", { name: "Create work item" }));
      expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
    }
    if (entry === "button")
      await user.click(screen.getByRole("button", { name: "Create work item" }));
    const dialog = screen.getByRole("dialog", { name: "Create work item" });
    expect(within(dialog).getByRole("textbox", { name: "Title" })).toHaveFocus();
    expect(within(dialog).getByRole("button", { name: "Create work item" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Create work item" })).not.toBeInTheDocument();
  },
);

test("previews on the server, offers all loaded workflows and submits optional milestone and intent", async () => {
  const user = userEvent.setup();
  const fetch = fetcher();
  const rendered = render(<Board snapshot={snapshot()} />);
  await user.keyboard("c");
  const dialog = within(screen.getByRole("dialog", { name: "Create work item" }));
  expect(dialog.getAllByRole("option").map((entry) => entry.textContent)).toEqual(
    expect.arrayContaining(["Feature", "Bug", "Quick", "Team workflow", "No milestone", "First"]),
  );
  await user.type(dialog.getByRole("textbox", { name: "Title" }), "New Idea");
  await user.selectOptions(dialog.getByRole("combobox", { name: "Workflow" }), "team");
  await user.selectOptions(dialog.getByRole("combobox", { name: "Milestone (optional)" }), "first");
  await user.type(
    dialog.getByRole("textbox", { name: "Intent (optional)" }),
    "Keep the current look.",
  );
  expect(await dialog.findByText(".scratch/server-preview/")).toBeInTheDocument();
  const input = {
    title: "New Idea",
    workflow: "team",
    milestone: "first",
    intent: "Keep the current look.",
  };
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/work-items/preview",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify(input),
      signal: expect.any(AbortSignal),
    }),
  );
  await user.click(dialog.getByRole("button", { name: "Create work item" }));
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/work-items",
    expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Create work item" })).not.toBeInTheDocument(),
  );
  rendered.rerender(
    <Board
      snapshot={indexProject(
        createMemoryRepoFiles({
          ...contents,
          ".scratch/server-preview/workflow.yaml":
            "title: New Idea\nworkflow: team\nstage: design\n",
        }),
        { name: "Fixture" },
      )}
    />,
  );
  expect(
    within(screen.getByRole("region", { name: "Spec" })).getByRole("article", {
      name: "server-preview: New Idea",
    }),
  ).toBeInTheDocument();
});

test.each([
  "Work item idea already exists.",
  "Title must produce a valid ASCII work item slug.",
  "Commit or discard hand edits to the creation paths first.",
])("shows a preview refusal and disables confirmation: %s", async (reason) => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response({ reason }, 409)),
  );
  render(<Board snapshot={snapshot()} />);
  await user.keyboard("c");
  const dialog = within(screen.getByRole("dialog", { name: "Create work item" }));
  await user.type(dialog.getByRole("textbox", { name: "Title" }), "Idea");
  expect(await dialog.findByRole("alert")).toHaveTextContent(reason);
  expect(dialog.getByRole("button", { name: "Create work item" })).toBeDisabled();
});

test("a confirmation refusal keeps entered fields and allows retry or cancel", async () => {
  const user = userEvent.setup();
  const fetch = vi.fn(async (path: string) =>
    response(
      path.endsWith("/preview") ? { slug: "idea" } : { reason: "Work item idea already exists." },
      path.endsWith("/preview") ? 200 : 409,
    ),
  );
  vi.stubGlobal("fetch", fetch);
  render(<Board snapshot={snapshot()} />);
  await user.keyboard("c");
  const dialog = within(screen.getByRole("dialog", { name: "Create work item" }));
  await user.type(dialog.getByRole("textbox", { name: "Title" }), "Idea");
  await dialog.findByText(".scratch/idea/");
  await user.click(dialog.getByRole("button", { name: "Create work item" }));
  expect(await dialog.findByRole("alert")).toHaveTextContent("already exists");
  expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue("Idea");
  expect(dialog.getByRole("button", { name: "Create work item" })).toBeEnabled();
  await user.click(dialog.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog", { name: "Create work item" })).not.toBeInTheDocument();
});

test("c does not intercept text inputs, editable content, other dialogs or modified shortcuts", async () => {
  const user = userEvent.setup();
  fetcher();
  render(<Board snapshot={snapshot()} />);
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    fireEvent.keyDown(document.body, { key: "c", ...modifiers });
    expect(screen.queryByRole("dialog", { name: "Create work item" })).not.toBeInTheDocument();
  }
  const editable = document.createElement("div");
  editable.setAttribute("contenteditable", "true");
  document.body.append(editable);
  fireEvent.keyDown(editable, { key: "c" });
  expect(screen.queryByRole("dialog", { name: "Create work item" })).not.toBeInTheDocument();
  editable.remove();
  await user.click(screen.getByRole("button", { name: "Edit roadmap" }));
  await user.type(screen.getByRole("textbox", { name: "New milestone name" }), "c");
  expect(screen.queryByRole("dialog", { name: "Create work item" })).not.toBeInTheDocument();
});

test("stale previews cannot enable confirmation for a newer title", async () => {
  const user = userEvent.setup();
  const pending: ((value: Response) => void)[] = [];
  const fetch = vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));
  vi.stubGlobal("fetch", fetch);
  render(<Board snapshot={snapshot()} />);
  await user.keyboard("c");
  const dialog = within(screen.getByRole("dialog", { name: "Create work item" }));
  const title = dialog.getByRole("textbox", { name: "Title" });
  await user.type(title, "Old");
  await waitFor(() => expect(pending).toHaveLength(1));
  await user.clear(title);
  await user.type(title, "New");
  await waitFor(() => expect(pending).toHaveLength(2));
  await act(async () => pending[0](response({ slug: "old" })));
  expect(dialog.getByRole("button", { name: "Create work item" })).toBeDisabled();
  expect(dialog.queryByText(".scratch/old/")).not.toBeInTheDocument();
  await act(async () => pending[1](response({ slug: "new" })));
  expect(await dialog.findByText(".scratch/new/")).toBeInTheDocument();
  expect(dialog.getByRole("button", { name: "Create work item" })).toBeEnabled();
});
