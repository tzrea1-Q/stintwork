// SPDX-License-Identifier: Apache-2.0
import { builtInWorkflows, createMemoryRepoFiles, indexProject, planSetup } from "@stintwork/core";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";
import { Board } from "./Board";
import { CommandPalette } from "./CommandPalette";
import { LanguageProvider, languageStorageKey, useErrorText, useLanguage } from "./i18n/language";
import { zhCN } from "./i18n/zh-CN";
import { RoadmapEditor } from "./RoadmapEditor";

const files = {
  ".scratch/example/spec.md": "# Repo title 中文",
  ".scratch/example/workflow.yaml": "workflow: feature\nstage: spec",
  ".scratch/example/issues/01-work.md": "# Repo ticket 中文\nStatus: open",
  ".stintwork/roadmap.md": "## Repo milestone 中文\nId: m1\nStatus: active\n- example",
};

function project(contents: Record<string, string> = files) {
  return indexProject(createMemoryRepoFiles(contents), {
    name: "Repo project 中文",
    branch: "team/中文",
  });
}

test.each<[Error, string, string]>([
  [new TypeError("Failed to fetch"), "Could not reach the project server.", "无法连接项目服务器。"],
  [new TypeError("Load failed"), "Could not reach the project server.", "无法连接项目服务器。"],
  [
    new DOMException("A network error occurred.", "NetworkError"),
    "Could not reach the project server.",
    "无法连接项目服务器。",
  ],
  [
    new TypeError("NetworkError when attempting to fetch resource."),
    "Could not reach the project server.",
    "无法连接项目服务器。",
  ],
  [
    new SyntaxError("Unexpected end of JSON input"),
    "The server returned an invalid response.",
    "服务器返回的响应无效。",
  ],
])(
  "client fetch failure %s changes language without translating author diagnostics",
  async (cause, english, chinese) => {
    const user = userEvent.setup();
    function Failure() {
      const [error, setError] = useErrorText();
      const { setLanguage } = useLanguage();
      return (
        <>
          <button type="button" onClick={() => setError(cause)}>
            Fail
          </button>
          <button type="button" onClick={() => setLanguage("zh-CN")}>
            Chinese
          </button>
          <button type="button" onClick={() => setError(new Error("Author diagnostic 原文"))}>
            Diagnostic
          </button>
          <p role="alert">{error}</p>
        </>
      );
    }
    render(
      <LanguageProvider>
        <Failure />
      </LanguageProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Fail" }));
    expect(screen.getByRole("alert")).toHaveTextContent(english);
    await user.click(screen.getByRole("button", { name: "Chinese" }));
    expect(screen.getByRole("alert")).toHaveTextContent(chinese);
    await user.click(screen.getByRole("button", { name: "Diagnostic" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Author diagnostic 原文");
  },
);

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["en"]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ agents: [] }))),
  );
});

beforeEach(() => {
  window.history.replaceState(null, "", "/?view=pipeline");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.lang = "en";
  window.history.replaceState(null, "", "/");
});

test.each([
  ["zh-CN", "zh-CN", "正在打开你的项目"],
  ["zh-TW", "zh-CN", "正在打开你的项目"],
  ["zh", "zh-CN", "正在打开你的项目"],
  ["fr", "en", "Opening your project"],
  ["en-GB", "en", "Opening your project"],
])("detects %s on the app's connection screen", (preference, language, heading) => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue([preference]);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  render(<App />);
  expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  expect(document.documentElement).toHaveAttribute("lang", language);
  expect(localStorage.getItem(languageStorageKey)).toBeNull();
});

test.each(["zh-Hans", "zh-SG", "ZH-hk"])(
  "uses a later %s preference rather than an unrelated primary language",
  (preference) => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr", preference]);
    render(
      <LanguageProvider>
        <Board snapshot={project()} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("heading", { name: /^流水线/ })).toBeInTheDocument();
  },
);

test.each([
  ["en", "zh-TW", "Pipeline"],
  ["zh-CN", "en-GB", "流水线"],
])("stored %s overrides browser %s", (choice, preference, heading) => {
  localStorage.setItem(languageStorageKey, choice);
  vi.spyOn(navigator, "languages", "get").mockReturnValue([preference]);
  render(
    <LanguageProvider>
      <Board snapshot={project()} />
    </LanguageProvider>,
  );
  expect(screen.getByRole("heading", { name: new RegExp(`^${heading}`) })).toBeInTheDocument();
  expect(document.documentElement).toHaveAttribute("lang", choice);
});

test.each(["unknown", "zh-TW", "", "null"])(
  "invalid stored choice %s falls back to detection",
  (choice) => {
    localStorage.setItem(languageStorageKey, choice);
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["zh-CN"]);
    render(
      <LanguageProvider>
        <Board snapshot={project()} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("heading", { name: /^流水线/ })).toBeInTheDocument();
  },
);

test("blocked localStorage reads and writes still render and switch", async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["zh"]);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
  render(
    <LanguageProvider>
      <Board snapshot={project()} />
    </LanguageProvider>,
  );
  expect(screen.getByRole("heading", { name: /^流水线/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "设置" }));
  await user.click(await screen.findByRole("menuitemradio", { name: "English" }));
  expect(screen.getByRole("heading", { name: /^Pipeline/ })).toBeInTheDocument();
  expect(document.documentElement).toHaveAttribute("lang", "en");
});

test("Settings persists language and the drawer remains reachable in each language", async () => {
  const user = userEvent.setup();
  const rendered = render(
    <LanguageProvider>
      <Board snapshot={project()} />
    </LanguageProvider>,
  );
  for (const language of ["zh-CN", "en"] as const) {
    await user.click(screen.getByRole("button", { name: /Open example:|打开 example：/ }));
    const drawer = await screen.findByRole("dialog", { name: "Repo title 中文" });
    expect(within(drawer).queryByRole("button", { name: /Language|语言/ })).not.toBeInTheDocument();
    await user.click(within(drawer).getByText("01 · Repo ticket 中文"));
    expect(within(drawer).getByText("01 · Repo ticket 中文").closest("details")).toHaveAttribute(
      "open",
    );
    await user.click(within(drawer).getByRole("button", { name: /Close work item|关闭工作项/ }));
    const choices = screen.getByRole("button", {
      name: language === "zh-CN" ? "Settings" : "设置",
    });
    await user.click(choices);
    const choice = await screen.findByRole("menuitemradio", {
      name: language === "en" ? "English" : "简体中文",
    });
    expect(choice).toHaveAttribute("lang", language);
    await user.click(choice);
    expect(choices).toHaveFocus();
    expect(document.documentElement).toHaveAttribute("lang", language);
    expect(localStorage.getItem(languageStorageKey)).toBe(language);
    await user.click(screen.getByRole("button", { name: /Open example:|打开 example：/ }));
    const reopened = await screen.findByRole("dialog", { name: "Repo title 中文" });
    expect(within(reopened).getByText("01 · Repo ticket 中文")).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("item")).toBe("example");
    await user.click(within(reopened).getByRole("button", { name: /Close work item|关闭工作项/ }));
  }
  rendered.unmount();
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["zh-CN"]);
  render(
    <LanguageProvider>
      <Board snapshot={project()} />
    </LanguageProvider>,
  );
  expect(screen.getByRole("heading", { name: /^Pipeline/ })).toBeInTheDocument();
});

test.each(["team", "feature", "constructor"])(
  "Chinese board headings coexist with verbatim %s workflow, stages, and repo content",
  async (id) => {
    const user = userEvent.setup();
    localStorage.setItem(languageStorageKey, "zh-CN");
    const snapshot = project({
      ...files,
      ".stintwork/workflows/team.yaml": JSON.stringify({
        id,
        name: "Team workflow 自定义",
        defaultAgent: "codex",
        stages: [
          { id: "design", name: "Design 自定义", column: "spec", skill: "/design", gate: "manual" },
          { id: "ship", name: "Deliver 自定义", column: "ship", skill: null, gate: "merge" },
        ],
      }),
      ".scratch/example/workflow.yaml": `workflow: ${id}\nstage: design`,
    });
    render(
      <LanguageProvider>
        <Board snapshot={snapshot} />
      </LanguageProvider>,
    );
    for (const name of ["澄清", "规格说明", "工单", "实现", "审查", "交付"])
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    expect(screen.getByText("Repo project 中文")).toBeInTheDocument();
    expect(screen.getByText("team/中文")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "里程碑" }));
    expect(await screen.findByRole("option", { name: "Repo milestone 中文" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    const card = within(screen.getByRole("article", { name: "example: Repo title 中文" }));
    expect(card.getByText("Team workflow 自定义:")).toBeInTheDocument();
    await user.click(card.getByRole("button", { name: "打开 example：Repo title 中文" }));
    const drawer = within(screen.getByRole("dialog", { name: "Repo title 中文" }));
    expect(drawer.getByRole("list", { name: "Team workflow 自定义工作流阶段" })).toHaveTextContent(
      "Design 自定义",
    );
    expect(drawer.getByRole("list", { name: "Team workflow 自定义工作流阶段" })).toHaveTextContent(
      "Deliver 自定义",
    );
  },
);

test.each([
  ["feature", "spec", "功能:"],
  ["bug", "diagnose", "缺陷:"],
  ["quick", "do", "快速工作项:"],
])("built-in %s names survive a JSON snapshot round trip", (id, stage, name) => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  const snapshot = JSON.parse(
    JSON.stringify(
      project({
        ...files,
        ".scratch/example/workflow.yaml": `workflow: ${id}\nstage: ${stage}`,
      }),
    ),
  );
  render(
    <LanguageProvider>
      <Board snapshot={snapshot} />
    </LanguageProvider>,
  );
  const card = within(screen.getByRole("article", { name: "example: Repo title 中文" }));
  expect(card.getByText(name)).toBeInTheDocument();
});

test.each(["defaultAgent", "skill", "gate", "agent", "order"])(
  "a built-in workflow with changed %s is not translated even if names are unchanged",
  (change) => {
    localStorage.setItem(languageStorageKey, "zh-CN");
    const workflow = JSON.parse(JSON.stringify(builtInWorkflows.feature));
    if (change === "defaultAgent") workflow.defaultAgent = "claude";
    if (change === "skill") workflow.stages[0].skill = "/team-clarify";
    if (change === "gate") workflow.stages[0].gate = "spec";
    if (change === "agent") workflow.stages[0].agent = "claude";
    if (change === "order")
      [workflow.stages[0], workflow.stages[1]] = [workflow.stages[1], workflow.stages[0]];
    render(
      <LanguageProvider>
        <Board
          snapshot={project({
            ...files,
            ".stintwork/workflows/feature.yaml": JSON.stringify(workflow),
          })}
        />
      </LanguageProvider>,
    );
    expect(
      within(screen.getByRole("article", { name: "example: Repo title 中文" })).getByText(
        "Feature:",
      ),
    ).toBeInTheDocument();
  },
);

test("warnings and setup checklist chrome translate without changing core warnings or paths", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ ...planSetup(createMemoryRepoFiles(files)), skills: [] })),
    ),
  );
  const user = userEvent.setup();
  localStorage.setItem(languageStorageKey, "zh-CN");
  const snapshot = project();
  snapshot.warnings = [{ path: ".scratch/中文/spec.md", message: "Core warning 原文" }];
  render(
    <LanguageProvider>
      <Board snapshot={snapshot} />
    </LanguageProvider>,
  );
  await user.click(screen.getByRole("button", { name: /^待你处理/ }));
  const warnings = within(await screen.findByRole("region", { name: "项目警告" }));
  expect(warnings.getByText("Core warning 原文")).toBeInTheDocument();
  expect(warnings.getByText(".scratch/中文/spec.md")).toBeInTheDocument();
  expect(warnings.getByText("只读 · 不会更改任何文件。")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "设置" }));
  await user.click(await screen.findByRole("menuitem", { name: /项目设置/ }));
  const setup = within(await screen.findByRole("dialog", { name: "项目设置" }));
  expect(await setup.findByText("工单跟踪指南")).toBeInTheDocument();
  expect(setup.getByText("Agent 指令")).toBeInTheDocument();
  expect(setup.getByText("docs/agents/issue-tracker.md")).toBeInTheDocument();
});

test("Chinese command suggestions have a catalog accessible name and retain repo titles", async () => {
  let changeLanguage: ReturnType<typeof useLanguage>["setLanguage"] = () => {};
  function LanguageChanges() {
    changeLanguage = useLanguage().setLanguage;
    return null;
  }
  localStorage.setItem(languageStorageKey, "zh-CN");
  render(
    <LanguageProvider>
      <LanguageChanges />
      <CommandPalette
        snapshot={project()}
        milestone=""
        onMilestoneChange={() => {}}
        onOpenItem={() => {}}
        onCreateItem={() => {}}
        onCustomiseWorkflow={() => {}}
        onClose={() => {}}
      />
    </LanguageProvider>,
  );
  const suggestions = within(screen.getByRole("listbox", { name: "建议" }));
  expect(suggestions.getByText("Repo title 中文")).toBeInTheDocument();
  expect(suggestions.getByText("Repo milestone 中文")).toBeInTheDocument();
  expect(suggestions.getByRole("option", { name: "自定义功能工作流" })).toBeInTheDocument();
  act(() => changeLanguage("en"));
  expect(screen.getByRole("listbox", { name: "Suggestions" })).toBeInTheDocument();
});

test("Chinese roadmap actions separate copy from Latin milestone names", async () => {
  const user = userEvent.setup();
  localStorage.setItem(languageStorageKey, "zh-CN");
  render(
    <LanguageProvider>
      <RoadmapEditor
        snapshot={project({
          ...files,
          ".stintwork/roadmap.md":
            "## M1 · The board\nId: m1\nStatus: active\n\n## M2 · The drawer\nId: m2\nStatus: planned",
        })}
      />
    </LanguageProvider>,
  );
  await user.click(screen.getByRole("button", { name: "编辑路线图" }));
  const roadmap = within(screen.getByRole("dialog", { name: "编辑路线图" }));
  for (const name of ["M1 · The board", "M2 · The drawer"]) {
    expect(roadmap.getByRole("region", { name })).toBeInTheDocument();
    await user.click(
      within(roadmap.getByRole("region", { name })).getByRole("button", { expanded: false }),
    );
    for (const action of ["重命名", "上移", "下移"])
      expect(roadmap.getByRole("button", { name: `${action} ${name}` })).toBeInTheDocument();
  }
});

test.each(["built-in", "custom-name", "custom-skill", "custom-agent"])(
  "Chinese setup receives snapshot workflows and preserves %s skill content",
  async (customisation) => {
    const user = userEvent.setup();
    localStorage.setItem(languageStorageKey, "zh-CN");
    const workflow = structuredClone(builtInWorkflows.feature);
    if (customisation === "custom-name") {
      workflow.name = "Team workflow 原文";
      workflow.stages[0].name = "Team clarification 原文";
    }
    if (customisation === "custom-skill") workflow.stages[0].skill = "/team-clarify";
    if (customisation === "custom-agent") workflow.defaultAgent = "claude";
    const snapshot = project({
      ...files,
      ".stintwork/workflows/feature.yaml": JSON.stringify(workflow),
    });
    const workflowSkills = [workflow, builtInWorkflows.bug, builtInWorkflows.quick].flatMap(
      (definition) =>
        definition.stages
          .filter(({ skill }) => skill !== null)
          .map((stage) => ({
            workflowId: definition.id,
            stageId: stage.id,
            workflow: definition.name,
            stage: stage.name,
            skill: stage.skill,
            status: "missing",
          })),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              checks: [],
              changes: [],
              warnings: [],
              skills: [
                {
                  agent: "codex",
                  displayName: "Codex",
                  skills: [
                    ...workflowSkills,
                    {
                      workflowId: "team",
                      stageId: "design",
                      workflow: "Team 原文",
                      stage: "Design 原文",
                      skill: "/design",
                      status: "unknown",
                    },
                    {
                      workflowId: "constructor",
                      stageId: "unknown",
                      workflow: "Unknown 原文",
                      stage: "Unknown stage 原文",
                      skill: "/unknown",
                      status: "unknown",
                    },
                    {
                      workflowId: "feature",
                      stageId: "unknown",
                      workflow: workflow.name,
                      stage: "Extra stage 原文",
                      skill: "/extra",
                      status: "unknown",
                    },
                  ],
                },
              ],
            }),
          ),
      ),
    );
    render(
      <LanguageProvider>
        <Board snapshot={snapshot} />
      </LanguageProvider>,
    );
    await user.click(screen.getByRole("button", { name: "设置" }));
    await user.click(await screen.findByRole("menuitem", { name: /项目设置/ }));
    const setup = await screen.findByRole("dialog", { name: "项目设置" });
    await within(setup).findByText(zhCN.planning.setup.noChanges);
    await user.click(
      within(setup).getByText(
        zhCN.planning.setup.skillSummary("Codex", 0, workflowSkills.length + 3, 3),
        { exact: true },
      ),
    );
    const skills = within(await screen.findByRole("region", { name: "Codex 技能" }));
    const rows = skills.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(
      customisation === "built-in" ? "澄清:" : `${workflow.stages[0].name}:`,
    );
    if (customisation === "built-in")
      for (const name of ["澄清", "规格说明", "工单", "实现", "审查"])
        expect(skills.getAllByText(`${name}:`, { exact: false }).length).toBeGreaterThan(0);
    for (const name of [
      customisation === "built-in" ? "功能" : workflow.name,
      "缺陷",
      "快速",
      "Team 原文",
      "Unknown 原文",
    ])
      expect(skills.getByRole("heading", { name })).toBeInTheDocument();
    expect(skills.getByText("诊断:", { exact: false })).toBeInTheDocument();
    expect(skills.getByText("执行:", { exact: false })).toBeInTheDocument();
    expect(skills.getByText("Design 原文:", { exact: false })).toBeInTheDocument();
    expect(skills.getByText("Unknown stage 原文:", { exact: false })).toBeInTheDocument();
    expect(skills.getByText("Extra stage 原文:", { exact: false })).toBeInTheDocument();
    for (const skill of workflowSkills)
      expect(skills.getAllByText(skill.skill as string).length).toBeGreaterThan(0);
  },
);
