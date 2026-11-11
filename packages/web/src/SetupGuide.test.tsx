// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject, planSetup } from "@stintwork/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { en } from "./i18n/en";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { zhCN } from "./i18n/zh-CN";
import { TopBar } from "./TopBar";

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
        onOpenPalette={() => {}}
        onOpenNeedsYou={() => {}}
      />
    </LanguageProvider>,
  );
}
async function open(user: ReturnType<typeof userEvent.setup>, language: "en" | "zh-CN" = "en") {
  const t = language === "en" ? en : zhCN;
  const trigger = screen.getByRole("button", { name: t.topBar.settings });
  trigger.focus();
  await user.keyboard("{Enter}");
  await user.click(
    await screen.findByRole("menuitem", { name: new RegExp(t.topBar.projectSetup) }),
  );
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
    expect(dialog).toHaveAccessibleDescription(t.planning.setup.description);
    const warning = panel.getByRole("alert", { name: t.warningCallout.title(1) });
    expect(within(warning).getByText("Core warning 原文", { exact: true })).toBeVisible();
    expect(within(warning).getByText("docs/中文.md: Core warning 原文")).not.toBeVisible();
    await user.click(within(warning).getByText(t.warningCallout.details));
    expect(within(warning).getByText("docs/中文.md: Core warning 原文")).toBeVisible();
    await user.click(within(warning).getByText(t.warningCallout.details));
    expect(panel.getByRole("group", { name: t.planning.setup.projectChecks })).toBeVisible();
    for (const name of Object.values(t.planning.setup.groups))
      expect(panel.getByRole("region", { name })).toBeVisible();
    const optional = panel.getByRole("region", { name: t.planning.setup.groups.optional });
    expect(
      within(optional).queryByText(t.planning.setup.statuses["needs-change"]),
    ).not.toBeInTheDocument();
    expect(panel.getByText(t.planning.setup.checks.glossary.manual)).toBeVisible();
    expect(panel.getByText(t.planning.setup.checks.adrs.manual)).toBeVisible();
    expect(panel.getByText(t.planning.setup.reasons.localRunData.why)).toBeVisible();
    for (const change of initial.changes)
      expect(panel.getAllByText(change.path, { exact: true })).toHaveLength(1);
    expect(panel.getByText(t.planning.setup.skillExplanation)).toBeVisible();
    const claudeSummary = panel.getByText(t.planning.setup.skillSummary("Claude Code", 1, 2, 0));
    const grokSummary = panel.getByText(t.planning.setup.skillSummary("Grok Build", 0, 1, 1));
    expect(claudeSummary.closest("details")).not.toHaveAttribute("open");
    expect(grokSummary.closest("details")).not.toHaveAttribute("open");
    await user.click(claudeSummary);
    expect(
      panel.getByRole("region", { name: t.planning.setup.agentSkills("Claude Code") }),
    ).toHaveTextContent(`/to-tickets — ${t.planning.setup.missing}`);
    expect(panel.queryByText("/to-spec", { exact: true })).not.toBeInTheDocument();
    await user.click(grokSummary);
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

test("an unknown tracker gets a plain notice and is untouched by default confirmation", async () => {
  const initial = {
    ...guide(),
    ...planSetup(
      createMemoryRepoFiles({
        "docs/agents/issue-tracker.md": "# Issue tracker: Team queue\n\nUse the team queue.\n",
      }),
    ),
  };
  const fetch = server(initial);
  const user = userEvent.setup();
  renderSetup();
  await user.click(screen.getByRole("button", { name: en.topBar.settings }));
  await user.click(await screen.findByRole("menuitem", { name: /Project setup/ }));
  const dialog = await screen.findByRole("dialog", { name: en.planning.setup.title });
  await within(dialog).findByRole("checkbox", {
    name: new RegExp(en.planning.setup.switchTracker),
  });
  expect(dialog).toHaveAccessibleDescription(en.planning.setup.otherNotice);
  await user.click(within(dialog).getByRole("button", { name: en.planning.setup.review(2) }));
  await user.click(within(dialog).getByRole("button", { name: en.planning.setup.apply }));
  const posted = JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body));
  expect(posted.changes.map(({ path }: { path: string }) => path)).toEqual([
    ".gitignore",
    ".stintwork/roadmap.md",
  ]);
});

test("all-found skills stay a single collapsed agent summary, not stage rows", async () => {
  const initial = guide();
  initial.skills = [
    {
      agent: "codex",
      displayName: "Codex",
      skills: Array.from({ length: 10 }, (_, index) => ({
        workflowId: "feature",
        workflow: "Feature",
        stageId: String(index),
        stage: `Stage ${index}`,
        skill: `/stage-${index}`,
        status: "found",
      })),
    },
  ];
  server(initial);
  const user = userEvent.setup();
  renderSetup();
  const { dialog } = await open(user);
  const summary = within(dialog).getByText(en.planning.setup.skillSummary("Codex", 10, 10, 0));
  expect(summary).toBeVisible();
  expect(summary.closest("details")).not.toHaveAttribute("open");
  expect(within(dialog).queryByText("/stage-0")).not.toBeInTheDocument();
  await user.click(summary);
  const skills = within(dialog).getByRole("region", {
    name: en.planning.setup.agentSkills("Codex"),
  });
  expect(within(skills).getByText(en.planning.setup.allSkillsFound)).toBeVisible();
  expect(within(skills).queryByRole("listitem")).not.toBeInTheDocument();
  expect(within(dialog).getAllByText(en.planning.setup.skillExplanation)).toHaveLength(1);
});

test.each(["en", "zh-CN"] as const)(
  "%s preserves GitHub tracking by default and reviews explicit destructive changes",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const tracker = "# Issue tracker: GitHub\n\nUse gh issue list to choose work.\n";
    const initial = {
      ...guide(),
      ...planSetup(createMemoryRepoFiles({ "docs/agents/issue-tracker.md": tracker })),
    };
    const fetch = server(initial);
    const user = userEvent.setup();
    renderSetup();
    const t = language === "en" ? en : zhCN;
    await user.click(screen.getByRole("button", { name: t.topBar.settings }));
    await user.click(
      await screen.findByRole("menuitem", { name: new RegExp(t.topBar.projectSetup) }),
    );
    const dialog = await screen.findByRole("dialog", { name: t.planning.setup.title });
    let checkbox = await within(dialog).findByRole("checkbox", {
      name: new RegExp(t.planning.setup.switchTracker),
    });
    expect(dialog).toHaveAccessibleDescription(t.planning.setup.githubNotice);
    expect(within(dialog).getByText(t.planning.setup.githubTracker)).toBeVisible();
    expect(checkbox).not.toBeChecked();
    expect(within(dialog).getByText(t.planning.setup.replacesLines(2))).toHaveClass(
      "text-blocked-foreground",
    );
    expect(within(dialog).queryByRole("checkbox", { name: "AGENTS.md" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: t.planning.setup.review(2) }));
    expect(
      within(dialog).queryByRole("region", { name: t.planning.setup.removesContent }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("docs/agents/issue-tracker.md", { exact: true }),
    ).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: t.planning.setup.back }));
    checkbox = within(dialog).getByRole("checkbox", {
      name: new RegExp(t.planning.setup.switchTracker),
    });
    await user.click(checkbox);
    expect(within(dialog).getByRole("checkbox", { name: "AGENTS.md" })).not.toBeChecked();
    await user.click(within(dialog).getByRole("checkbox", { name: "AGENTS.md" }));
    await user.click(checkbox);
    expect(within(dialog).queryByRole("checkbox", { name: "AGENTS.md" })).not.toBeInTheDocument();
    await user.click(checkbox);
    expect(within(dialog).getByRole("checkbox", { name: "AGENTS.md" })).not.toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: t.planning.setup.review(3) }));
    const destructive = within(dialog).getByRole("region", {
      name: t.planning.setup.removesContent,
    });
    expect(destructive).toBeVisible();
    expect(within(destructive).getByText(t.planning.setup.replacesLines(2))).toBeVisible();
    expect(destructive.querySelector("details")).toHaveAttribute("open");
    expect(destructive.querySelector('[data-diff-kind="removed"]')).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: t.planning.setup.apply }));
    const posted = JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body));
    expect(posted.changes.map(({ path }: { path: string }) => path)).toEqual([
      "docs/agents/issue-tracker.md",
      ".gitignore",
      ".stintwork/roadmap.md",
    ]);
  },
);

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
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(await screen.findByRole("menuitem", { name: /Project setup/ }));
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
  await user.click(screen.getByRole("checkbox", { name: "docs/agents/issue-tracker.md" }));
  screen.getByRole("checkbox", { name: "AGENTS.md" }).focus();
  await user.keyboard(" ");
  await user.click(screen.getByRole("button", { name: en.planning.setup.review(2) }));
  const review = await screen.findByRole("region", { name: en.planning.setup.confirm });
  expect(review).toHaveFocus();
  expect(within(review).getByText("AGENTS.md")).toBeVisible();
  expect(within(review).queryByText("CLAUDE.md")).not.toBeInTheDocument();
  const diff = within(review).getByRole("region", {
    name: en.planning.setup.changeLabel("AGENTS.md"),
  });
  expect(diff).toHaveTextContent("@@");
  expect(diff.querySelectorAll('[data-diff-kind="added"]').length).toBeGreaterThan(0);
  expect(diff.querySelector('[data-diff-kind="context"]')).toHaveTextContent("# Developer rules");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: en.planning.setup.back }));
  expect(screen.getByRole("checkbox", { name: "AGENTS.md" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: en.planning.setup.review(2) }));
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
      changes: guide().changes.filter(
        ({ path }) => path === "AGENTS.md" || path === "docs/agents/issue-tracker.md",
      ),
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

test.each([
  ["en", false],
  ["zh-CN", false],
  ["en", true],
  ["zh-CN", true],
] as const)(
  "%s setup without proposals retains skills and respects manual attention: %s",
  async (language, needsManualChange) => {
    localStorage.setItem(languageStorageKey, language);
    const t = language === "en" ? en : zhCN;
    const initial = guide();
    initial.changes = [];
    initial.checks = initial.checks.map((check) =>
      check.status === "needs-change" && !(needsManualChange && check.id === "agents")
        ? { ...check, ready: true, status: "ready" }
        : check,
    );
    const fetch = server(initial);
    const user = userEvent.setup();
    renderSetup();
    await user.click(screen.getByRole("button", { name: t.topBar.settings }));
    await user.click(
      await screen.findByRole("menuitem", { name: new RegExp(t.topBar.projectSetup) }),
    );
    expect(
      await screen.findByText(t.planning.setup.skillSummary("Claude Code", 1, 2, 0)),
    ).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    if (needsManualChange) {
      expect(screen.queryByText(t.planning.setup.noChanges)).not.toBeInTheDocument();
      expect(screen.getByRole("group", { name: t.planning.setup.projectChecks })).toBeVisible();
      expect(screen.getByText(t.planning.setup.noAutomaticFix)).toBeVisible();
      expect(screen.getByText(t.planning.setup.statuses["needs-change"])).toBeVisible();
      expect(
        screen.getByRole("button", { name: (name) => name === t.planning.setup.review(0) }),
      ).toBeDisabled();
    } else {
      expect(screen.getByText(t.planning.setup.noChanges)).toBeVisible();
      expect(
        screen.queryByRole("group", { name: t.planning.setup.projectChecks }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: t.planning.setup.close })).toBeEnabled();
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]?.method).not.toBe("POST");
  },
);

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
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(await screen.findByRole("menuitem", { name: /Project setup/ }));
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
