import {
  builtInWorkflows,
  compileBrief,
  createMemoryRepoFiles,
  indexProject,
} from "@stintwork/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { WorkItemDrawer } from "./WorkItemDrawer";

const ticketPath = ".scratch/first-stint/issues/02-brief-preview.md";
const specPath = ".scratch/first-stint/spec.md";
const files = createMemoryRepoFiles({
  "AGENTS.md": "Conventions",
  "GLOSSARY.md": "Terms",
  "docs/adr/0001-files.md": "# Files are the source of truth",
  [specPath]: "# The first stint",
  [ticketPath]: "# 02 — Brief preview\nStatus: ready-for-agent\nBlocked by: none",
});
const item = indexProject(files, { name: "Stintwork" }).workItems[0];
const ticket = item.tickets[0];
const agents = [{ id: "codex", displayName: "Codex" }];
const brief = compileBrief({
  files,
  workItem: item,
  stage: builtInWorkflows.feature.stages[3],
  ticket,
});

function previewFetch(preview = brief) {
  return vi.fn(
    async (url: string) =>
      new Response(JSON.stringify(url === "/api/agents" ? { agents } : preview)),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("resume preview shows the checkpoint alongside the handoff and changed spec", async () => {
  const resumed = compileBrief({
    files,
    workItem: item,
    stage: builtInWorkflows.feature.stages[3],
    ticket,
    checkpointCommit: "0123456789abcdef",
    lastHandoff: {
      stint: "previous",
      agent: "codex",
      stoppedAt: "Code written",
      unresolved: "Checks remain",
      nextStep: "Review changes",
    },
    changedPaths: [specPath],
  });
  vi.stubGlobal("fetch", previewFetch(resumed));
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Start stint" }));
  const sheet = within(screen.getByRole("dialog", { name: "Brief preview" }));
  await sheet.findByRole("heading", { name: "Checkpoint commit" });
  expect(sheet.getByText("0123456789abcdef", { selector: "code" })).toBeInTheDocument();
  expect(
    sheet.getByRole("heading", { name: "Last handoff (previous, codex)" }),
  ).toBeInTheDocument();
  expect(sheet.getByText("Checks remain", { selector: "dd" })).toBeInTheDocument();
  const changes = sheet
    .getByRole("heading", { name: "Changed since the last handoff" })
    .closest("section");
  expect(
    within(changes as HTMLElement).getByText(specPath, { selector: "code" }),
  ).toBeInTheDocument();
});

test("opens the drawer's brief sheet, shows every section and copies the exact prompt", async () => {
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const fetch = previewFetch();
  vi.stubGlobal("fetch", fetch);
  render(<WorkItemDrawer item={item} onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  const preview = within(screen.getByRole("dialog", { name: "Brief preview" }));
  await preview.findByRole("heading", { name: "Read first" });
  for (const heading of [
    "Agent",
    "Skill",
    "Read first",
    "Last handoff",
    "Changed since the last handoff",
    "Full prompt",
  ]) {
    expect(preview.getByRole("heading", { name: heading })).toBeInTheDocument();
  }
  for (const pointer of brief.pointers) {
    expect(preview.getByText(pointer.path, { selector: "li code" })).toBeInTheDocument();
    expect(
      preview.getByText(`— ${pointer.reason}`, { exact: false, selector: "li" }),
    ).toBeInTheDocument();
  }
  expect(preview.getByText(`/implement ${ticketPath}`, { selector: "code" })).toBeInTheDocument();
  expect(
    preview.getByText("None — start from the project conventions and work item scope."),
  ).toBeInTheDocument();
  expect(preview.getByText("None.")).toBeInTheDocument();
  expect(
    preview.getByText("Where the handoff and the files disagree, the files win.", {
      selector: "p",
    }),
  ).toBeInTheDocument();
  expect(preview.getByRole("combobox", { name: "Agent" })).toHaveValue("codex");
  expect(preview.getByRole("option", { name: "Codex" })).toBeEnabled();
  expect(preview.getAllByRole("option")).toHaveLength(1);
  expect(preview.getByRole("button", { name: "Start" })).toBeEnabled();
  expect(preview.getByText(/Working instructions:/, { selector: "pre" }).textContent).toBe(
    brief.prompt,
  );
  await user.click(preview.getByRole("button", { name: "Copy prompt" }));
  expect(writeText).toHaveBeenCalledWith(brief.prompt);
  expect(preview.getByRole("status")).toHaveTextContent("Copied");
  expect(fetch).toHaveBeenCalledWith(
    "/api/work-items/first-stint/tickets/2/brief-preview",
    expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
  );
  expect(fetch).toHaveBeenCalledWith(
    "/api/agents",
    expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("blocked and resolved implementation tickets show disabled reasons, and Ship cannot start", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { rerender } = render(
    <WorkItemDrawer
      item={{ ...item, tickets: [{ ...ticket, blocked: true, blockedBy: [1] }] }}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Start stint" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Start stint" })).toHaveAccessibleDescription(
    "Blocked by ticket 01.",
  );
  rerender(
    <WorkItemDrawer
      item={{ ...item, tickets: [{ ...ticket, resolved: true }] }}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Start stint" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Start stint" })).toHaveAccessibleDescription(
    "This ticket is resolved.",
  );
  rerender(<WorkItemDrawer item={{ ...item, stage: "ship" }} onClose={vi.fn()} />);
  for (const action of screen.getAllByRole("button", { name: "Start stint" })) {
    expect(action).toBeDisabled();
    expect(action).toHaveAccessibleDescription("This stage has no stint skill.");
  }
  expect(fetch).not.toHaveBeenCalled();
});

test("Escape closes only the preview and returns focus to Start stint", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", previewFetch());
  const closeDrawer = vi.fn();
  render(<WorkItemDrawer item={item} onClose={closeDrawer} />);
  const start = screen.getByRole("button", { name: "Start stint" });
  await user.click(start);
  await screen.findByRole("heading", { name: "Read first" });
  expect(screen.getByRole("button", { name: "Close brief preview" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Brief preview" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "The first stint" })).toBeInTheDocument();
  expect(start).toHaveFocus();
  expect(closeDrawer).not.toHaveBeenCalled();
});

test("load failures display the server reason without enabling Start", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ reason: "Blocked by ticket 01." }), { status: 409 }),
      ),
  );
  render(<WorkItemDrawer item={item} onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Blocked by ticket 01.");
  expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Copy prompt" })).not.toBeInTheDocument();
});

test("closing during loading cancels the preview request, and a live resolved ticket removes the sheet", async () => {
  const user = userEvent.setup();
  const fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetch);
  const { rerender } = render(<WorkItemDrawer item={item} onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  expect(
    within(screen.getByRole("dialog", { name: "Brief preview" })).getByRole("status"),
  ).toHaveTextContent("Reading the brief…");
  const signal: AbortSignal = fetch.mock.calls[0][1].signal;
  expect(fetch.mock.calls[1][1].signal).toBe(signal);
  fireEvent.click(screen.getByRole("button", { name: "Close brief preview" }));
  expect(signal.aborted).toBe(true);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  rerender(
    <WorkItemDrawer
      item={{ ...item, tickets: [{ ...ticket, resolved: true }] }}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole("dialog", { name: "Brief preview" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start stint" })).toBeDisabled();
  rerender(<WorkItemDrawer item={item} onClose={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Start stint" })).toBeEnabled();
  expect(screen.queryByRole("dialog", { name: "Brief preview" })).not.toBeInTheDocument();
});

test("clipboard failure keeps the full prompt available for manual copying", async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Clipboard denied"));
  vi.stubGlobal("fetch", previewFetch());
  render(<WorkItemDrawer item={item} onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  await user.click(await screen.findByRole("button", { name: "Copy prompt" }));
  await waitFor(() =>
    expect(
      within(screen.getByRole("dialog", { name: "Brief preview" })).getByRole("status"),
    ).toHaveTextContent("Could not copy. Select the prompt to copy it manually."),
  );
  expect(screen.getByText(/Working instructions:/, { selector: "pre" }).textContent).toBe(
    brief.prompt,
  );
});

test("future handoff and changed-path inputs render as structured brief sections", async () => {
  const user = userEvent.setup();
  const resumed = compileBrief({
    files,
    workItem: item,
    stage: builtInWorkflows.feature.stages[3],
    ticket,
    lastHandoff: {
      stint: "stint-001",
      agent: "Codex",
      stoppedAt: "Compiler ready",
      unresolved: "Sheet missing",
      nextStep: "Build the sheet",
    },
    changedPaths: [specPath],
  });
  vi.stubGlobal("fetch", previewFetch(resumed));
  render(<WorkItemDrawer item={item} onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  expect(
    await screen.findByRole("heading", { name: "Last handoff (stint-001, Codex)" }),
  ).toBeInTheDocument();
  for (const text of [
    "Where it stopped",
    "Compiler ready",
    "What is unresolved",
    "Sheet missing",
    "Suggested next step",
    "Build the sheet",
  ]) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
  expect(screen.getAllByText(specPath, { selector: "li code" })).toHaveLength(2);
});
