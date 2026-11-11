// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, editRoadmap, indexProject } from "@stintwork/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, expect, test, vi } from "vitest";
import { Board } from "./Board";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { RoadmapEditor } from "./RoadmapEditor";
import { chooseOption } from "./select-test-helper";

const initial =
  "# Roadmap\n\n## First\nId: first\nStatus: active\n- board\n\n## Second\nId: second\nStatus: planned\n";
function snapshot(roadmap = initial) {
  return indexProject(
    createMemoryRepoFiles({
      ".stintwork/roadmap.md": roadmap,
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

test("roadmap traps keyboard focus and restores the opener after outside dismissal", async () => {
  mockServer();
  const { user, sheet } = await open();
  await user.tab({ shift: true });
  expect(sheet.getByRole("button", { name: "Move work item" })).toHaveFocus();
  await user.tab();
  expect(sheet.getByRole("button", { name: "Close roadmap" })).toHaveFocus();
  fireEvent.pointerDown(document.body);
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit roadmap" })).toHaveFocus());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.lang = "en";
});

test("Chinese roadmap controls preserve milestone names, work item titles and the roadmap path", async () => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  const fetch = mockServer();
  const user = userEvent.setup();
  render(
    <LanguageProvider>
      <RoadmapEditor snapshot={snapshot()} />
    </LanguageProvider>,
  );
  await user.click(screen.getByRole("button", { name: "编辑路线图" }));
  const sheet = within(screen.getByRole("dialog", { name: "编辑路线图" }));
  expect(sheet.getByRole("button", { name: "关闭路线图" })).toBeInTheDocument();
  expect(sheet.getByText(/\.stintwork\/roadmap.md/)).toBeInTheDocument();
  expect(sheet.getByRole("region", { name: "First" })).toBeInTheDocument();
  expect(sheet.getByRole("textbox", { name: "名称：First" })).toHaveValue("First");
  const status = sheet.getByRole("combobox", { name: "状态：First" });
  await user.click(status);
  for (const name of ["已计划", "进行中", "已交付"])
    expect(screen.getByRole("option", { name })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(sheet.getByRole("button", { name: "重命名 First" })).toBeInTheDocument();
  expect(sheet.getByLabelText("目标日期：First")).toBeInTheDocument();
  expect(sheet.getByRole("button", { name: "设置目标日期：First" })).toBeInTheDocument();
  expect(sheet.getByRole("button", { name: "上移 First" })).toBeDisabled();
  expect(sheet.getByRole("button", { name: "下移 First" })).toBeEnabled();
  await chooseOption(user, status, "已交付");
  await user.click(sheet.getByRole("button", { name: "设置状态：First" }));
  expect(await sheet.findByRole("status")).toHaveTextContent("路线图已提交。");
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/roadmap",
    expect.objectContaining({
      body: JSON.stringify({ kind: "update", id: "first", status: "shipped" }),
    }),
  );
  expect(sheet.getByRole("textbox", { name: "新里程碑名称" })).toBeInTheDocument();
  expect(sheet.getByRole("button", { name: "添加里程碑" })).toBeInTheDocument();
  expect(sheet.getByRole("combobox", { name: "工作项" })).toHaveTextContent("Board work item");
  await user.click(sheet.getByRole("combobox", { name: "目标里程碑" }));
  expect(screen.getByRole("option", { name: "Second" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(sheet.getByRole("button", { name: "移动工作项" })).toBeInTheDocument();
});

test("the board exposes the editor, adds a milestone, and restores focus on close", async () => {
  const success = vi.spyOn(toast, "success");
  const fetch = mockServer();
  const user = userEvent.setup();
  render(<Board snapshot={snapshot()} />);
  const trigger = screen.getByRole("button", { name: "Edit roadmap" });
  await user.click(trigger);
  const sheet = within(screen.getByRole("dialog", { name: "Edit roadmap" }));
  expect(sheet.getByRole("button", { name: "Close roadmap" })).toHaveFocus();
  expect(sheet.getByRole("button", { name: "Add milestone" })).toBeDisabled();
  await user.type(sheet.getByRole("textbox", { name: "New milestone name" }), "Next delivery");
  await user.click(sheet.getByRole("button", { name: "Add milestone" }));
  expect(await sheet.findByRole("region", { name: "Next delivery" })).toHaveTextContent(
    "next-delivery",
  );
  expect(fetch).toHaveBeenCalledWith("/api/roadmap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "add", name: "Next delivery" }),
  });
  expect(sheet.getByRole("textbox", { name: "New milestone name" })).toHaveValue("");
  expect(success).toHaveBeenCalledWith("Roadmap saved.");
  success.mockRestore();
  await user.click(sheet.getByRole("button", { name: "Close roadmap" }));
  expect(screen.queryByRole("dialog", { name: "Edit roadmap" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test("renames without changing the displayed stable id", async () => {
  const fetch = mockServer();
  const { user, sheet } = await open();
  const input = sheet.getByRole("textbox", { name: "Name for First" });
  await user.clear(input);
  await user.type(input, "Renamed");
  await user.click(sheet.getByRole("button", { name: "Rename First" }));
  expect(await sheet.findByRole("region", { name: "Renamed" })).toHaveTextContent("first");
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
    kind: "rename",
    id: "first",
    name: "Renamed",
  });
});

test.each(["planned", "shipped"])("sets milestone status to %s explicitly", async (status) => {
  const fetch = mockServer();
  const { user, sheet } = await open();
  await chooseOption(
    user,
    sheet.getByRole("combobox", { name: "Status for First" }),
    status === "planned" ? "Planned" : "Shipped",
  );
  expect(fetch).not.toHaveBeenCalled();
  await user.click(sheet.getByRole("button", { name: "Set status for First" }));
  await waitFor(() =>
    expect(sheet.getByRole("button", { name: "Set status for First" })).toBeDisabled(),
  );
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
    kind: "update",
    id: "first",
    status,
  });
  expect(sheet.getByRole("combobox", { name: "Status for First" })).toHaveTextContent(
    status === "planned" ? "Planned" : "Shipped",
  );
});

test("sets a target date and clears it in separate writes", async () => {
  const fetch = mockServer();
  const { user, sheet } = await open();
  fireEvent.change(sheet.getByLabelText("Target for First"), { target: { value: "2027-01-02" } });
  await user.click(sheet.getByRole("button", { name: "Set target for First" }));
  await waitFor(() =>
    expect(sheet.getByRole("button", { name: "Set target for First" })).toBeDisabled(),
  );
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
    kind: "update",
    id: "first",
    target: "2027-01-02",
  });
  fireEvent.change(sheet.getByLabelText("Target for First"), { target: { value: "" } });
  await user.click(sheet.getByRole("button", { name: "Set target for First" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toEqual({
    kind: "update",
    id: "first",
    target: null,
  });
});

test("reorders up and down with disabled boundary controls", async () => {
  const fetch = mockServer();
  const { user, sheet } = await open();
  expect(sheet.getByRole("button", { name: "Move First up" })).toBeDisabled();
  expect(sheet.getByRole("button", { name: "Move Second down" })).toBeDisabled();
  await user.click(sheet.getByRole("button", { name: "Move Second up" }));
  await waitFor(() => expect(sheet.getByRole("button", { name: "Move Second up" })).toBeDisabled());
  expect(sheet.getAllByRole("region").map((element) => element.getAttribute("aria-label"))).toEqual(
    ["Second", "First"],
  );
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
    kind: "reorder",
    ids: ["second", "first"],
  });
  await user.click(sheet.getByRole("button", { name: "Move Second down" }));
  await waitFor(() => expect(sheet.getByRole("button", { name: "Move First up" })).toBeDisabled());
  expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toEqual({
    kind: "reorder",
    ids: ["first", "second"],
  });
});

test("moves a work item to another milestone or no milestone", async () => {
  const fetch = mockServer();
  const { user, sheet } = await open();
  expect(sheet.getByRole("combobox", { name: "Work item" })).toHaveTextContent("Board work item");
  await chooseOption(
    user,
    sheet.getByRole("combobox", { name: "Destination milestone" }),
    "Second",
  );
  await user.click(sheet.getByRole("button", { name: "Move work item" }));
  expect(await sheet.findByRole("status")).toHaveTextContent("Roadmap committed.");
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
    kind: "move",
    workItem: "board",
    milestone: "second",
  });
  await chooseOption(
    user,
    sheet.getByRole("combobox", { name: "Destination milestone" }),
    "No milestone",
  );
  await user.click(sheet.getByRole("button", { name: "Move work item" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toEqual({
    kind: "move",
    workItem: "board",
    milestone: null,
  });
});

test("shows dirty-roadmap refusals, retains entered text and lets the developer retry", async () => {
  const fetch = mockServer();
  fetch.mockImplementationOnce(
    async () =>
      new Response(JSON.stringify({ reason: "Commit hand edits first." }), { status: 409 }),
  );
  const { user, sheet } = await open();
  await user.type(sheet.getByRole("textbox", { name: "New milestone name" }), "Next");
  await user.click(sheet.getByRole("button", { name: "Add milestone" }));
  expect(await sheet.findByRole("alert")).toHaveTextContent("Commit hand edits first.");
  expect(sheet.getByRole("textbox", { name: "New milestone name" })).toHaveValue("Next");
  expect(sheet.queryByRole("region", { name: "Next" })).not.toBeInTheDocument();
  await user.click(sheet.getByRole("button", { name: "Add milestone" }));
  expect(await sheet.findByRole("region", { name: "Next" })).toBeInTheDocument();
  expect(sheet.queryByRole("alert")).not.toBeInTheDocument();
});

test("disables editing and closing while a write is pending", async () => {
  let respond: (response: Response) => void = () => {};
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const { user, sheet } = await open();
  await user.type(sheet.getByRole("textbox", { name: "New milestone name" }), "Next");
  await user.click(sheet.getByRole("button", { name: "Add milestone" }));
  expect(sheet.getByRole("button", { name: "Close roadmap" })).toBeDisabled();
  expect(sheet.getByRole("button", { name: "Move work item" })).toBeDisabled();
  expect(sheet.getByRole("textbox", { name: "New milestone name" })).toBeDisabled();
  await user.keyboard("{Escape}");
  fireEvent.pointerDown(document.body);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  respond(new Response(JSON.stringify({ milestones: snapshot().milestones, commit: null })));
  expect(await sheet.findByRole("status")).toHaveTextContent("Roadmap unchanged.");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit roadmap" })).toHaveFocus();
});

test("follows refreshed milestones and supports an empty roadmap", async () => {
  mockServer();
  const user = userEvent.setup();
  const { rerender } = render(<RoadmapEditor snapshot={snapshot("")} />);
  await user.click(screen.getByRole("button", { name: "Edit roadmap" }));
  expect(screen.queryByRole("region", { name: "First" })).not.toBeInTheDocument();
  rerender(<RoadmapEditor snapshot={snapshot()} />);
  expect(await screen.findByRole("region", { name: "First" })).toBeInTheDocument();
});
