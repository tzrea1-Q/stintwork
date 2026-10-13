// SPDX-License-Identifier: Apache-2.0
import {
  createMemoryRepoFiles,
  indexProject,
  type MemoryProposalAttentionItem,
  type PullRequestPreview,
  type StintSummary,
} from "@stintwork/core";
import type { WorkItemDiff } from "@stintwork/git";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ChecksPanel } from "./ChecksPanel";
import { MemoryProposal } from "./MemoryProposal";
import { ReviewOverlay } from "./ReviewOverlay";
import { RiskyPaths } from "./RiskyPaths";
import { ShipActions } from "./ShipActions";
import { LanguageProvider, languageStorageKey } from "./i18n/language";

const finding = {
  id: "finding-1",
  axis: "Spec" as const,
  severity: "major" as const,
  path: "src/原文.ts",
  line: 1,
  title: "Agent finding title 原文",
  body: "Agent finding body 原文 <script>not HTML</script>",
};
const stint: StintSummary = {
  id: "review-stint",
  workItem: "example",
  stage: "review",
  ticket: null,
  agent: "codex",
  status: "finished",
  startedAt: "2026-10-10T09:00:00Z",
  endedAt: "2026-10-10T09:01:00Z",
  checkpointCommit: "reviewed",
  handoff: null,
  findings: { commit: "reviewed", findings: [finding] },
};
const diff: WorkItemDiff = {
  branch: "stintwork/example",
  mainBranch: "main",
  mainCommit: "main-head",
  mergeBase: "base",
  headCommit: "reviewed",
  files: [
    {
      path: finding.path,
      status: "modified",
      binary: false,
      additions: 1,
      deletions: 1,
      hunks: [
        {
          header: "@@ -1 +1 @@",
          oldStart: 1,
          oldCount: 1,
          newStart: 1,
          newCount: 1,
          lines: [
            { kind: "removed", oldLine: 1, newLine: null, text: "old code 原文" },
            { kind: "added", oldLine: null, newLine: 1, text: "new code 原文" },
          ],
        },
      ],
    },
  ],
};
function item(stage = "review") {
  return indexProject(
    createMemoryRepoFiles({
      ".scratch/example/spec.md": "# Repo title 原文",
      ".scratch/example/workflow.yaml": `workflow: feature\nstage: ${stage}\n`,
    }),
    { name: "Repo project 原文" },
  ).workItems[0];
}
function reply(body: unknown) {
  return new Response(JSON.stringify(body));
}
beforeEach(() => {
  localStorage.setItem(languageStorageKey, "zh-CN");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.lang = "en";
});

test("Chinese review decisions preserve agent findings, paths and diff text", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
    if (!options?.method) return reply(diff);
    const body = JSON.parse(String(options.body));
    return reply({
      decision: {
        kind: "finding",
        id: body.id,
        status: body.status,
        reason: body.reason,
        by: "Developer 原文",
        at: "2026-10-10T10:00:00Z",
      },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <LanguageProvider>
      <ReviewOverlay
        item={{ ...item(), stints: [stint], headCommit: "reviewed" }}
        onClose={() => {}}
      />
    </LanguageProvider>,
  );
  expect(await screen.findByText("new code 原文")).toBeInTheDocument();
  expect(screen.getByText("old code 原文")).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "更改的文件" })).toHaveTextContent(finding.path);
  const card = within(screen.getByRole("article", { name: finding.title }));
  expect(card.getByText(finding.body)).toBeInTheDocument();
  await user.click(card.getByRole("button", { name: "标记为已解决" }));
  expect(await screen.findByRole("status")).toHaveTextContent("审查发现已记录为已解决。");
  await user.click(card.getByRole("button", { name: "重新打开" }));
  await user.click(card.getByRole("button", { name: "接受并说明理由" }));
  expect(card.getByRole("button", { name: "保存接受决定" })).toBeDisabled();
  await user.type(card.getByRole("textbox", { name: "接受理由" }), "Developer reason 原文");
  await user.click(card.getByRole("button", { name: "保存接受决定" }));
  expect(await screen.findByRole("status")).toHaveTextContent("审查发现已记录为已接受。");
  expect(card.getByText(/Developer reason 原文/)).toBeInTheDocument();
  await user.selectOptions(screen.getByRole("combobox", { name: "状态" }), "accepted");
  expect(card.getByText(finding.body)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/work-items/example/findings/decision",
    expect.objectContaining({
      body: JSON.stringify({ id: finding.id, status: "accepted", reason: "Developer reason 原文" }),
    }),
  );
  expect(screen.getByRole("button", { name: "关闭审查" })).toBeInTheDocument();
});

test("Chinese send back records the decision and preserves a custom stage name", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn(async (_url: string, options?: RequestInit) =>
    reply(
      options?.method
        ? {
            stageName: "Custom implementation 原文",
            decisions: [
              {
                kind: "finding",
                id: finding.id,
                status: "sent-back",
                reason: "",
                by: "You",
                at: "now",
              },
            ],
          }
        : diff,
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <LanguageProvider>
      <ReviewOverlay
        item={{ ...item(), stints: [stint], headCommit: "reviewed" }}
        onClose={() => {}}
      />
    </LanguageProvider>,
  );
  await user.click(screen.getByRole("button", { name: "退回" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Custom implementation 原文 已重新打开。",
  );
  expect(screen.getByRole("article", { name: finding.title })).toHaveTextContent("已退回");
  expect(screen.getByRole("button", { name: "退回" })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/work-items/example/findings/send-back",
    expect.objectContaining({ body: "{}" }),
  );
});

const preview: PullRequestPreview = {
  repo: "team/project",
  remote: "origin",
  remoteUrl: "git@github.com:team/project.git",
  branch: "stintwork/example",
  base: "main",
  headCommit: "head-sha",
  title: "PR title 原文",
  body: "PR body 原文",
  confirmation: "confirmation-token",
};
test("Chinese push preview requires explicit confirmation and cancellation never publishes", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn(async (url: string) =>
    reply(
      url.endsWith("preview-pr")
        ? { preview }
        : {
            pullRequest: { ...preview, number: 12, url: "https://github.com/team/project/pull/12" },
          },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <LanguageProvider>
      <ShipActions item={item("ship")} />
    </LanguageProvider>,
  );
  expect(screen.getByRole("button", { name: "本地合并" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "创建拉取请求" }));
  const confirmation = within(await screen.findByRole("dialog", { name: "确认发布拉取请求" }));
  expect(
    confirmation.getByText("发布会将此代码推送到下方远程仓库。只有明确确认后才会推送。"),
  ).toBeInTheDocument();
  for (const value of [
    preview.remote,
    preview.remoteUrl,
    preview.branch,
    preview.base,
    preview.headCommit,
    preview.body,
  ])
    expect(confirmation.getByText(value)).toBeInTheDocument();
  expect(confirmation.getByText(`标题：${preview.title}`)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await user.click(confirmation.getByRole("button", { name: "取消" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "创建拉取请求" }));
  await user.click(screen.getByRole("button", { name: "确认推送并创建拉取请求" }));
  expect(await screen.findByRole("link", { name: "在 GitHub 上查看" })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/work-items/example/ship/open-pr",
    expect.objectContaining({ body: JSON.stringify({ confirmation: preview.confirmation }) }),
  );
});

test.each(["merge", "squash", "rebase"])(
  "Chinese pull request merge requires confirmation of the %s method",
  async (mergeMethod) => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string) =>
      reply(
        url.endsWith("preview-merge-pr")
          ? { mergeMethod }
          : { merged: { commit: "merged-sha", at: "2026-10-10T10:00:00Z" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ready = item("ship");
    ready.stages.review = { approved: { commit: preview.headCommit } };
    render(
      <LanguageProvider>
        <ShipActions
          item={{
            ...ready,
            headCommit: preview.headCommit,
            pullRequest: { ...preview, number: 12, url: "https://github.com/team/project/pull/12" },
            pullRequestChecks: {
              number: 12,
              headCommit: preview.headCommit,
              fetchedAt: "2026-10-10T10:00:00Z",
              state: "OPEN",
              checks: [{ name: "CI name 原文", bucket: "pass", link: "" }],
            },
          }}
        />
      </LanguageProvider>,
    );
    await user.click(screen.getByRole("button", { name: "合并拉取请求" }));
    const confirmation = within(await screen.findByRole("dialog", { name: "确认合并拉取请求" }));
    expect(confirmation.getByText(preview.base, { exact: false })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.click(confirmation.getByRole("button", { name: `确认以 ${mergeMethod} 方式合并` }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "已通过拉取请求 #12交付，提交为 merged-sha。",
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/work-items/example/ship/merge-pr",
      expect.objectContaining({ body: JSON.stringify({ mergeMethod }) }),
    );
  },
);

test("Chinese local shipping reports the recorded commit", async () => {
  const user = userEvent.setup();
  const fetchMock = vi
    .fn()
    .mockResolvedValue(reply({ merged: { commit: "merged-sha", at: "2026-10-10T10:00:00Z" } }));
  vi.stubGlobal("fetch", fetchMock);
  render(
    <LanguageProvider>
      <ShipActions item={item("ship")} />
    </LanguageProvider>,
  );
  await user.click(screen.getByRole("button", { name: "本地合并" }));
  expect(await screen.findByRole("status")).toHaveTextContent("已在本地交付，提交为 merged-sha。");
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/work-items/example/ship/merge-local",
    expect.objectContaining({ body: "{}" }),
  );
});

test("Chinese checks translate stale evidence and keep command names, commands and output verbatim", async () => {
  const command = { name: "Test name 原文", command: "node scripts/原文.js" };
  const result = {
    ...command,
    commit: "old-head",
    status: "failed" as const,
    durationMs: 12,
    outputExcerpt: "Error output 原文",
  };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(reply({ headCommit: "new-head", commands: [command], checks: [result] })),
  );
  const workItem = {
    ...item(),
    headCommit: "new-head",
    pullRequest: { ...preview, number: 12, url: "https://github.com/team/project/pull/12" },
    pullRequestChecks: {
      number: 12,
      headCommit: "old-head",
      fetchedAt: "2026-10-10T10:00:00Z",
      state: "OPEN",
      checks: [{ name: "CI name 原文", bucket: "fail", link: "" }],
    },
  };
  render(
    <LanguageProvider>
      <ChecksPanel item={workItem} />
    </LanguageProvider>,
  );
  const output = await screen.findByRole("log", { name: "输出：Test name 原文" });
  expect(output).toHaveTextContent(result.outputExcerpt);
  expect(screen.getByText(command.command)).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "最新检查" })).toHaveTextContent("已过期");
  expect(screen.getByRole("button", { name: "运行检查" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "刷新拉取请求检查" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "拉取请求 CI 检查" })).toHaveTextContent("已过期");
  expect(screen.getByRole("list", { name: "拉取请求 CI 结果" })).toHaveTextContent(
    "CI name 原文 · 失败",
  );
});

test.each([
  ["接受记忆提案", "accepted"],
  ["拒绝记忆提案", "rejected"],
])("Chinese memory decision %s preserves the proposal details and diff", async (name, status) => {
  const user = userEvent.setup();
  const proposal: MemoryProposalAttentionItem = {
    kind: "memory-proposal",
    id: "proposal",
    workItem: "example",
    ticket: null,
    stintId: "stint",
    agent: "codex",
    title: "Core proposal title 原文",
    details: "Core attention details 原文",
    raisedAt: "2026-10-10T10:00:00Z",
    path: "GLOSSARY.md",
    baseCommit: "base",
    checkpointCommit: "head",
    diff: "-Old term 原文\n+New term 原文",
  };
  const fetchMock = vi.fn().mockResolvedValue(reply({}));
  vi.stubGlobal("fetch", fetchMock);
  render(
    <LanguageProvider>
      <MemoryProposal item={proposal} onError={vi.fn()} />
    </LanguageProvider>,
  );
  expect(screen.getByText(proposal.details)).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "GLOSSARY.md 的差异" }).textContent).toBe(
    proposal.diff,
  );
  expect(
    screen.getByText("拒绝会将整个文件恢复至 Stint 开始时的版本，包括之后已提交的更改。"),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name }));
  expect(await screen.findByRole("status")).toHaveTextContent("记忆提案决定已记录。");
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/work-items/example/memory-proposals/decision",
    expect.objectContaining({ body: JSON.stringify({ id: proposal.id, status, reason: "" }) }),
  );
});

test("Chinese risky-path acceptance needs a reason and keeps paths verbatim", async () => {
  const user = userEvent.setup();
  const risk = { path: "private/原文.env", blob: "blob-sha", reasons: ["likely-secret" as const] };
  const onAccept = vi.fn().mockResolvedValue(true);
  render(
    <LanguageProvider>
      <RiskyPaths risks={[risk]} decisions={[]} saving={false} onAccept={onAccept} />
    </LanguageProvider>,
  );
  const card = within(screen.getByRole("article", { name: `风险路径 ${risk.path}` }));
  expect(card.getByText(risk.path)).toBeInTheDocument();
  expect(card.getByText("疑似机密 · 阻止交付")).toBeInTheDocument();
  await user.click(card.getByRole("button", { name: "接受" }));
  expect(card.getByRole("button", { name: "保存接受决定" })).toBeDisabled();
  await user.type(card.getByRole("textbox", { name: "接受理由" }), "Developer acceptance 原文");
  await user.click(card.getByRole("button", { name: "保存接受决定" }));
  expect(onAccept).toHaveBeenCalledWith(risk, "Developer acceptance 原文");
});
