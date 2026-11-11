// SPDX-License-Identifier: Apache-2.0

import { type AttentionItem, deriveAttentionItems } from "@stintwork/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  attentionOptions,
  attentionProfile,
  attentionSnapshot,
  loginAttentionProfile,
  mixedAttentionSnapshot,
} from "./attention-test-fixtures";
import { Board } from "./Board";
import { en } from "./i18n/en";
import { LanguageProvider, languageStorageKey, useLanguage } from "./i18n/language";
import { zhCN } from "./i18n/zh-CN";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

test.each(["en", "zh-CN"] as const)(
  "Needs you separates warnings from attention and handles every empty state (%s)",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const t = language === "en" ? en : zhCN;
    const snapshot = attentionSnapshot();
    const warning = {
      path: `.scratch/${"long-path/".repeat(30)}spec.md`,
      message: `Original warning 原文\n${"long-detail".repeat(80)}`,
    };
    const user = userEvent.setup();
    const { rerender } = render(
      <LanguageProvider>
        <Board snapshot={snapshot} />
      </LanguageProvider>,
    );
    for (const [items, warnings] of [
      [true, true],
      [false, true],
      [true, false],
      [false, false],
    ]) {
      const next = {
        ...snapshot,
        attentionItems: items ? snapshot.attentionItems : [],
        warnings: warnings ? [warning] : [],
      };
      rerender(
        <LanguageProvider>
          <Board snapshot={next} />
        </LanguageProvider>,
      );
      const count = next.attentionItems.length;
      const trigger = screen.getByRole("button", {
        name: `${t.topBar.needsYou} ${count}${warnings ? ` · ${t.warningCallout.title(1)}` : ""}`,
      });
      expect(Boolean(trigger.querySelector("[data-warning-dot]"))).toBe(warnings);
      await user.click(trigger);
      const sheet = await screen.findByRole("dialog", { name: `${t.needsYou.heading} ${count}` });
      const section = within(sheet).queryByRole("region", { name: t.topBar.projectWarnings });
      expect(Boolean(section)).toBe(warnings);
      if (section) {
        expect(within(section).getByText(warning.path)).toHaveAttribute("title", warning.path);
        expect(within(section).getByText("Original warning 原文", { exact: true })).toBeVisible();
        const detail = within(section).getByText(`${warning.path}: ${warning.message}`, {
          normalizer: (text) => text,
        });
        expect(detail).not.toBeVisible();
        await user.click(within(section).getByText(t.warningCallout.details));
        expect(detail).toBeVisible();
        await user.click(within(section).getByText(t.warningCallout.details));
        expect(detail).not.toBeVisible();
        expect(within(section).queryByRole("article")).not.toBeInTheDocument();
        expect(section.classList.contains("border-t")).toBe(items);
        if (items)
          expect(
            within(sheet).getAllByRole("article")[0].compareDocumentPosition(section) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ).toBeTruthy();
      }
      expect(Boolean(within(sheet).queryByText(t.needsYou.empty))).toBe(!items);
      if (!items && section)
        expect(
          within(sheet).getByText(t.needsYou.empty).compareDocumentPosition(section) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(trigger).toHaveFocus());
    }
  },
);

test("Needs you contains keyboard focus, dismisses outside and restores its opener", async () => {
  const user = userEvent.setup();
  const { container } = render(<Board snapshot={attentionSnapshot()} />);
  const trigger = screen.getByRole("button", { name: "Needs you 1" });
  await user.click(trigger);
  const queue = screen.getByRole("dialog", { name: "Needs you 1" });
  expect(container).not.toContainElement(queue);
  const close = within(queue).getByRole("button", { name: "Close Needs you" });
  expect(close).toHaveFocus();
  await user.tab({ shift: true });
  expect(queue).toContainElement(document.activeElement as HTMLElement);
  await user.tab();
  expect(close).toHaveFocus();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.keyboard("{Enter}");
  await new Promise((resolve) => setTimeout(resolve, 0));
  fireEvent.pointerDown(document.body);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});

test("keyboard navigation from Needs you focuses the drawer, then returns to the work item", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={attentionSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  screen.getByRole("button", { name: "First work item · first" }).focus();
  await user.keyboard("{Enter}");
  const close = await screen.findByRole("button", { name: "Close work item" });
  await waitFor(() => expect(close).toHaveFocus());
  expect(screen.queryByRole("dialog", { name: "Needs you 1" })).not.toBeInTheDocument();
  await user.click(close);
  await waitFor(() => expect(document.activeElement).toHaveAttribute("data-work-item", "first"));
});

test("selecting the open work item returns focus to the drawer's permission banner", async () => {
  const user = userEvent.setup();
  render(<Board snapshot={attentionSnapshot()} />);
  await user.click(screen.getByRole("button", { name: /First work item/ }));
  const drawer = screen.getByRole("dialog", { name: "First work item" });
  const banner = within(drawer).getByRole("button", { name: en.needsYou.pendingPermissions });
  await user.click(banner);
  const queue = screen.getByRole("dialog", { name: "Needs you 1" });
  await user.click(within(queue).getByRole("button", { name: "First work item · first" }));
  expect(screen.queryByRole("dialog", { name: "Needs you 1" })).not.toBeInTheDocument();
  await waitFor(() => expect(banner).toHaveFocus());
});

test("permission answer refusals retain their code through the queue", async () => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          reason: "This permission request's stint has ended.",
          reasonMessage: { code: "permission.stintEnded" },
        }),
        { status: 409 },
      ),
    ),
  );
  render(
    <LanguageProvider>
      <Board snapshot={attentionSnapshot()} />
    </LanguageProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "待你处理 1" }));
  await user.click(screen.getByRole("button", { name: new RegExp(attentionOptions[0].name) }));
  expect(screen.getByRole("alert")).toHaveTextContent("此权限请求所属的 Stint 已结束。");
  expect(screen.getByRole("alert")).not.toHaveTextContent("Error:");
});

test("login attention translates authored agent diagnostics and preserves the login command", async () => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  const snapshot = mixedAttentionSnapshot({
    ...loginAttentionProfile,
    availability: {
      available: false,
      kind: "login-required",
      reason: {
        text: "Claude Code authentication required. Sign in with claude auth login, then start another stint.",
        code: "agent.loginRequired",
        params: { agent: "Claude Code", command: "claude auth login" },
      },
    },
  });
  render(
    <LanguageProvider>
      <Board snapshot={snapshot} />
    </LanguageProvider>,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "待你处理 4" }));
  expect(
    screen.getByText(
      "Claude Code 需要身份验证。请运行 claude auth login 登录，然后开始新的 Stint。",
    ),
  ).toBeInTheDocument();
});

test("the queue shows command and paths, with full permission JSON behind a disclosure", async () => {
  const snapshot = attentionSnapshot();
  const item = snapshot.attentionItems[0];
  if (item.kind !== "permission") throw new Error("Expected a permission item.");
  item.details = JSON.stringify(
    {
      rawInput: { command: "wc greeting.txt", cwd: "/worktree" },
      locations: [{ path: "/worktree/greeting.txt" }],
    },
    null,
    2,
  );
  render(<Board snapshot={snapshot} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  const queue = within(screen.getByRole("dialog"));
  expect(queue.getByText("wc greeting.txt", { selector: "pre" })).toBeInTheDocument();
  expect(queue.getByText("/worktree", { selector: "code" })).toBeInTheDocument();
  expect(queue.getByText("/worktree/greeting.txt", { selector: "code" })).toBeInTheDocument();
  const disclosure = queue.getByText("Full permission JSON").closest("details");
  expect(disclosure).not.toHaveAttribute("open");
  await user.click(queue.getByText("Full permission JSON"));
  expect(disclosure).toHaveAttribute("open");
  expect(
    within(disclosure as HTMLElement).getByText(item.details, {
      selector: "pre",
      normalizer: (text) => text,
    }),
  ).toBeInTheDocument();
});

test.each([attentionProfile, loginAttentionProfile])(
  "all attention renderers coexist in derived order with availability $availability",
  async (profile) => {
    const user = userEvent.setup();
    const snapshot = mixedAttentionSnapshot(profile);
    render(<Board snapshot={snapshot} />);
    const title = `Needs you ${snapshot.attentionItems.length}`;
    await user.click(screen.getByRole("button", { name: title }));
    const queue = within(screen.getByRole("dialog", { name: title }));
    const articles = queue
      .getAllByRole("article")
      .filter((article) => article.classList.contains("attention-item"));
    expect(articles.map((article) => article.getAttribute("aria-label"))).toEqual(
      snapshot.attentionItems.map(({ title }) => title),
    );
    expect(within(articles[0]).getByText("Permission · Test Agent")).toBeInTheDocument();
    expect(within(articles[0]).getByRole("button", { name: /Yes, proceed/ })).toBeEnabled();
    expect(within(articles[1]).getByText("Gate ready · Test Agent")).toBeInTheDocument();
    expect(within(articles[1]).getByRole("button", { name: "Approve Implement" })).toBeEnabled();
    expect(within(articles[2]).getByText("Handoff · Test Agent")).toBeInTheDocument();
    expect(
      within(articles[2]).getByRole("textbox", { name: "Developer note" }),
    ).toBeInTheDocument();
    expect(within(articles[2]).getByRole("button", { name: "Dismiss" })).toBeEnabled();
    if (profile.availability?.kind === "login-required") {
      expect(
        within(articles[3]).getByText("test-agent login", { selector: "code" }),
      ).toBeInTheDocument();
      expect(
        within(articles[3]).getByRole("button", { name: "Refresh agent availability" }),
      ).toBeEnabled();
      expect(within(articles[3]).queryByText(/Ticket|Stint|No ticket/)).not.toBeInTheDocument();
    }
  },
);

test("Needs you opens a slide-over with source, waiting time, full command and path; counts and badges follow snapshots", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Board snapshot={attentionSnapshot()} />);
  expect(document.title).toBe("Permission requests need your attention · (1) Project · Stintwork");
  const card = within(screen.getByRole("article", { name: /^first:/ }));
  expect(card.getByLabelText("1 open attention items")).toHaveTextContent("Needs you · 1");
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  const queue = screen.getByRole("dialog", { name: "Needs you 1" });
  expect(screen.getByRole("button", { name: "Close Needs you" })).toHaveFocus();
  expect(within(queue).getByText("Permission · Test Agent")).toBeInTheDocument();
  expect(within(queue).getByText(/Ticket 01 · Stint/)).toHaveTextContent("stint");
  expect(within(queue).getByText(/Waiting/)).toHaveAttribute("datetime", "2026-10-09T10:15:00Z");
  expect(within(queue).getByText(/pnpm test --filter/).textContent).toBe(
    "pnpm test --filter /full/path/to/project\n/full/path/to/file.ts",
  );
  expect(within(queue).getByText("Declining ends Test Agent’s turn.")).toBeInTheDocument();
  rerender(<Board snapshot={attentionSnapshot([])} />);
  expect(screen.getByRole("button", { name: "Needs you 0", hidden: true })).toBeInTheDocument();
  expect(document.title).toBe("Project · Stintwork");
  expect(screen.queryByLabelText("1 open attention items")).not.toBeInTheDocument();
  expect(within(queue).getByText("Nothing needs you right now.")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Needs you 0" })).toHaveFocus());
});

test.each(attentionOptions)(
  "the queue forwards the agent's $name option and disables answers until acknowledged",
  async (option) => {
    const user = userEvent.setup();
    let acknowledge: (response: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            acknowledge = resolve;
          }),
      ),
    );
    render(<Board snapshot={attentionSnapshot()} />);
    await user.click(screen.getByRole("button", { name: "Needs you 1" }));
    await user.click(screen.getByRole("button", { name: new RegExp(option.name) }));
    expect(fetch).toHaveBeenCalledWith(
      "/api/stints/stint/permissions/request",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ optionId: option.optionId }),
      }),
    );
    for (const offered of attentionOptions)
      expect(screen.getByRole("button", { name: new RegExp(offered.name) })).toBeDisabled();
    expect(screen.queryByText("Answer sent.")).not.toBeInTheDocument();
    acknowledge(new Response("{}"));
    expect(await screen.findByText("Answer sent.")).toBeInTheDocument();
  },
);

test("failed answers stay visible with the server's reason and can be retried", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ reason: "The agent is unavailable" }), { status: 503 }),
      )
      .mockResolvedValueOnce(new Response("{}")),
  );
  render(<Board snapshot={attentionSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  await user.click(screen.getByRole("button", { name: /Yes, proceed/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The agent is unavailable");
  expect(screen.getByRole("button", { name: /Yes, proceed/ })).toBeEnabled();
  expect(screen.queryByText("Answer sent.")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Yes, proceed/ }));
  expect(await screen.findByText("Answer sent.")).toBeInTheDocument();
});

test("forwarding errors remain visible even if a decision snapshot removes the item before HTTP completes", async () => {
  const user = userEvent.setup();
  let fail: (response: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          fail = resolve;
        }),
    ),
  );
  const { rerender } = render(<Board snapshot={attentionSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  await user.click(screen.getByRole("button", { name: /Yes, proceed/ }));
  rerender(<Board snapshot={attentionSnapshot([])} />);
  fail(
    new Response(JSON.stringify({ reason: "Permission could not be forwarded" }), { status: 503 }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Check project request: Permission could not be forwarded",
  );
  expect(screen.getByText("Nothing needs you right now.")).toBeInTheDocument();
});

test.each([false, null])(
  "a profile with declineEndsTurn=%s does not claim declining ends the turn",
  async (declineEndsTurn) => {
    const user = userEvent.setup();
    const profile = {
      ...attentionProfile,
      capabilities: { ...attentionProfile.capabilities, declineEndsTurn },
    };
    render(<Board snapshot={attentionSnapshot(["request"], profile)} />);
    await user.click(screen.getByRole("button", { name: "Needs you 1" }));
    expect(screen.queryByText(/Declining ends/)).not.toBeInTheDocument();
  },
);

test("the queue spans all work items regardless of the board's milestone filter and can open a work item", async () => {
  const user = userEvent.setup();
  const snapshot = attentionSnapshot();
  snapshot.milestones = [{ id: "other", name: "Other", status: "planned", workItemSlugs: [] }];
  render(<Board snapshot={snapshot} />);
  const milestone = screen.getByRole("combobox", { name: "Milestone" });
  milestone.focus();
  await user.keyboard("{Enter}{End}{Enter}");
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  await user.click(screen.getByRole("button", { name: "First work item · first" }));
  expect(screen.getByRole("dialog", { name: "First work item" })).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: /Needs you/ })).not.toBeInTheDocument();
});

test("notification permission is requested only after opt-in; only new stable ids notify and opt-out persists", async () => {
  const user = userEvent.setup();
  const requestPermission = vi.fn().mockResolvedValue("granted");
  const notify = vi.fn(function (this: unknown) {});
  vi.stubGlobal(
    "Notification",
    Object.assign(notify, { permission: "granted", requestPermission }),
  );
  const { rerender, unmount } = render(<Board snapshot={attentionSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  expect(requestPermission).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Enable browser notifications" }));
  expect(requestPermission).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("stintwork.attention-notifications")).toBe("enabled");
  rerender(<Board snapshot={attentionSnapshot(["request", "second"])} />);
  expect(notify).toHaveBeenCalledWith("Project · Needs you", {
    body: "Check project second",
    tag: 'permission:["stint","second"]',
  });
  rerender(<Board snapshot={attentionSnapshot(["second", "request"])} />);
  expect(notify).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Disable browser notifications" }));
  rerender(<Board snapshot={attentionSnapshot(["request", "second", "third"])} />);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("stintwork.attention-notifications")).toBeNull();
  unmount();
});

test("denied and unsupported browser notifications leave the queue usable without automatically prompting", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("Notification", {
    permission: "denied",
    requestPermission: vi.fn().mockResolvedValue("denied"),
  });
  const { unmount } = render(<Board snapshot={attentionSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  await user.click(screen.getByRole("button", { name: "Enable browser notifications" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Browser notifications were not enabled",
  );
  expect(screen.getByRole("button", { name: /Yes, proceed/ })).toBeEnabled();
  unmount();
  vi.stubGlobal("Notification", undefined);
  render(<Board snapshot={attentionSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  expect(screen.getByRole("button", { name: "Enable browser notifications" })).toBeDisabled();
  expect(screen.getByText("Browser notifications are not supported here.")).toBeInTheDocument();
});

test("saved opt-in survives remount without asking again or notifying for the rebuilt queue", async () => {
  const user = userEvent.setup();
  localStorage.setItem("stintwork.attention-notifications", "enabled");
  const notify = vi.fn(function (this: unknown) {});
  const requestPermission = vi.fn();
  vi.stubGlobal(
    "Notification",
    Object.assign(notify, { permission: "granted", requestPermission }),
  );
  const { rerender } = render(<Board snapshot={attentionSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  expect(screen.getByRole("button", { name: "Disable browser notifications" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(notify).not.toHaveBeenCalled();
  expect(requestPermission).not.toHaveBeenCalled();
  rerender(<Board snapshot={attentionSnapshot(["request", "new"])} />);
  expect(notify).toHaveBeenCalledTimes(1);
});

describe("Chinese Needs-you queue", () => {
  beforeEach(() => {
    localStorage.setItem(languageStorageKey, "zh-CN");
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en"]);
  });

  function chineseBoard(snapshot = attentionSnapshot()) {
    return (
      <LanguageProvider>
        <Board snapshot={snapshot} />
      </LanguageProvider>
    );
  }

  function allKindsSnapshot() {
    const snapshot = mixedAttentionSnapshot(loginAttentionProfile);
    snapshot.workItems[1].stints[0].checkpointWarnings = [
      {
        path: "/worktree/.env.中文",
        reasons: ["likely-secret", "large-file"],
        excluded: true,
      },
      {
        path: "/worktree/dist/中文.js",
        reasons: ["generated-directory"],
        excluded: false,
        committed: true,
        commits: ["a".repeat(40)],
      },
    ];
    snapshot.attentionItems = deriveAttentionItems(snapshot);
    return snapshot;
  }

  test("every known kind has Chinese copy while commands, paths and agent content stay verbatim", async () => {
    const snapshot = allKindsSnapshot();
    render(chineseBoard(snapshot));
    await userEvent.setup().click(screen.getByRole("button", { name: "待你处理 5" }));
    const queue = within(screen.getByRole("dialog", { name: "待你处理 5" }));
    for (const name of [
      "权限请求：Check project request",
      "未解决的交接",
      "实现阶段已就绪，等待批准",
      "Test Agent 需要登录",
      "分支中已提交风险文件",
    ])
      expect(queue.getByRole("heading", { name })).toBeInTheDocument();
    expect(queue.getByRole("button", { name: "关闭待你处理" })).toHaveFocus();
    expect(queue.getByRole("button", { name: "First work item · first" })).toBeInTheDocument();
    expect(
      within(queue.getByRole("article", { name: "权限请求：Check project request" })).getByText(
        /工单 01 · Stint/,
      ),
    ).toHaveTextContent("stint");
    expect(queue.getAllByText(/^已等待/).length).toBeGreaterThan(0);
    expect(queue.getByText(/pnpm test --filter/, { selector: "pre" }).textContent).toBe(
      "pnpm test --filter /full/path/to/project\n/full/path/to/file.ts",
    );
    for (const option of attentionOptions) expect(queue.getByText(option.name)).toBeInTheDocument();
    for (const name of ["允许一次", "始终允许", "拒绝"])
      expect(queue.getByRole("button", { name: new RegExp(`^${name}`) })).toBeEnabled();
    expect(queue.getByText("拒绝将结束 Test Agent 的本轮工作。")).toBeInTheDocument();
    expect(
      within(queue.getByRole("article", { name: "未解决的交接" })).getByText("Which format?"),
    ).toBeInTheDocument();
    expect(queue.getByRole("textbox", { name: "开发者备注" })).toBeInTheDocument();
    expect(queue.getByRole("button", { name: "保存开发者备注" })).toBeDisabled();
    expect(queue.getByRole("button", { name: "忽略" })).toBeEnabled();
    expect(queue.getByText("请运行 test-agent login 登录。")).toBeInTheDocument();
    expect(queue.getByText("test-agent login", { selector: "code" })).toBeInTheDocument();
    const checkpoint = within(queue.getByRole("article", { name: "分支中已提交风险文件" }));
    const warnings = within(checkpoint.getByRole("region", { name: "检查点警告" }));
    for (const path of ["/worktree/.env.中文", "/worktree/dist/中文.js", "a".repeat(40)])
      expect(warnings.getByText(path, { selector: "code" })).toBeInTheDocument();
    expect(warnings.getByText(/疑似敏感信息, 大于 1 MiB/)).toBeInTheDocument();
    expect(warnings.getByText(/生成的目录/)).toBeInTheDocument();
    expect(warnings.getByText(/已从检查点排除，保持未提交状态/)).toBeInTheDocument();
    expect(warnings.getByText(/已提交到分支，未被检查点排除/)).toBeInTheDocument();
    expect(queue.getByText(/风险文件会阻止交付/)).toBeInTheDocument();
  });

  test("permission JSON disclosure translates without changing its command, paths or raw JSON", async () => {
    const snapshot = attentionSnapshot();
    const item = snapshot.attentionItems[0];
    item.title = "Permission requested";
    item.details = JSON.stringify({
      rawInput: { command: ["wc", "中文.txt"], cwd: "/worktree" },
      locations: [{ path: "/worktree/中文.txt" }],
    });
    render(chineseBoard(snapshot));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "待你处理 1" }));
    expect(screen.getByRole("heading", { name: "权限请求" })).toBeInTheDocument();
    expect(screen.getByText("wc 中文.txt", { selector: "pre" })).toBeInTheDocument();
    for (const path of ["/worktree", "/worktree/中文.txt"])
      expect(screen.getByText(path, { selector: "code" })).toBeInTheDocument();
    const disclosure = screen.getByText("完整权限 JSON").closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    await user.click(screen.getByText("完整权限 JSON"));
    expect(disclosure).toHaveAttribute("open");
    expect(within(disclosure as HTMLElement).getByText(item.details)).toBeInTheDocument();
  });

  test("customised workflow stage names and unknown attention titles stay verbatim", async () => {
    const snapshot = mixedAttentionSnapshot();
    snapshot.workflows.feature = structuredClone(snapshot.workflows.feature);
    const stage = snapshot.workflows.feature.stages.find(({ id }) => id === "implement");
    if (!stage) throw new Error("Expected an implement stage.");
    stage.name = "Team approval 自定义";
    snapshot.attentionItems = deriveAttentionItems(snapshot);
    snapshot.attentionItems.push({
      ...snapshot.attentionItems[0],
      kind: "future-kind",
      id: "future-item",
      title: "Future core title 原文",
      details: "Future core details 原文",
    } as unknown as AttentionItem);
    render(chineseBoard(snapshot));
    await userEvent.setup().click(screen.getByRole("button", { name: "待你处理 4" }));
    expect(
      screen.getByRole("heading", { name: "Team approval 自定义阶段已就绪，等待批准" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Future core title 原文" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Future core title 原文" })).toBeInTheDocument();
  });

  test("excluded checkpoint warnings and unrecorded readiness times are Chinese", async () => {
    const snapshot = allKindsSnapshot();
    const item = snapshot.attentionItems.find(({ kind }) => kind === "checkpoint-warning");
    if (item?.kind !== "checkpoint-warning") throw new Error("Expected a checkpoint warning.");
    item.warnings = item.warnings.filter(({ excluded }) => excluded);
    item.raisedAt = "1970-01-01T00:00:00.000Z";
    render(chineseBoard(snapshot));
    await userEvent.setup().click(screen.getByRole("button", { name: "待你处理 5" }));
    const article = within(screen.getByRole("article", { name: "已从检查点排除风险文件" }));
    expect(article.getByText("未记录就绪时间")).toBeInTheDocument();
    expect(article.getByText(/检查和本地合并要求工作树干净/)).toBeInTheDocument();
  });

  test("agent login reasons stay verbatim and refresh failure is Chinese", async () => {
    const snapshot = mixedAttentionSnapshot({
      ...loginAttentionProfile,
      availability: {
        available: false,
        kind: "login-required",
        checkedAt: "2026-10-09T11:30:00Z",
        reason: { text: "Agent login reason 原文" },
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(chineseBoard(snapshot));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "待你处理 4" }));
    expect(screen.getByText("Agent login reason 原文")).toBeInTheDocument();
    expect(screen.getByText("请运行 test-agent login 登录。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "刷新 Agent 可用状态" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("无法刷新 Agent 可用状态，请重试。");
  });

  test.each(attentionOptions)(
    "Chinese permission choices forward the original $optionId",
    async (option) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
      render(chineseBoard());
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "待你处理 1" }));
      await user.click(screen.getByRole("button", { name: new RegExp(option.name) }));
      expect(await screen.findByText("答复已发送。")).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith(
        "/api/stints/stint/permissions/request",
        expect.objectContaining({ body: JSON.stringify({ optionId: option.optionId }) }),
      );
    },
  );

  test("Chinese developer notes submit verbatim and confirmation translates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(chineseBoard(mixedAttentionSnapshot()));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "待你处理 3" }));
    await user.type(screen.getByRole("textbox", { name: "开发者备注" }), "  Keep /path 原文  ");
    await user.click(screen.getByRole("button", { name: "保存开发者备注" }));
    expect(await screen.findByText("已答复交接。")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/stints/finished-stint/handoff-answer",
      expect.objectContaining({ body: JSON.stringify({ note: "  Keep /path 原文  " }) }),
    );
  });

  test("notifications translate every known kind and fall back for an unknown kind", async () => {
    localStorage.setItem("stintwork.attention-notifications", "enabled");
    const notify = vi.fn(function (this: unknown) {});
    vi.stubGlobal("Notification", Object.assign(notify, { permission: "granted" }));
    const originalTitle = document.title;
    const snapshot = allKindsSnapshot();
    const { rerender, unmount } = render(chineseBoard(snapshot));
    expect(document.title).toBe("权限请求需要你处理 · （5 个待处理事项）Project · Stintwork");
    expect(notify).not.toHaveBeenCalled();
    const next = {
      ...snapshot,
      attentionItems: snapshot.attentionItems.map((item) => ({ ...item, id: `${item.id}:new` })),
    };
    rerender(chineseBoard(next));
    for (const body of [
      "权限请求：Check project request",
      "未解决的交接",
      "实现阶段已就绪，等待批准",
      "custom-agent 需要登录",
      "分支中已提交风险文件",
    ])
      expect(notify).toHaveBeenCalledWith("Project · 待你处理", expect.objectContaining({ body }));
    expect(notify).toHaveBeenCalledTimes(5);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "设置" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "English" }));
    expect(document.title).toBe(
      "Permission requests need your attention · (5) Project · Stintwork",
    );
    expect(notify).toHaveBeenCalledTimes(5);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "简体中文" }));
    next.attentionItems = [
      {
        ...snapshot.attentionItems[0],
        id: "future",
        kind: "future-kind",
        title: "Future core title 原文",
      } as unknown as AttentionItem,
    ];
    rerender(chineseBoard(next));
    expect(notify).toHaveBeenLastCalledWith("Project · 待你处理", {
      body: "Future core title 原文",
      tag: "future",
    });
    unmount();
    expect(document.title).toBe(originalTitle);
  });

  test("language context changes keep the queue and developer note open", async () => {
    function LanguageDriver() {
      const { setLanguage } = useLanguage();
      return (
        <select
          aria-label="Test language"
          onChange={(event) => setLanguage(event.target.value === "en" ? "en" : "zh-CN")}
        >
          <option value="zh-CN">Chinese</option>
          <option value="en">English</option>
        </select>
      );
    }
    render(
      <LanguageProvider>
        <LanguageDriver />
        <Board snapshot={mixedAttentionSnapshot()} />
      </LanguageProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "待你处理 3" }));
    await user.type(screen.getByRole("textbox", { name: "开发者备注" }), "Developer draft 原文");
    fireEvent.change(screen.getByRole("combobox", { name: "Test language", hidden: true }), {
      target: { value: "en" },
    });
    expect(screen.getByRole("dialog", { name: "Needs you 3" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Developer note" })).toHaveValue(
      "Developer draft 原文",
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Test language", hidden: true }), {
      target: { value: "zh-CN" },
    });
    expect(screen.getByRole("textbox", { name: "开发者备注" })).toHaveValue("Developer draft 原文");
  });

  test("empty state and unsupported notification controls translate", async () => {
    vi.stubGlobal("Notification", undefined);
    render(chineseBoard(attentionSnapshot([])));
    await userEvent.setup().click(screen.getByRole("button", { name: "待你处理 0" }));
    expect(
      within(screen.getByRole("dialog", { name: "待你处理 0" })).getByRole("status"),
    ).toHaveTextContent("目前没有待你处理的事项。");
    expect(screen.getByRole("button", { name: "启用浏览器通知" })).toBeDisabled();
    expect(screen.getByText("此处不支持浏览器通知。")).toBeInTheDocument();
    expect(document.title).toBe("Project · Stintwork");
  });
});

test.each(["en", "zh-CN"] as const)(
  "stale approval can be reopened and reports refusals (%s)",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const t = language === "en" ? en : zhCN;
    const snapshot = attentionSnapshot([]);
    const item = snapshot.workItems[0];
    item.stage = "tickets";
    item.column = "tickets";
    item.stages.spec = {
      approved: {
        by: "Developer",
        at: "2026-10-29T12:00:00Z",
        commit: "abc",
        state: "stale",
        stateReason: "head-changed",
      },
    };
    snapshot.attentionItems = deriveAttentionItems(snapshot).filter(
      ({ kind }) => kind === "approval-stale",
    );
    let resolve!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ reason: "Refused to reopen" }), { status: 409 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <Board snapshot={snapshot} />
      </LanguageProvider>,
    );
    await user.click(screen.getByRole("button", { name: `${t.topBar.needsYou} 1` }));
    const sheet = within(screen.getByRole("dialog"));
    const stage = language === "en" ? "Spec" : "规格说明";
    expect(
      sheet.getByRole("heading", { name: t.needsYou.staleApprovalTitle(stage) }),
    ).toBeVisible();
    expect(sheet.getByText(t.needsYou.staleApprovalDetails(stage))).toBeVisible();
    const button = sheet.getByRole("button", { name: t.stints.reopen(stage) });
    await user.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/work-items/first/gates/spec/reopen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(button).toBeDisabled();
    resolve(new Response("{}"));
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(await sheet.findByRole("alert")).toHaveTextContent(
      `${t.needsYou.staleApprovalTitle(stage)}: Refused to reopen`,
    );
    expect(button).toBeEnabled();
  },
);

test("Chinese notifications translate the stage for gate-ready and stale approvals", async () => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  localStorage.setItem("stintwork.attention-notifications", "enabled");
  const notify = vi.fn(function (this: unknown) {});
  vi.stubGlobal("Notification", Object.assign(notify, { permission: "granted" }));
  const snapshot = attentionSnapshot([]);
  const workItem = snapshot.workItems[0];
  workItem.stage = "tickets";
  workItem.column = "tickets";
  workItem.stages.spec = {
    approved: {
      by: "Developer",
      at: "2026-10-29T12:00:00Z",
      commit: "abc",
      state: "stale",
      stateReason: "head-changed",
    },
  };
  const stale = deriveAttentionItems(snapshot).find((item) => item.kind === "approval-stale");
  if (!stale) throw new Error("Expected stale approval");
  const { rerender } = render(
    <LanguageProvider>
      <Board snapshot={snapshot} />
    </LanguageProvider>,
  );
  const gate: AttentionItem = {
    ...stale,
    kind: "gate-ready",
    id: "gate-ready:spec",
    title: "Spec ready to approve",
  };
  rerender(
    <LanguageProvider>
      <Board snapshot={{ ...snapshot, attentionItems: [gate, stale] }} />
    </LanguageProvider>,
  );
  expect(notify).toHaveBeenCalledWith(
    "Project · 待你处理",
    expect.objectContaining({ body: zhCN.needsYou.stageReady("规格说明"), tag: gate.id }),
  );
  expect(notify).toHaveBeenCalledWith(
    "Project · 待你处理",
    expect.objectContaining({ body: zhCN.needsYou.staleApprovalTitle("规格说明"), tag: stale.id }),
  );
  rerender(
    <LanguageProvider>
      <Board snapshot={{ ...snapshot, attentionItems: [] }} />
    </LanguageProvider>,
  );
  workItem.stages.spec = {
    approved: {
      by: "Developer",
      at: "2026-10-29T12:01:00Z",
      commit: "def",
      state: "stale",
      stateReason: "head-changed",
    },
  };
  const later = deriveAttentionItems(snapshot).find((item) => item.kind === "approval-stale");
  if (!later) throw new Error("Expected later stale approval");
  rerender(
    <LanguageProvider>
      <Board snapshot={{ ...snapshot, attentionItems: [later] }} />
    </LanguageProvider>,
  );
  expect(notify).toHaveBeenCalledTimes(3);
  expect(notify).toHaveBeenLastCalledWith(
    "Project · 待你处理",
    expect.objectContaining({ body: zhCN.needsYou.staleApprovalTitle("规格说明"), tag: later.id }),
  );
});

test.each(["en", "zh-CN"] as const)(
  "pending permissions remain visible on board and drawer (%s)",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const t = language === "en" ? en : zhCN;
    const snapshot = attentionSnapshot();
    const user = userEvent.setup();
    const view = render(
      <LanguageProvider>
        <Board snapshot={snapshot} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("button", { name: t.needsYou.pendingPermissions })).toBeVisible();
    expect(document.title).toContain(t.needsYou.pendingPermissions);
    await user.click(screen.getByRole("button", { name: /First work item/ }));
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: t.needsYou.pendingPermissions,
      }),
    ).toBeVisible();
    view.rerender(
      <LanguageProvider>
        <Board snapshot={{ ...snapshot, attentionItems: [] }} />
      </LanguageProvider>,
    );
    expect(screen.queryByText(t.needsYou.pendingPermissions)).not.toBeInTheDocument();
    expect(document.title).not.toContain(t.needsYou.pendingPermissions);
  },
);
