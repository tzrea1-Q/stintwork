// SPDX-License-Identifier: Apache-2.0

import { createMemoryRepoFiles, indexProject, prepareWorkItemCreation } from "@stintwork/core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Board } from "./Board";
import { CommandPalette } from "./CommandPalette";
import { CreateWorkItem } from "./CreateWorkItem";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { chooseOption } from "./select-test-helper";

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

test.each([
  [
    "legacy preview refusal",
    { reason: "Could not preview the work item." },
    409,
    "无法预览工作项。",
  ],
  ["preview fallback", null, 409, "无法预览工作项。"],
  ["invalid preview", { slug: "" }, 200, "文件夹名称预览无效。"],
  [
    "authored preview refusal",
    { reason: "Fixture refusal 原文: src/long-path.ts" },
    409,
    "Fixture refusal 原文: src/long-path.ts",
  ],
])(
  "Chinese create renders %s and keeps creation disabled",
  async (_name, reply, status, message) => {
    localStorage.setItem(languageStorageKey, "zh-CN");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (reply === null ? Promise.reject(undefined) : response(reply, status))),
    );
    render(
      <LanguageProvider>
        <CreateWorkItem snapshot={snapshot()} onClose={vi.fn()} onCreated={vi.fn()} />
      </LanguageProvider>,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "标题" }), {
      target: { value: "Retry 原文" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "创建工作项" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "标题" })).toHaveValue("Retry 原文");
  },
);

test.each([
  ["legacy save refusal", { reason: "Could not create the work item." }, "无法创建工作项。"],
  ["save fallback", null, "无法创建工作项。"],
  [
    "authored save refusal",
    { reason: "Fixture refusal 原文: src/long-path.ts" },
    "Fixture refusal 原文: src/long-path.ts",
  ],
])("Chinese create renders %s without losing the input", async (_name, reply, message) => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      path.endsWith("/preview")
        ? response({ slug: "server-preview" })
        : reply === null
          ? Promise.reject(undefined)
          : response(reply, 409),
    ),
  );
  const created = vi.fn();
  const user = userEvent.setup();
  render(
    <LanguageProvider>
      <CreateWorkItem snapshot={snapshot()} onClose={vi.fn()} onCreated={created} />
    </LanguageProvider>,
  );
  const title = screen.getByRole("textbox", { name: "标题" });
  fireEvent.change(title, { target: { value: "Retry 原文" } });
  const confirm = screen.getByRole("button", { name: "创建工作项" });
  await waitFor(() => expect(confirm).toBeEnabled());
  await user.click(confirm);
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(confirm).toBeEnabled();
  expect(title).toHaveValue("Retry 原文");
  expect(created).not.toHaveBeenCalled();
});

test("create contains keyboard focus and dismisses on an outside click", async () => {
  fetcher();
  const user = userEvent.setup();
  const close = vi.fn();
  render(<CreateWorkItem snapshot={snapshot()} onClose={close} onCreated={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus());
  await user.tab({ shift: true });
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
  fireEvent.pointerDown(document.body);
  expect(close).toHaveBeenCalledOnce();
});

test("pending creation prevents duplicate writes, Escape and outside dismissal", async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  let finish: (value: Response) => void = () => {};
  const fetch = vi.fn((path: string) =>
    path.endsWith("/preview")
      ? Promise.resolve(response({ slug: "idea" }))
      : new Promise<Response>((resolve) => {
          finish = resolve;
        }),
  );
  vi.stubGlobal("fetch", fetch);
  render(<CreateWorkItem snapshot={snapshot()} onClose={close} onCreated={vi.fn()} />);
  await user.type(screen.getByRole("textbox", { name: "Title" }), "Idea");
  await screen.findByText(".scratch/idea/");
  await user.click(screen.getByRole("button", { name: "Create work item" }));
  expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await user.keyboard("{Escape}");
  fireEvent.pointerDown(document.body);
  expect(close).not.toHaveBeenCalled();
  expect(fetch.mock.calls.filter(([path]) => path === "/api/work-items")).toHaveLength(1);
  await act(async () => finish(response({ reason: "Save refused" }, 409)));
  expect(screen.getByRole("alert")).toHaveTextContent("Save refused");
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Idea");
  await user.keyboard("{Escape}");
  expect(close).toHaveBeenCalledOnce();
});

test("the palette traps keyboard focus and supports outside dismissal", async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  render(
    <CommandPalette
      snapshot={snapshot()}
      milestone=""
      onMilestoneChange={vi.fn()}
      onOpenItem={vi.fn()}
      onCreateItem={vi.fn()}
      onCustomiseWorkflow={vi.fn()}
      onClose={close}
    />,
  );
  await user.tab({ shift: true });
  expect(screen.getByRole("button", { name: "Close command palette" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("combobox")).toHaveFocus();
  fireEvent.pointerDown(document.body);
  expect(close).toHaveBeenCalledOnce();
});

test("Enter on the palette close button never selects a command", async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  const create = vi.fn();
  render(
    <CommandPalette
      snapshot={snapshot()}
      milestone=""
      onMilestoneChange={vi.fn()}
      onOpenItem={vi.fn()}
      onCreateItem={create}
      onCustomiseWorkflow={vi.fn()}
      onClose={close}
    />,
  );
  await user.tab();
  expect(screen.getByRole("button", { name: "Close command palette" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(close).toHaveBeenCalledOnce();
  expect(create).not.toHaveBeenCalled();
});
afterEach(() => {
  localStorage.clear();
  document.documentElement.lang = "en";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

test.each([
  ["Gateway temporarily unavailable", "Gateway temporarily unavailable"],
  ["null", "null"],
  ["", "Bad Gateway"],
])("a malformed preview refusal %j falls back to raw text or status", async (body, expected) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status: 502, statusText: "Bad Gateway" })),
  );
  render(<CreateWorkItem snapshot={snapshot()} onClose={vi.fn()} onCreated={vi.fn()} />);
  await userEvent.setup().type(screen.getByRole("textbox", { name: "Title" }), "Fix login");
  expect((await screen.findByRole("alert")).textContent).toBe(expected);
});

test("the folder-name hint is hidden when the title derives an ASCII slug", async () => {
  fetcher();
  render(<CreateWorkItem snapshot={snapshot()} onClose={vi.fn()} onCreated={vi.fn()} />);
  await userEvent.setup().type(screen.getByRole("textbox", { name: "Title" }), "Fix login");
  expect(screen.getByRole("textbox", { name: "Folder name" })).toHaveValue("fix-login");
  expect(
    screen.queryByText(
      "Enter a folder name using lowercase English letters, digits and single hyphens (up to 48 characters).",
    ),
  ).not.toBeInTheDocument();
});

test.each([
  [
    "en",
    "Create work item",
    "Title",
    "Folder name",
    "Enter a folder name using lowercase English letters, digits and single hyphens (up to 48 characters).",
  ],
  [
    "zh-CN",
    "创建工作项",
    "标题",
    "文件夹名称",
    "请输入文件夹名称，使用小写英文字母、数字和单个连字符，最多 48 个字符。",
  ],
])(
  "%s enables a Chinese-only title only after a valid folder name",
  async (language, createLabel, titleLabel, folderLabel, hint) => {
    localStorage.setItem(languageStorageKey, language);
    const user = userEvent.setup();
    const project = snapshot();
    const fetch = vi.fn(async (_path: string, options: RequestInit) => {
      try {
        const creation = prepareWorkItemCreation(
          JSON.parse(options.body as string),
          project.workflows,
          "",
        );
        return response({ slug: creation.slug });
      } catch (cause) {
        return response({ reason: (cause as Error).message }, 400);
      }
    });
    vi.stubGlobal("fetch", fetch);
    render(
      <LanguageProvider>
        <CreateWorkItem snapshot={project} onClose={vi.fn()} onCreated={vi.fn()} />
      </LanguageProvider>,
    );
    const dialog = within(screen.getByRole("dialog", { name: createLabel }));
    await user.type(dialog.getByRole("textbox", { name: titleLabel }), "修复登录");
    const folder = dialog.getByRole("textbox", { name: folderLabel });
    expect(folder).toHaveValue("");
    expect(folder).toHaveAccessibleDescription(hint);
    expect(dialog.getByRole("button", { name: createLabel })).toBeDisabled();
    for (const invalid of ["修复", "Fix-login", "fix--login", "a".repeat(49)]) {
      await user.clear(folder);
      await user.type(folder, invalid);
      expect(dialog.getByRole("button", { name: createLabel })).toBeDisabled();
      expect(folder).toHaveAttribute("aria-invalid", "true");
    }
    await user.clear(folder);
    await user.type(folder, "fix-login");
    await waitFor(() => expect(dialog.getByRole("button", { name: createLabel })).toBeEnabled());
    expect(await dialog.findByText(".scratch/fix-login/")).toBeInTheDocument();
  },
);

test.each([
  ["en", "Create work item", "Title", "Folder name"],
  ["zh-CN", "创建工作项", "标题", "文件夹名称"],
])(
  "%s preserves an edited slug and creates a verbatim Chinese card and drawer",
  async (language, createLabel, titleLabel, folderLabel) => {
    localStorage.setItem(languageStorageKey, language);
    const user = userEvent.setup();
    const project = snapshot();
    let workflowText = "";
    const fetch = vi.fn(async (path: string, options?: RequestInit) => {
      if (!options?.body) return response({});
      const creation = prepareWorkItemCreation(
        JSON.parse(options.body as string),
        project.workflows,
        "",
      );
      if (path === "/api/work-items") workflowText = creation.workflowText;
      return response({ slug: creation.slug });
    });
    vi.stubGlobal("fetch", fetch);
    const rendered = render(
      <LanguageProvider>
        <Board snapshot={project} />
      </LanguageProvider>,
    );
    await user.keyboard("c");
    const dialog = within(screen.getByRole("dialog", { name: createLabel }));
    const title = dialog.getByRole("textbox", { name: titleLabel });
    const folder = dialog.getByRole("textbox", { name: folderLabel });
    await user.type(title, "导出看板为 CSV");
    expect(folder).toHaveValue("csv");
    await user.clear(title);
    await user.type(title, "修复登录");
    expect(folder).toHaveValue("");
    await user.type(folder, "fix-login");
    await dialog.findByText(".scratch/fix-login/");
    await user.clear(title);
    await user.type(title, "修复登录问题");
    expect(folder).toHaveValue("fix-login");
    expect(dialog.getByRole("button", { name: createLabel })).toBeDisabled();
    await waitFor(() => expect(dialog.getByRole("button", { name: createLabel })).toBeEnabled());
    await user.click(dialog.getByRole("button", { name: createLabel }));
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/work-items",
      expect.objectContaining({
        body: JSON.stringify({
          title: "修复登录问题",
          workflow: "feature",
          milestone: null,
          intent: "",
          slug: "fix-login",
        }),
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: createLabel })).not.toBeInTheDocument(),
    );
    rendered.rerender(
      <LanguageProvider>
        <Board
          snapshot={indexProject(
            createMemoryRepoFiles({
              ...contents,
              ".scratch/fix-login/workflow.yaml": workflowText,
            }),
            { name: "Fixture" },
          )}
        />
      </LanguageProvider>,
    );
    const card = screen.getByRole("article", { name: "fix-login: 修复登录问题" });
    expect(card).toHaveTextContent("修复登录问题");
    await user.click(within(card).getByRole("button"));
    expect(screen.getByRole("dialog", { name: "修复登录问题" })).toBeInTheDocument();
  },
);

test.each([
  [
    "en",
    "Create work item",
    "Title",
    "Folder name",
    "Folder name must use lowercase English letters, digits and single hyphens, with at most 48 characters.",
  ],
  [
    "zh-CN",
    "创建工作项",
    "标题",
    "文件夹名称",
    "文件夹名称必须使用小写英文字母、数字和单个连字符，最多 48 个字符。",
  ],
])(
  "%s translates the explicit-slug server refusal",
  async (language, createLabel, titleLabel, folderLabel, expected) => {
    localStorage.setItem(languageStorageKey, language);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(
          {
            reason:
              "Folder name must use lowercase English letters, digits and single hyphens, with at most 48 characters.",
            reasonMessage: { code: "creation.invalidSlug" },
          },
          400,
        ),
      ),
    );
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <CreateWorkItem snapshot={snapshot()} onClose={vi.fn()} onCreated={vi.fn()} />
      </LanguageProvider>,
    );
    await user.type(screen.getByRole("textbox", { name: titleLabel }), "修复登录");
    await user.type(screen.getByRole("textbox", { name: folderLabel }), "fix-login");
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(screen.getByRole("button", { name: createLabel })).toBeDisabled();
  },
);

test("Chinese command palette translates controls and searches verbatim repo content", async () => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  const user = userEvent.setup();
  const onOpenItem = vi.fn();
  const onCustomiseWorkflow = vi.fn();
  const project = indexProject(
    createMemoryRepoFiles({
      ".scratch/repo-item/spec.md": "# Repo title 中文",
      ".stintwork/roadmap.md": "## Repo milestone 中文\nId: first\nStatus: active\n",
    }),
    { name: "Fixture" },
  );
  render(
    <LanguageProvider>
      <CommandPalette
        snapshot={project}
        milestone=""
        onMilestoneChange={vi.fn()}
        onOpenItem={onOpenItem}
        onCreateItem={vi.fn()}
        onCustomiseWorkflow={onCustomiseWorkflow}
        onClose={vi.fn()}
      />
    </LanguageProvider>,
  );
  const palette = within(screen.getByRole("dialog", { name: "命令面板" }));
  const search = palette.getByRole("combobox", { name: "搜索工作项和里程碑" });
  expect(search).toHaveAttribute("placeholder", "查找工作项或里程碑…");
  expect(palette.getByRole("button", { name: "关闭命令面板" })).toBeInTheDocument();
  expect(palette.getByRole("option", { name: "创建工作项" })).toBeInTheDocument();
  await user.click(palette.getByRole("option", { name: "自定义功能工作流" }));
  expect(onCustomiseWorkflow).toHaveBeenCalledWith("feature");
  expect(palette.getByText("Repo milestone 中文")).toBeInTheDocument();
  await user.type(search, "Repo title 中文");
  await user.click(palette.getByRole("option", { name: "repo-item Repo title 中文" }));
  expect(onOpenItem).toHaveBeenCalledWith("repo-item");
  await user.clear(search);
  await user.type(search, "no-match-anywhere");
  expect(await palette.findByText("未找到工作项或里程碑。")).toBeInTheDocument();
});

test("Chinese create controls submit a mixed Chinese title using the existing slug rules", async () => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  const user = userEvent.setup();
  const project = snapshot();
  const onCreated = vi.fn();
  const fetch = vi.fn(async (_path: string, options: RequestInit) => {
    const creation = prepareWorkItemCreation(
      JSON.parse(String(options.body)),
      project.workflows,
      contents[".stintwork/roadmap.md"],
    );
    return response({ slug: creation.slug });
  });
  vi.stubGlobal("fetch", fetch);
  render(
    <LanguageProvider>
      <CreateWorkItem snapshot={project} onClose={vi.fn()} onCreated={onCreated} />
    </LanguageProvider>,
  );
  const dialog = within(screen.getByRole("dialog", { name: "创建工作项" }));
  await user.type(dialog.getByRole("textbox", { name: "标题" }), "中文计划 API");
  await chooseOption(user, dialog.getByRole("combobox", { name: "工作流" }), "Team workflow");
  await user.click(dialog.getByRole("combobox", { name: "工作流" }));
  expect(screen.getByRole("option", { name: "Team workflow" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "功能" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await chooseOption(user, dialog.getByRole("combobox", { name: "里程碑（可选）" }), "First");
  expect(dialog.getByRole("combobox", { name: "里程碑（可选）" })).toHaveTextContent("First");
  await user.type(dialog.getByRole("textbox", { name: "意图（可选）" }), "Developer intent 原文");
  expect(await dialog.findByText(".scratch/api/")).toBeInTheDocument();
  expect(dialog.getByRole("button", { name: "取消" })).toBeInTheDocument();
  await user.click(dialog.getByRole("button", { name: "创建工作项" }));
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/work-items",
    expect.objectContaining({
      body: JSON.stringify({
        title: "中文计划 API",
        workflow: "team",
        milestone: "first",
        intent: "Developer intent 原文",
      }),
    }),
  );
  expect(onCreated).toHaveBeenCalledOnce();
});

test.each([
  [
    "Title must produce a valid ASCII work item slug.",
    "标题必须能生成有效的 ASCII 工作项标识。",
    { code: "workItem.titleSlug" },
  ],
  [
    "Work item idea already exists.",
    "工作项 idea 已存在。",
    { code: "creation.exists", params: { slug: "idea" } },
  ],
  [
    "Work item idea already exists in Git.",
    "工作项 idea 已存在于 Git 中。",
    { code: "creation.existsInGit", params: { slug: "idea" } },
  ],
  [
    ".scratch must be a real directory.",
    ".scratch 必须为真实目录。",
    { code: "creation.scratchDirectory" },
  ],
  [
    "Commit or discard hand edits to the creation paths first.",
    "请先提交或丢弃创建路径中的手动更改。",
    { code: "creation.commitPaths" },
  ],
  [
    "Commit or discard hand edits to roadmap.md first.",
    "请先提交或丢弃 roadmap.md 的手动更改。",
    { code: "creation.roadmapEdits" },
  ],
  ["Unknown server refusal 原文", "Unknown server refusal 原文", undefined],
])(
  "Chinese create renders known refusals and preserves unknown diagnostics: %s",
  async (reason, expected, reasonMessage) => {
    localStorage.setItem(languageStorageKey, "zh-CN");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response({ reason, reasonMessage }, 409)),
    );
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <CreateWorkItem snapshot={snapshot()} onClose={vi.fn()} onCreated={vi.fn()} />
      </LanguageProvider>,
    );
    await user.type(screen.getByRole("textbox", { name: "标题" }), "中文标题");
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(screen.getByRole("button", { name: "创建工作项" })).toBeDisabled();
  },
);

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
  const workflow = dialog.getByRole("combobox", { name: "Workflow" });
  await user.click(workflow);
  expect(screen.getAllByRole("option").map((entry) => entry.textContent)).toEqual(
    expect.arrayContaining(["Feature", "Bug", "Quick", "Team workflow"]),
  );
  await user.keyboard("{Escape}");
  expect(workflow).toHaveFocus();
  await user.type(dialog.getByRole("textbox", { name: "Title" }), "New Idea");
  await user.click(workflow);
  await user.click(screen.getByRole("option", { name: "Team workflow" }));
  await user.click(dialog.getByRole("combobox", { name: "Milestone (optional)" }));
  expect(screen.getByRole("option", { name: "No milestone" })).toBeInTheDocument();
  await user.click(screen.getByRole("option", { name: "First" }));
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
