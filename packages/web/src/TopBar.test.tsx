// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { attentionSnapshot } from "./attention-test-fixtures";
import { Board } from "./Board";
import { en } from "./i18n/en";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { zhCN } from "./i18n/zh-CN";
import { TopBar } from "./TopBar";

const snapshot = indexProject(createMemoryRepoFiles({}), { name: "Project", branch: "main" });

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderTopBar(project = snapshot) {
  const onOpenPalette = vi.fn();
  const onOpenNeedsYou = vi.fn();
  return {
    ...render(
      <LanguageProvider>
        <TopBar
          snapshot={project}
          view="pipeline"
          onViewChange={() => {}}
          onOpenPalette={onOpenPalette}
          onOpenNeedsYou={onOpenNeedsYou}
        />
      </LanguageProvider>,
    ),
    onOpenPalette,
    onOpenNeedsYou,
  };
}

test.each(["en", "zh-CN"] as const)(
  "Settings persists keyboard and pointer language choices (%s)",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const t = language === "en" ? en : zhCN;
    const user = userEvent.setup();
    renderTopBar();
    const trigger = screen.getByRole("button", { name: t.topBar.settings });
    expect(screen.queryByRole("button", { name: t.topBar.language })).not.toBeInTheDocument();
    trigger.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu", { name: t.topBar.settings });
    const current = within(menu).getByRole("menuitemradio", { name: t.topBar.languages[language] });
    await waitFor(() => expect(current).toHaveFocus());
    expect(current).toHaveAttribute("aria-checked", "true");
    expect(current).toHaveAttribute("lang", language);
    expect(current.querySelector("svg")).toBeInTheDocument();
    expect(within(menu).getByRole("group", { name: t.topBar.language })).toBeInTheDocument();
    const leave = new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body });
    Object.defineProperty(leave, "pointerType", { value: "mouse" });
    fireEvent(current, leave);
    await user.keyboard(language === "en" ? "{ArrowDown}" : "{ArrowUp}");
    const other = language === "en" ? "zh-CN" : "en";
    expect(
      within(menu).getByRole("menuitemradio", { name: t.topBar.languages[other] }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(document.documentElement.lang).toBe(other);
    expect(localStorage.getItem(languageStorageKey)).toBe(other);
    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("menuitemradio", { checked: true })).toHaveFocus());
    await user.click(screen.getByRole("menuitemradio", { name: t.topBar.languages[language] }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.documentElement.lang).toBe(language);
    expect(localStorage.getItem(languageStorageKey)).toBe(language);
  },
);

test.each(["en", "zh-CN"] as const)(
  "Settings dismisses and opens project setup with focus return (%s)",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const t = language === "en" ? en : zhCN;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ checks: [], changes: [], warnings: [], skills: [] })),
      ),
    );
    const user = userEvent.setup();
    const { container } = renderTopBar();
    const trigger = screen.getByRole("button", { name: t.topBar.settings });
    expect(trigger).toHaveAccessibleDescription(t.topBar.setupIncomplete);
    expect(trigger.querySelector("[data-warning-dot]")).toBeInTheDocument();
    await user.click(trigger);
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    await screen.findByRole("menu");
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    for (const dismissal of ["escape", "outside", "close"]) {
      trigger.focus();
      await user.keyboard("{Enter}");
      const item = await screen.findByRole("menuitem", { name: new RegExp(t.topBar.projectSetup) });
      expect(item).toHaveTextContent("0/5");
      await user.keyboard("{End}");
      expect(item).toHaveFocus();
      await user.keyboard("{Enter}");
      const panel = await screen.findByRole("dialog", { name: t.planning.setup.title });
      expect(container).not.toContainElement(panel);
      expect(await within(panel).findByText(t.planning.setup.noChanges)).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
      if (dismissal === "escape") await user.keyboard("{Escape}");
      else if (dismissal === "outside") fireEvent.pointerDown(document.body);
      else await user.click(within(panel).getByRole("button", { name: t.planning.setup.close }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
    }
  },
);

test("complete setup removes the warning description and keeps its count in Settings", async () => {
  const project = {
    ...snapshot,
    setup: {
      ...snapshot.setup,
      hasIssueTracker: true,
      usesLocalMarkdown: true,
      hasAgents: true,
      hasGlossary: true,
      hasAdrs: true,
    },
  };
  const user = userEvent.setup();
  renderTopBar(project);
  const trigger = screen.getByRole("button", { name: "Settings" });
  expect(trigger).not.toHaveAttribute("aria-describedby");
  expect(trigger.querySelector("[data-warning-dot]")).not.toBeInTheDocument();
  await user.click(trigger);
  expect(await screen.findByRole("menuitem", { name: /Project setup/ })).toHaveTextContent("5/5");
});

test("the top bar exposes only the three actions and announces warnings without adding them to the count", async () => {
  const user = userEvent.setup();
  const { onOpenPalette, onOpenNeedsYou } = renderTopBar({
    ...snapshot,
    warnings: [{ path: "spec.md", message: "Unreadable" }],
  });
  const header = screen.getByRole("banner");
  expect(
    within(header.querySelector(".top-actions") as HTMLElement).getAllByRole("button"),
  ).toHaveLength(3);
  expect(within(header).queryByRole("combobox")).not.toBeInTheDocument();
  const needsYou = within(header).getByRole("button", { name: "Needs you 0 · 1 warning" });
  expect(needsYou.querySelector("[data-warning-dot]")).toBeInTheDocument();
  expect(needsYou.textContent).toBe("");
  await user.click(needsYou);
  expect(onOpenNeedsYou).toHaveBeenCalledOnce();
  await user.click(within(header).getByRole("button", { name: "Open command palette" }));
  expect(onOpenPalette).toHaveBeenCalledOnce();
});

test("view navigation preserves URL parameters and restores history", async () => {
  window.history.replaceState({}, "", "/?milestone=m1");
  const user = userEvent.setup();
  render(
    <LanguageProvider>
      <Board snapshot={snapshot} />
    </LanguageProvider>,
  );
  const nav = screen.getByRole("navigation", { name: en.viewNavigation.label });
  const overview = within(nav).getByRole("button", { name: en.viewNavigation.overview });
  const pipeline = within(nav).getByRole("button", { name: en.viewNavigation.pipeline });
  expect(pipeline).toHaveAttribute("aria-current", "page");
  overview.focus();
  await user.keyboard("{Enter}");
  expect(overview).toHaveAttribute("aria-current", "page");
  expect(screen.getByText(en.viewNavigation.description)).toBeInTheDocument();
  expect(window.location.search).toContain("milestone=m1");
  expect(window.location.search).toContain("view=overview");
  await user.click(
    within(screen.getByRole("main")).getByRole("button", { name: en.viewNavigation.pipeline }),
  );
  expect(pipeline).toHaveAttribute("aria-current", "page");
  expect(window.location.search).toContain("view=pipeline");
  window.history.back();
  await waitFor(() => expect(overview).toHaveAttribute("aria-current", "page"));
  window.history.forward();
  await waitFor(() => expect(pipeline).toHaveAttribute("aria-current", "page"));
  window.history.replaceState({}, "", "/");
});

test("Needs you displays a badge for attention items", () => {
  const project = attentionSnapshot();
  renderTopBar(project);
  const count = project.attentionItems.length;
  expect(count).toBeGreaterThan(0);
  const trigger = screen.getByRole("button", { name: new RegExp(`^Needs you ${count}`) });
  expect(trigger).toHaveTextContent(String(count));
});

test("roadmap draft survives back to Overview and forward to Pipeline", async () => {
  window.history.replaceState({}, "", "/?view=overview");
  const user = userEvent.setup();
  render(
    <LanguageProvider>
      <Board snapshot={snapshot} />
    </LanguageProvider>,
  );
  await user.click(
    within(screen.getByRole("navigation", { name: en.viewNavigation.label })).getByRole("button", {
      name: en.viewNavigation.pipeline,
    }),
  );
  await user.click(screen.getByRole("button", { name: en.planning.roadmap.title }));
  const input = screen.getByRole("textbox", { name: en.planning.roadmap.newName });
  await user.type(input, "Draft milestone");
  window.history.back();
  await waitFor(() => expect(document.querySelector(".pipeline-main")).toHaveAttribute("hidden"));
  expect(input).toHaveValue("Draft milestone");
  window.history.forward();
  await waitFor(() =>
    expect(document.querySelector(".pipeline-main")).not.toHaveAttribute("hidden"),
  );
  expect(screen.getByRole("textbox", { name: en.planning.roadmap.newName })).toHaveValue(
    "Draft milestone",
  );
});

test("selecting a palette milestone from Overview shows Pipeline", async () => {
  window.history.replaceState({}, "", "/?view=overview");
  const project = {
    ...snapshot,
    milestones: [
      { id: "m1", name: "First milestone", status: "active" as const, workItemSlugs: [] },
    ],
  };
  const user = userEvent.setup();
  render(
    <LanguageProvider>
      <Board snapshot={project} />
    </LanguageProvider>,
  );
  await user.click(screen.getByRole("button", { name: en.topBar.openPalette }));
  await user.click(screen.getByRole("option", { name: "First milestone" }));
  expect(
    screen
      .getByRole("navigation", { name: en.viewNavigation.label })
      .querySelector('[aria-current="page"]'),
  ).toHaveTextContent(en.viewNavigation.pipeline);
  expect(screen.getByRole("combobox", { name: en.topBar.milestone })).toHaveTextContent(
    "First milestone",
  );
});

test("Overview shows connection status and last available error", () => {
  window.history.replaceState({}, "", "/?view=overview");
  render(
    <LanguageProvider>
      <Board snapshot={snapshot} connection="reconnecting" error="Connection lost." />
    </LanguageProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent(en.board.reconnecting);
  expect(screen.getByRole("alert")).toHaveTextContent(`Connection lost.${en.board.lastAvailable}`);
});

test("switching views moves focus to the selected navigation pill", async () => {
  window.history.replaceState({}, "", "/?view=overview");
  const user = userEvent.setup();
  render(
    <LanguageProvider>
      <Board snapshot={snapshot} />
    </LanguageProvider>,
  );
  const nav = screen.getByRole("navigation", { name: en.viewNavigation.label });
  const pipeline = within(nav).getByRole("button", { name: en.viewNavigation.pipeline });
  await user.click(
    within(screen.getByRole("main")).getByRole("button", { name: en.viewNavigation.pipeline }),
  );
  expect(pipeline).toHaveFocus();
  const overview = within(nav).getByRole("button", { name: en.viewNavigation.overview });
  await user.click(overview);
  expect(overview).toHaveFocus();
});
