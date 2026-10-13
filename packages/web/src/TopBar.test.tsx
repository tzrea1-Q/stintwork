// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { TopBar } from "./TopBar";
import { LanguageProvider, languageStorageKey } from "./i18n/language";

const snapshot = indexProject(createMemoryRepoFiles({}), { name: "Project", branch: "main" });

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderTopBar() {
  return render(
    <LanguageProvider>
      <TopBar
        snapshot={snapshot}
        milestone=""
        onMilestoneChange={() => {}}
        onOpenPalette={() => {}}
        onOpenNeedsYou={() => {}}
      />
    </LanguageProvider>,
  );
}

test("the language menu focuses the current radio and persists keyboard selection", async () => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  const user = userEvent.setup();
  renderTopBar();
  const trigger = screen.getByRole("button", { name: "语言" });
  expect(trigger).toHaveTextContent("简体中文");
  expect(screen.queryByRole("combobox", { name: "语言" })).not.toBeInTheDocument();
  trigger.focus();
  await user.keyboard("{Enter}");
  const current = await screen.findByRole("menuitemradio", { name: "简体中文" });
  await waitFor(() => expect(current).toHaveFocus());
  expect(current).toHaveAttribute("aria-checked", "true");
  expect(current).toHaveAttribute("lang", "zh-CN");
  expect(current.querySelector("svg")).toBeInTheDocument();
  const english = screen.getByRole("menuitemradio", { name: "English" });
  expect(english).toHaveAttribute("lang", "en");
  expect(english).toHaveAttribute("aria-checked", "false");
  await user.keyboard("{ArrowUp}");
  expect(english).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(current).toHaveFocus();
  await user.keyboard("{ArrowUp}{Enter}");
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAccessibleName("Language");
  expect(trigger).toHaveTextContent("English");
  expect(localStorage.getItem(languageStorageKey)).toBe("en");
  expect(document.documentElement).toHaveAttribute("lang", "en");
});

test("pointer opening focuses the current language; Escape and outside press return focus", async () => {
  localStorage.setItem(languageStorageKey, "en");
  const user = userEvent.setup();
  renderTopBar();
  const trigger = screen.getByRole("button", { name: "Language" });
  await user.click(trigger);
  await waitFor(() => expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveFocus());
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  expect(await screen.findByRole("menu")).toBeVisible();
  fireEvent.pointerDown(document.body);
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  expect(localStorage.getItem(languageStorageKey)).toBe("en");
});

test.each([
  ["Warnings", "Project warnings", "No warnings. Project files are readable."],
  ["Setup", "Project setup", "No setup file changes needed."],
])(
  "%s opens a portalled panel with keyboard dismissal and focus return",
  async (name, label, content) => {
    localStorage.setItem(languageStorageKey, "en");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ changes: [], warnings: [], skills: [] }))),
    );
    const user = userEvent.setup();
    const { container } = renderTopBar();
    const trigger = screen.getByRole("button", { name: new RegExp(`^${name}`) });
    trigger.focus();
    await user.keyboard("{Enter}");
    const panel = await screen.findByRole("dialog", { name: label });
    expect(container).not.toContainElement(panel);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(await within(panel).findByText(content)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(await screen.findByRole("dialog", { name: label })).toBeVisible();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  },
);
