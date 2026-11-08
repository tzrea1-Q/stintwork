// SPDX-License-Identifier: Apache-2.0
import {
  builtInWorkflows,
  compileBrief,
  createMemoryRepoFiles,
  deriveAttentionItems,
} from "@stintwork/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Board } from "./Board";
import { StageBriefPreview, TicketBriefPreview } from "./BriefPreview";
import { attentionSnapshot } from "./attention-test-fixtures";
import { codexProfile } from "../../agents/src/profiles";

function handoffSnapshot() {
  const snapshot = attentionSnapshot([]);
  const item = snapshot.workItems[0];
  item.activeStint = null;
  item.stints[0] = {
    ...item.stints[0],
    status: "finished",
    endedAt: "2026-10-09T11:00:00Z",
    handoff: {
      stint: "stint",
      agent: "custom-agent",
      stoppedAt: "Export written.",
      unresolved: "Which **format** should the export use?",
      nextStep: "Choose the format.",
    },
  };
  snapshot.attentionItems = deriveAttentionItems(snapshot);
  return snapshot;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

test.each(["note", "dismiss"])(
  "the queue can %s an unresolved handoff and waits for persistence before disabling further answers",
  async (action) => {
    const user = userEvent.setup();
    let acknowledge: (response: Response) => void = () => {};
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          acknowledge = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const snapshot = handoffSnapshot();
    const { rerender } = render(<Board snapshot={snapshot} />);
    await user.click(screen.getByRole("button", { name: "Needs you 1" }));
    const queue = within(screen.getByRole("dialog", { name: "Needs you 1" }));
    expect(queue.getByText("Handoff · Test Agent")).toBeInTheDocument();
    expect(queue.getByText("format", { selector: "strong" })).toBeInTheDocument();
    expect(queue.getByText(/Ticket 1 · Stint/)).toHaveTextContent("stint");
    expect(queue.getByRole("button", { name: "Save developer note" })).toBeDisabled();
    if (action === "note")
      await user.type(queue.getByRole("textbox", { name: "Developer note" }), "Use CSV.");
    await user.click(
      queue.getByRole("button", { name: action === "note" ? "Save developer note" : "Dismiss" }),
    );
    expect(fetch).toHaveBeenCalledWith("/api/stints/stint/handoff-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: action === "note" ? "Use CSV." : null }),
    });
    expect(queue.getByRole("button", { name: "Dismiss" })).toBeDisabled();
    expect(queue.queryByText("Handoff answered.")).not.toBeInTheDocument();
    acknowledge(new Response("{}"));
    expect(await queue.findByText("Handoff answered.")).toBeInTheDocument();
    expect(queue.getByRole("textbox", { name: "Developer note" })).toBeDisabled();
    rerender(<Board snapshot={{ ...snapshot, attentionItems: [] }} />);
    expect(screen.getByText("Nothing needs you right now.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Developer note" })).not.toBeInTheDocument();
  },
);

test("mark resolved submits a persistent resolution", async () => {
  const user = userEvent.setup();
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  render(<Board snapshot={handoffSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  await user.click(screen.getByRole("button", { name: "Mark resolved" }));
  expect(fetch).toHaveBeenCalledWith(
    "/api/stints/stint/resolve-handoff",
    expect.objectContaining({ method: "POST" }),
  );
  expect(await screen.findByText("Handoff answered.")).toBeInTheDocument();
});

test("failed handoff answers keep the note editable and allow retry without claiming it was saved", async () => {
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ reason: "Could not persist the answer." }), { status: 503 }),
    )
    .mockResolvedValueOnce(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  render(<Board snapshot={handoffSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  const textarea = screen.getByRole("textbox", { name: "Developer note" });
  await user.type(textarea, "Use CSV.");
  await user.click(screen.getByRole("button", { name: "Save developer note" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unresolved handoff: Could not persist the answer.",
  );
  expect(textarea).toHaveValue("Use CSV.");
  expect(screen.queryByText("Handoff answered.")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save developer note" }));
  expect(await screen.findByText("Handoff answered.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("whitespace-only notes cannot be submitted, while dismiss stays available", async () => {
  const user = userEvent.setup();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<Board snapshot={handoffSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  await user.type(screen.getByRole("textbox", { name: "Developer note" }), "   ");
  expect(screen.getByRole("button", { name: "Save developer note" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Dismiss" })).toBeEnabled();
  expect(fetch).not.toHaveBeenCalled();
});

test.each([true, false])(
  "the %s ticket-scoped brief preview shows the dated developer note after the handoff",
  async (ticketScoped) => {
    const user = userEvent.setup();
    const item = handoffSnapshot().workItems[0];
    const developerNotes = [
      { id: "stint", at: "2026-10-09T12:00:00Z", text: "Use CSV.\nKeep the header." },
    ];
    const brief = compileBrief({
      files: createMemoryRepoFiles({}),
      workItem: item,
      stage: builtInWorkflows.feature.stages[3],
      ticket: ticketScoped ? item.tickets[0] : null,
      lastHandoff: item.stints[0].handoff,
      developerNotes,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(JSON.stringify(url === "/api/agents" ? { agents: [codexProfile] } : brief)),
      ),
    );
    render(
      ticketScoped ? (
        <TicketBriefPreview item={item} ticket={item.tickets[0]} />
      ) : (
        <StageBriefPreview item={item} />
      ),
    );
    await user.click(screen.getByRole("button", { name: "Start stint" }));
    const sheet = within(screen.getByRole("dialog", { name: "Brief preview" }));
    const heading = await sheet.findByRole("heading", { name: "Developer notes" });
    const section = within(heading.parentElement as HTMLElement);
    expect(section.getByText("2026-10-09T12:00:00Z", { selector: "time" })).toHaveAttribute(
      "datetime",
      developerNotes[0].at,
    );
    expect(section.getByText(/Use CSV/, { selector: "pre" }).textContent).toBe(
      developerNotes[0].text,
    );
    const headings = sheet.getAllByRole("heading", { level: 3 }).map((entry) => entry.textContent);
    expect(headings.indexOf("Developer notes")).toBe(
      headings.indexOf("Last handoff (stint, custom-agent)") + 1,
    );
    await waitFor(() => expect(sheet.getByText(/Full prompt/)).toBeInTheDocument());
  },
);
