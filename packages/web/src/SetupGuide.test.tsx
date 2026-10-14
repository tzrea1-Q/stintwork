// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject, planSetup } from "@stintwork/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { TopBar } from "./TopBar";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { en } from "./i18n/en";
import { zhCN } from "./i18n/zh-CN";

const original = "# Developer rules\nKeep this exactly.\n";
const files = createMemoryRepoFiles({ "AGENTS.md": original });
function guide() {
  return {
    ...planSetup(files),
    skills: [
      {
        agent: "claude",
        displayName: "Claude Code",
        skills: [
          {
            workflowId: "feature",
            stageId: "spec",
            workflow: "Feature",
            stage: "Spec",
            skill: "/to-spec",
            status: "found",
          },
          {
            workflowId: "feature",
            stageId: "tickets",
            workflow: "Feature",
            stage: "Tickets",
            skill: "/to-tickets",
            status: "missing",
            installationHint:
              "Use npx skills@latest add mattpocock/skills, select Claude Code and /to-tickets. Expected locations: ~/.claude/skills/, <project>/.agents/skills/. For a custom skill, use its own source. Stintwork does not install skills.",
          },
        ],
      },
      {
        agent: "grok",
        displayName: "Grok Build",
        skills: [
          {
            workflowId: "team",
            stageId: "design",
            workflow: "Team",
            stage: "Design",
            skill: "/design",
            status: "unknown",
          },
        ],
      },
    ],
  };
}
function server(initial = guide()) {
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      const { changes } = JSON.parse(String(options.body));
      return new Response(
        JSON.stringify({
          ...initial,
          changes: initial.changes.filter(
            ({ path }) => !changes.some((change: { path: string }) => change.path === path),
          ),
          commit: "a".repeat(40),
        }),
      );
    }
    return new Response(JSON.stringify(initial));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function renderSetup() {
  render(
    <LanguageProvider>
      <TopBar
        snapshot={indexProject(files, { name: "Project" })}
        milestone=""
        onMilestoneChange={() => {}}
        onOpenPalette={() => {}}
        onOpenNeedsYou={() => {}}
      />
    </LanguageProvider>,
  );
}
async function open(user: ReturnType<typeof userEvent.setup>, language: "en" | "zh-CN" = "en") {
  const t = language === "en" ? en : zhCN;
  const trigger = screen.getByRole("button", { name: /^Setup|^设置/ });
  trigger.focus();
  await user.keyboard("{Enter}");
  const dialog = await screen.findByRole("dialog", { name: t.planning.setup.title });
  await within(dialog).findByRole("checkbox", { name: "AGENTS.md" });
  return { dialog, trigger, t };
}
afterEach(() => {
  localStorage.clear();
  document.documentElement.lang = "en";
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

test.each(["en", "zh-CN"] as const)(
  "%s dialog groups checks, explains manual fixes and keeps skills read-only and collapsed",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const initial = guide();
    initial.warnings = [{ path: "docs/中文.md", message: "Core warning 原文" }];
    const fetch = server(initial);
    const user = userEvent.setup();
    renderSetup();
    const { dialog, trigger, t } = await open(user, language);
    const panel = within(dialog);
    expect(dialog).toHaveAccessibleDescription(t.planning.setup.summary(5, 5));
    const warning = panel.getByRole("alert", { name: t.warningCallout.title(1) });
    expect(within(warning).getByText("Core warning 原文", { exact: true })).toBeVisible();
    expect(within(warning).getByText("docs/中文.md: Core warning 原文")).not.toBeVisible();
    await user.click(within(warning).getByText(t.warningCallout.details));
    expect(within(warning).getByText("docs/中文.md: Core warning 原文")).toBeVisible();
    await user.click(within(warning).getByText(t.warningCallout.details));
    expect(panel.getByRole("list", { name: t.planning.setup.projectChecks })).toBeVisible();
    expect(panel.getByText(t.planning.setup.checks.glossary.manual)).toBeVisible();
    expect(panel.getByText(t.planning.setup.checks.adrs.manual)).toBeVisible();
    expect(panel.getByText(t.planning.setup.trackerFix)).toBeVisible();
    expect(panel.getByText(t.planning.setup.reasons.localRunData.why)).toBeVisible();
    for (const change of initial.changes)
      expect(panel.getAllByText(change.path, { exact: true })).toHaveLength(1);
    expect(panel.getByText(t.planning.setup.skillExplanation)).not.toBeVisible();
    await user.click(panel.getByText(t.planning.setup.skills, { exact: true }));
    expect(panel.getByText(t.planning.setup.skillExplanation)).toBeVisible();
    expect(
      panel.getByRole("region", { name: t.planning.setup.agentSkills("Claude Code") }),
    ).toHaveTextContent(`/to-spec — ${t.planning.setup.found}`);
    expect(
      panel.getByRole("region", { name: t.planning.setup.agentSkills("Grok Build") }),
    ).toHaveTextContent(`/design — ${t.planning.setup.unknown}`);
    expect(panel.getByText(/npx skills@latest add mattpocock\/skills/)).toHaveTextContent(
      "~/.claude/skills/",
    );
    expect(fetch.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  },
);

test("preview disclosures are independent and preserve long developer content", async () => {
  const initial = guide();
  initial.changes[1].content = "Long proposed instructions 原文 ".repeat(100);
  server(initial);
  const user = userEvent.setup();
  renderSetup();
  await open(user);
  const instructions = screen.getByRole("region", {
    name: en.planning.setup.changeLabel("AGENTS.md"),
  });
  await user.click(within(instructions).getByText(en.planning.setup.previewDiff));
  expect(instructions.querySelector("details")).toHaveAttribute("open");
  expect(instructions.querySelector('[data-diff-kind="added"]')?.textContent).toBe(
    `+${initial.changes[1].content}\n`,
  );
  const roadmap = screen.getByRole("region", {
    name: en.planning.setup.changeLabel(".stintwork/roadmap.md"),
  });
  expect(roadmap.querySelector("details")).not.toHaveAttribute("open");
});

test("an existing nonlocal tracker puts its fix under local Markdown, not the ready guide", async () => {
  const contents = Object.fromEntries(
    planSetup(createMemoryRepoFiles({})).changes.map(({ path, content }) => [path, content]),
  );
  const initial = {
    ...guide(),
    ...planSetup(
      createMemoryRepoFiles({
        ...contents,
        "docs/agents/issue-tracker.md": "Use GitHub Issues.",
        "GLOSSARY.md": "# Project terms",
        "docs/adr/0001-choice.md": "# A decision",
      }),
    ),
  };
  initial.skills = [];
  server(initial);
  const user = userEvent.setup();
  renderSetup();
  await user.click(screen.getByRole("button", { name: /^Setup/ }));
  const checkbox = await screen.findByRole("checkbox", { name: "docs/agents/issue-tracker.md" });
  const row = checkbox.closest("li");
  if (!row) throw new Error("Missing check row");
  expect(within(row).getByText(en.planning.setup.checks.markdown.name)).toBeVisible();
  expect(screen.getByText(en.planning.setup.checks.tracker.name)).not.toBeVisible();
  expect(screen.getByRole("dialog")).toHaveAccessibleDescription(en.planning.setup.summary(1, 1));
  await user.click(screen.getByText(en.planning.setup.skills, { exact: true }));
  expect(screen.getByText(en.planning.setup.noSkills)).toBeVisible();
});

test("loading offers only Cancel and becomes selectable after the preview arrives", async () => {
  let release = (_response: Response) => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    ),
  );
  const user = userEvent.setup();
  renderSetup();
  await user.click(screen.getByRole("button", { name: /^Setup/ }));
  expect(await screen.findByRole("status")).toHaveTextContent(en.planning.setup.loading);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(within(screen.getByRole("dialog")).getAllByRole("button")).toHaveLength(1);
  release(new Response(JSON.stringify(guide())));
  await screen.findByRole("checkbox", { name: "AGENTS.md" });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("keyboard selection reviews only selected diffs, goes back and commits after confirmation", async () => {
  const fetch = server();
  const user = userEvent.setup();
  renderSetup();
  const { trigger } = await open(user);
  for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
  expect(screen.getByRole("button", { name: en.planning.setup.review(0) })).toBeDisabled();
  screen.getByRole("checkbox", { name: "AGENTS.md" }).focus();
  await user.keyboard(" ");
  await user.click(screen.getByRole("button", { name: en.planning.setup.review(1) }));
  const review = await screen.findByRole("region", { name: en.planning.setup.confirm });
  expect(review).toHaveFocus();
  expect(within(review).getByText("AGENTS.md")).toBeVisible();
  expect(within(review).queryByText("CLAUDE.md")).not.toBeInTheDocument();
  const diff = within(review).getByRole("region", { name: en.codeBlock });
  expect(diff).toHaveTextContent("@@");
  expect(diff.querySelectorAll('[data-diff-kind="added"]').length).toBeGreaterThan(0);
  expect(diff.querySelector('[data-diff-kind="context"]')).toHaveTextContent("# Developer rules");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: en.planning.setup.back }));
  expect(screen.getByRole("checkbox", { name: "AGENTS.md" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: en.planning.setup.review(1) }));
  await user.click(screen.getByRole("button", { name: en.planning.setup.apply }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    en.planning.setup.committed("aaaaaaa"),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: en.planning.setup.close })).toHaveFocus(),
  );
  expect(fetch).toHaveBeenLastCalledWith("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      confirmed: true,
      changes: guide().changes.filter(({ path }) => path === "AGENTS.md"),
    }),
  });
  await user.click(screen.getByRole("button", { name: en.planning.setup.close }));
  await waitFor(() => expect(trigger).toHaveFocus());
});

test("refusal retains selected previews and allows confirmation retry", async () => {
  const fetch = server();
  const user = userEvent.setup();
  renderSetup();
  await open(user);
  fetch.mockImplementationOnce(
    async () =>
      new Response(
        JSON.stringify({ reason: "Commit uncommitted changes to AGENTS.md before setup." }),
        { status: 409 },
      ),
  );
  await user.click(screen.getByRole("button", { name: en.planning.setup.review(5) }));
  await user.click(screen.getByRole("button", { name: en.planning.setup.apply }));
  expect(await screen.findByRole("alert")).toHaveTextContent("uncommitted changes to AGENTS.md");
  expect(
    screen
      .getByRole("region", { name: en.planning.setup.changeLabel("AGENTS.md") })
      .querySelector("details"),
  ).toHaveAttribute("open");
  await user.click(screen.getByRole("button", { name: en.planning.setup.back }));
  expect(screen.getByRole("checkbox", { name: "AGENTS.md" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: en.planning.setup.review(5) }));
  await user.click(screen.getByRole("button", { name: en.planning.setup.apply }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    en.planning.setup.committed("aaaaaaa"),
  );
});

test("pending writes block Escape, outside dismissal and all footer actions", async () => {
  const fetch = server();
  const user = userEvent.setup();
  renderSetup();
  const { dialog, trigger } = await open(user);
  let release = (_response: Response) => {};
  fetch.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  await user.click(screen.getByRole("button", { name: en.planning.setup.review(5) }));
  await user.click(screen.getByRole("button", { name: en.planning.setup.apply }));
  expect(screen.getByRole("button", { name: en.planning.setup.saving })).toBeDisabled();
  expect(screen.getByRole("button", { name: en.planning.setup.back })).toBeDisabled();
  expect(screen.getByRole("button", { name: en.planning.setup.cancel })).toBeDisabled();
  await user.keyboard("{Escape}");
  const overlay = document.querySelector(".bg-backdrop");
  if (!(overlay instanceof HTMLElement)) throw new Error("Missing dialog overlay");
  await user.click(overlay);
  expect(dialog).toBeInTheDocument();
  release(new Response(JSON.stringify({ ...guide(), changes: [], commit: "a".repeat(40) })));
  await screen.findByRole("status");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
});

test.each(["cancel", "escape", "outside"])(
  "%s discards unsaved selection like Create and returns focus",
  async (action) => {
    server();
    const user = userEvent.setup();
    renderSetup();
    const { dialog, trigger } = await open(user);
    await user.click(screen.getByRole("checkbox", { name: "AGENTS.md" }));
    if (action === "cancel")
      await user.click(screen.getByRole("button", { name: en.planning.setup.cancel }));
    else if (action === "escape") await user.keyboard("{Escape}");
    else {
      const overlay = document.querySelector(".bg-backdrop");
      if (!(overlay instanceof HTMLElement)) throw new Error("Missing dialog overlay");
      await user.click(overlay);
    }
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    await open(user);
    expect(screen.getByRole("checkbox", { name: "AGENTS.md" })).toBeChecked();
  },
);

test("ready checks fold together and empty setup offers Close, not a write", async () => {
  const initial = guide();
  initial.changes = [];
  initial.checks = initial.checks.map((check) => ({ ...check, ready: true }));
  server(initial);
  const user = userEvent.setup();
  renderSetup();
  await user.click(screen.getByRole("button", { name: /^Setup/ }));
  expect(await screen.findByText(en.planning.setup.noChanges)).toBeVisible();
  expect(screen.getByText(en.planning.setup.checks.glossary.name)).not.toBeVisible();
  await user.click(screen.getByText(en.planning.setup.readyCount(5)));
  expect(screen.getByText(en.planning.setup.checks.glossary.name)).toBeVisible();
  expect(screen.getAllByText(en.planning.setup.ready, { exact: true })).toHaveLength(5);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: en.planning.setup.close })).toBeEnabled();
});

test.each(["network", "server", "invalid"])(
  "%s load failure offers retry without file writes",
  async (kind) => {
    const fetch = server();
    fetch.mockImplementationOnce(async () => {
      if (kind === "network") throw new Error("Cannot reach project server.");
      return new Response(
        JSON.stringify(
          kind === "invalid" ? { changes: [] } : { reason: en.planning.setup.errors.load },
        ),
        { status: kind === "invalid" ? 200 : 503 },
      );
    });
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByRole("button", { name: /^Setup/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      kind === "network" ? "Cannot reach project server." : en.planning.setup.errors.load,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: en.planning.setup.retry }));
    await screen.findByRole("checkbox", { name: "AGENTS.md" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);
