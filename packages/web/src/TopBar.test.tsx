// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { TopBar } from "./TopBar";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { en } from "./i18n/en";
import { zhCN } from "./i18n/zh-CN";

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
        <TopBar snapshot={project} onOpenPalette={onOpenPalette} onOpenNeedsYou={onOpenNeedsYou} />
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
  expect(await screen.findByRole("menuitem", { name: /Project setup…/ })).toHaveTextContent("5/5");
});

test("the top bar exposes only the three actions and announces warnings without adding them to the count", async () => {
  const user = userEvent.setup();
  const { onOpenPalette, onOpenNeedsYou } = renderTopBar({
    ...snapshot,
    warnings: [{ path: "spec.md", message: "Unreadable" }],
  });
  const header = screen.getByRole("banner");
  expect(within(header).getAllByRole("button")).toHaveLength(3);
  expect(within(header).queryByRole("combobox")).not.toBeInTheDocument();
  const needsYou = within(header).getByRole("button", { name: "Needs you 0 · 1 warning" });
  expect(needsYou.querySelector("[data-warning-dot]")).toBeInTheDocument();
  expect(needsYou).toHaveTextContent("Needs you0");
  await user.click(needsYou);
  expect(onOpenNeedsYou).toHaveBeenCalledOnce();
  await user.click(within(header).getByRole("button", { name: "Open command palette" }));
  expect(onOpenPalette).toHaveBeenCalledOnce();
});
