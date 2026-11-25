// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, editRoadmap, indexProject } from "@stintwork/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { domMax, LazyMotion, MotionGlobalConfig } from "motion/react";
import { afterEach, expect, test, vi } from "vitest";
import { RoadmapEditor } from "./RoadmapEditor";
import { chooseOption } from "./select-test-helper";

const initial =
  "# Roadmap\n\n## First\nId: first\nStatus: active\n- board\n\n## Second\nId: second\nStatus: planned\n";
function snapshot() {
  return indexProject(
    createMemoryRepoFiles({
      ".stintwork/roadmap.md": initial,
      ".scratch/board/spec.md": "# Board work item",
    }),
    { name: "Project" },
  );
}
function mockServer() {
  let text = initial;
  const fetch = vi.fn(async (_url: string, options: RequestInit) => {
    const result = editRoadmap(text, JSON.parse(String(options.body)));
    text = result.text;
    return new Response(JSON.stringify({ milestones: result.milestones, commit: "a".repeat(40) }));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
async function open() {
  const user = userEvent.setup();
  render(<RoadmapEditor snapshot={snapshot()} />);
  await user.click(screen.getByRole("button", { name: "Edit roadmap" }));
  return { user, sheet: within(screen.getByRole("dialog", { name: "Edit roadmap" })) };
}
afterEach(() => {
  vi.unstubAllGlobals();
});

test("saves name, status, target and work item move in one batch", async () => {
  const fetch = mockServer();
  const { user, sheet } = await open();
  await user.clear(sheet.getByRole("textbox", { name: "Name for First" }));
  await user.type(sheet.getByRole("textbox", { name: "Name for First" }), "Renamed");
  expect(sheet.getByRole("radio", { name: "Active" })).toHaveAttribute("data-state", "on");
  await user.click(sheet.getByRole("radio", { name: "Shipped" }));
  expect(sheet.getByRole("radio", { name: "Shipped" })).toHaveAttribute("data-state", "on");
  await user.type(sheet.getByLabelText("Target for First"), "2027-01-02");
  await chooseOption(
    user,
    sheet.getByRole("combobox", { name: "Move Board work item from First to milestone" }),
    "Second",
  );
  await user.click(sheet.getByRole("button", { name: "Save" }));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toEqual({
    kind: "batch",
    id: "first",
    changes: [
      { kind: "rename", id: "first", name: "Renamed" },
      { kind: "update", id: "first", status: "shipped", target: "2027-01-02" },
      { kind: "move", workItem: "board", milestone: "second" },
    ],
  });
});

test("switching or closing with pending changes asks and cancel keeps them", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { user, sheet } = await open();
  await user.type(sheet.getByRole("textbox", { name: "Name for First" }), " edited");
  await user.click(
    within(sheet.getByRole("region", { name: "Second" })).getByRole("button", { pressed: false }),
  );
  expect(confirm).toHaveBeenCalled();
  expect(sheet.getByRole("textbox", { name: "Name for First" })).toHaveValue("First edited");
  await user.click(sheet.getByRole("button", { name: "Close roadmap" }));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  confirm.mockRestore();
});

test("reorders milestones using the keyboard", async () => {
  const fetch = mockServer();
  const { user, sheet } = await open();
  sheet.getByRole("button", { name: "Move Second up" }).focus();
  await user.keyboard("{Enter}");
  expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toEqual({
    kind: "reorder",
    ids: ["second", "first"],
  });
});

test("progress counts a shipped work item as done", async () => {
  const project = snapshot();
  project.workItems[0].merged = { at: "2026-10-10T10:00:00Z", commit: "a".repeat(40) };
  render(<RoadmapEditor snapshot={project} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Edit roadmap" }));
  expect(screen.getByRole("progressbar", { name: "First" })).toHaveAttribute("aria-valuenow", "1");
});

test("reveals the new milestone form and dismisses it with Escape or Cancel", async () => {
  const fetch = mockServer();
  const { user, sheet } = await open();
  expect(sheet.queryByRole("textbox", { name: "New milestone name" })).not.toBeInTheDocument();
  await user.click(sheet.getByRole("button", { name: "New milestone" }));
  await user.type(sheet.getByRole("textbox", { name: "New milestone name" }), "Next");
  await user.keyboard("{Escape}");
  expect(sheet.queryByRole("textbox", { name: "New milestone name" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await user.click(sheet.getByRole("button", { name: "New milestone" }));
  expect(sheet.getByRole("textbox", { name: "New milestone name" })).toHaveValue("");
  await user.click(
    within(
      sheet.getByRole("textbox", { name: "New milestone name" }).closest("form") as HTMLFormElement,
    ).getByRole("button", { name: "Cancel" }),
  );
  expect(sheet.queryByRole("textbox", { name: "New milestone name" })).not.toBeInTheDocument();
  await user.click(sheet.getByRole("button", { name: "New milestone" }));
  await user.type(sheet.getByRole("textbox", { name: "New milestone name" }), "Next");
  await user.click(sheet.getByRole("button", { name: "Add milestone" }));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toEqual({ kind: "add", name: "Next" });
  expect(await sheet.findByRole("button", { name: "New milestone" })).toBeInTheDocument();
});

test("closing the roadmap returns focus to its opener", async () => {
  const { user, sheet } = await open();
  const trigger = screen.getByRole("button", { name: "Edit roadmap", hidden: true });
  await user.click(sheet.getByRole("button", { name: "Close roadmap" }));
  await vi.waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("roadmap stays mounted during its exit and returns focus afterwards", async () => {
  MotionGlobalConfig.skipAnimations = false;
  try {
    const user = userEvent.setup();
    render(
      <LazyMotion features={domMax} strict>
        <RoadmapEditor snapshot={snapshot()} />
      </LazyMotion>,
    );
    const trigger = screen.getByRole("button", { name: "Edit roadmap" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Edit roadmap" });
    await vi.waitFor(() => expect(dialog).toHaveStyle({ opacity: "1" }), { timeout: 2500 });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close roadmap" }));
    expect(dialog).toBeInTheDocument();
    await vi.waitFor(() => expect(dialog).not.toBeInTheDocument(), { timeout: 2500 });
    await vi.waitFor(() => expect(trigger).toHaveFocus());
  } finally {
    MotionGlobalConfig.skipAnimations = true;
  }
});

test("roadmap progress uses ticket units and the close icon dismisses", async () => {
  const project = snapshot();
  project.workItems[0].tickets = Array.from({ length: 6 }, (_, index) => ({
    ...project.workItems[0].tickets[0],
    number: index + 1,
    resolved: index < 5,
  }));
  const user = userEvent.setup();
  render(<RoadmapEditor snapshot={project} />);
  await user.click(screen.getByRole("button", { name: "Edit roadmap" }));
  expect(screen.getByText("5/6")).toBeInTheDocument();
  const close = screen.getByRole("button", { name: "Close roadmap" });
  expect(close.querySelector("svg")).toBeInTheDocument();
  await user.click(close);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
