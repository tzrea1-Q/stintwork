// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { en } from "./en";
import { joinChinese, zhCN } from "./zh-CN";

const unchanged = new Set([
  "Stintwork",
  "Claude Code",
  "Codex",
  "Grok Build",
  "Stint",
  "Agent",
  "English",
  "简体中文",
]);
const samples: Record<string, unknown[][]> = {
  "stints.recovery.checkpointFailedUnknown": [["disk full 原文"]],
  "stints.recovery.saved": [["abc123"]],
  "stints.recovery.checkpointFailed": [["/worktrees/工程", "disk full 原文"]],
  "coreText.recovery.blocked": [[{ detail: "Possible writer 123 原文" }]],
  "stints.preparation.bundledNotice": [[136], [165]],
  "coreText.agent.executableDetails": [
    [{ path: "/cache/agent", version: "0.159.3", adapter: "2.1.1" }],
  ],
  "warningCallout.title": [[1], [3]],
  "connection.errors.requestFailed": [[503], [404]],
  "coreText.agent.internalErrorDetail": [[{ detail: ": Agent diagnostic 原文" }]],
  "coreText.creation.exists": [[{ slug: "repo-name" }]],
  "coreText.creation.existsInGit": [[{ slug: "repo-name" }]],
  "board.counts": [
    [0, 0],
    [1, 1],
    [2, 3],
  ],
  "board.unstagedCount": [[0], [1], [2]],
  "column.empty": [["Stage 名称"]],
  "card.open": [["repo/中文", "Repo title 原文"]],
  "card.attention": [[0], [1], [2]],
  "card.needsYou": [[0], [1], [2]],
  "card.progress": [["repo/中文"]],
  "planning.palette.customise": [["Repo 原文"], ["功能"], ["Latin"]],
  "planning.roadmap.name": [["Repo 原文"]],
  "planning.roadmap.rename": [["Repo 原文"], ["M1 · The board"], ["路线图"], ["（中文）"]],
  "planning.roadmap.status": [["Repo 原文"]],
  "planning.roadmap.setStatus": [["Repo 原文"]],
  "planning.roadmap.target": [["Repo 原文"]],
  "planning.roadmap.setTarget": [["Repo 原文"]],
  "planning.roadmap.up": [["Repo 原文"], ["M1 · The board"]],
  "planning.roadmap.down": [["Repo 原文"], ["M1 · The board"]],
  "planning.customise.title": [["Repo 原文"], ["功能"], ["Latin"]],
  "planning.customise.commit": [["Repo 原文"]],
  "planning.setup.committed": [["Repo 原文"]],
  "planning.setup.replacesLines": [[1], [46]],
  "planning.setup.skillSummary": [
    ["Repo 原文", 10, 10, 0],
    ["Repo 原文", 0, 10, 10],
    ["Repo 原文", 1, 3, 1],
    ["Repo 原文", 0, 0, 0],
  ],
  "planning.setup.review": [[0], [4]],
  "planning.setup.changeLabel": [["Repo 原文"]],
  "planning.setup.preview": [["Repo 原文"]],
  "planning.setup.write": [[0], [1], [2]],
  "planning.setup.agentSkills": [["Repo 原文"]],
  "planning.setup.installHint": [
    ["Codex", "/to-spec", undefined],
    ["Claude Code", "/to-tickets", "~/.claude/skills/, <project>/.agents/skills/"],
  ],
  "needsYou.permissionRequest": [["Agent title 原文"]],
  "needsYou.stageReady": [["Stage 自定义"]],
  "needsYou.loginTitle": [["Codex"]],
  "needsYou.loginInstructions": [["codex login"]],
  "needsYou.ticket": [[1], [2]],
  "needsYou.waiting": [[0], [1], [2]],
  "needsYou.declineEndsTurn": [["Codex"]],
  "needsYou.tabTitle": [
    [1, "Project 原文"],
    [2, "Project 原文"],
  ],
  "needsYou.notificationTitle": [["Project 原文"]],
  "review.diff.addedLines": [[0], [1], [2], [null]],
  "review.diff.removedLines": [[0], [1], [2], [null]],
  "review.diff.outsideLabel": [["src/中文.ts"]],
  "review.diff.reopened": [["Implement 原文"]],
  "review.diff.recorded": [
    ["Finding", "resolved"],
    ["审查发现", "已解决"],
  ],
  "review.checks.commandOutput": [["npm test 原文"]],
  "review.checks.output": [["npm test 原文"]],
  "review.pr.heading": [[1], [23]],
  "review.memory.diff": [["GLOSSARY.md"]],
  "review.ship.shippedAt": [
    [undefined, "head"],
    [12, "head"],
  ],
  "review.ship.sentBack": [["Custom stage 原文"]],
  "review.ship.pullRequest": [[1], [23]],
  "review.ship.confirmMethod": [["squash"], ["merge"], ["rebase"]],
  "review.risks.path": [[".env"]],
  "review.checks.duration": [[0], [12]],
  "stints.copyPath": [["/repo/中文"]],
  "stints.stageStint": [["Stage 自定义"]],
  "stints.ticket": [[null], [1]],
  "stints.gateApproved": [["Stage 自定义"], ["审查"]],
  "stints.gateReopened": [["Stage 自定义"]],
  "stints.gate": [["Stage 自定义"]],
  "stints.gateConditions": [["Stage 自定义"]],
  "stints.approve": [["Stage 自定义"], ["实现"]],
  "stints.reopen": [["Stage 自定义"]],
  "stints.workflowStages": [["Workflow 自定义"]],
  "stints.stageAgent": [["Stage 自定义"]],
  "stints.briefTicket": [[1], [12]],
  "stints.openStint": [["stint/中文"]],
  "stints.closeStint": [["stint/中文"]],
  "stints.noHandoffError": [["Agent 原文"]],
  "stints.terminalOutput": [["terminal/中文"]],
  "stints.content": [["type/中文"]],
  "stints.automaticOutcome": [["Agent 原文"]],
  "stints.permissionTitle": [["git status 中文"]],
  "coreText.gate.writeSpec": [
    [{ path: ".scratch/功能/spec.md", warning: "" }],
    [{ path: "spec.md", warning: "Repo 原文" }],
  ],
  "coreText.gate.writeTickets": [
    [{ path: ".scratch/功能/issues/NN-<slug>.md", warning: "" }],
    [{ path: "issues/", warning: "Repo 原文" }],
  ],
  "coreText.brief.blockedBy": [[{ tickets: "01" }], [{ tickets: "01, 12" }]],
  "coreText.permission.unsupportedMode": [
    [{ agent: "Codex", mode: "read-only" }],
    [{ agent: "Agent 中文", mode: "custom" }],
  ],
  "coreText.permission.alwaysApprove": [[{ agent: "Grok Build" }], [{ agent: "Agent 中文" }]],
  "coreText.agent.unavailable": [
    [{ agent: "Codex", command: "codex login" }],
    [{ agent: "Agent 中文", command: "agent login" }],
  ],
  "coreText.stream.wroteWorkflow": [
    [{ agent: "Claude Code" }],
    [{ agent: "Codex" }],
    [{ agent: "Agent 中文" }],
  ],
  "coreText.stream.installDependencies": [
    [{ manager: "pnpm", connection: "offline" }],
    [{ manager: "npm", connection: "online" }],
    [{ manager: "yarn", connection: "offline" }],
  ],
  "coreText.agent.notRegistered": [[{ agent: "codex" }]],
  "coreText.brief.decision": [[{ title: "Agents use ACP" }]],
  "coreText.stint.stopReason": [[{ reason: "max_tokens" }]],
  "coreText.agent.loginRequired": [[{ agent: "Claude Code", command: "claude auth login" }]],
  "coreText.server.diffFailed": [[{ detail: "git 原文" }]],
  "coreText.server.reviewDiffFailed": [[{ detail: "git 原文" }]],
  "coreText.server.checkpointCompareFailed": [[{ detail: "git 原文" }]],
  "coreText.server.recoveryFailed": [[{ detail: "Error: 原文" }]],
};

test("project failures and live connection states are translated", () => {
  expect(zhCN.connection.errors.requestFailed(503)).toBe("项目请求失败（503）。");
  expect(zhCN.connection.errors.timeout).toBe("项目请求超时。");
  expect(zhCN.connection.errors.unreachable).toBe("无法连接项目服务器。");
  expect(zhCN.connection.errors.invalidSnapshot).toBe("项目服务器返回的快照无效。");
  expect(zhCN.connection.errors.invalidResponse).toBe("服务器返回的响应无效。");
  expect(zhCN.review.diff.files).toBe("文件");
  expect(zhCN.review.diff.diff).toBe("差异");
  expect(zhCN.review.diff.panes).toBe("审查视图");
  expect(zhCN.review.diff.details).toBe("审查详情");
  expect(zhCN.board.connecting).toBe("正在连接实时更新");
  expect(zhCN.board.reconnecting).toBe("正在重新连接 · 定期读取项目");
  expect(zhCN.board.live).toBe("实时更新中");
});

test.each([
  [["重命名", "First"], "重命名 First"],
  [["implement", "阶段"], "implement 阶段"],
  [["自定义", "功能", "工作流"], "自定义功能工作流"],
  [["Team workflow 自定义", "工作流阶段"], "Team workflow 自定义工作流阶段"],
  [["工单", 12], "工单 12"],
  [[12, "个工单"], "12 个工单"],
  [["M", 1], "M1"],
  [["名", "", "M1"], "名 M1"],
  [["名 ", "M1"], "名 M1"],
  [["名", " M1"], "名 M1"],
  [["名\t", "M1"], "名\tM1"],
  [["名", "\nM1"], "名\nM1"],
  [["执行", "/cmd"], "执行 /cmd"],
  [["/cmd", "命令"], "/cmd 命令"],
  [["路径", "~/path"], "路径 ~/path"],
  [["~/path", "路径"], "~/path 路径"],
  [["工单", "#12"], "工单 #12"],
  [["#12", "工单"], "#12 工单"],
  [["中文", ""], "中文"],
  [["", "中文"], "中文"],
  [[], ""],
  [["中文", "file."], "中文 file."],
  [["中文", "."], "中文."],
  [["file.", "中文"], "file. 中文"],
  [["かな", "/cmd"], "かな /cmd"],
  [["~/path", "カナ"], "~/path カナ"],
  [["𠀀", "A"], "𠀀 A"],
  [["A", "𠀀"], "A 𠀀"],
  [["打开", "Repo中文Name", "。"], "打开 Repo中文Name。"],
] as const)(
  "Chinese joining preserves segments and spaces only mixed boundaries: %j",
  (segments, expected) => {
    expect(joinChinese(...segments)).toBe(expected);
  },
);

test.each(["，", "。", "：", "；", "（", "）", "「", "」", "、", "！", "？", "《", "》"])(
  "Chinese joining does not add spaces next to %s",
  (punctuation) => {
    expect(joinChinese("中文", punctuation, "Latin")).toBe(`中文${punctuation}Latin`);
    expect(joinChinese("Latin", punctuation, "中文")).toBe(`Latin${punctuation}中文`);
    expect(joinChinese("中文", punctuation, "中文")).toBe(`中文${punctuation}中文`);
  },
);

test.each([",", ".", ";", ":", "!", "?", ")", "]", "}"])(
  "Chinese joining keeps closing or separating ASCII punctuation %s attached",
  (punctuation) => {
    expect(joinChinese("中文", punctuation)).toBe(`中文${punctuation}`);
    expect(joinChinese("かな", punctuation, "Latin")).toBe(`かな${punctuation}Latin`);
  },
);

test.each(["(", "[", "{"])(
  "Chinese joining keeps opening ASCII punctuation %s attached to following CJK",
  (punctuation) => {
    expect(joinChinese(punctuation, "中文")).toBe(`${punctuation}中文`);
    expect(joinChinese(punctuation, "カナ")).toBe(`${punctuation}カナ`);
    expect(joinChinese("中文", punctuation)).toBe(`中文 ${punctuation}`);
  },
);

test("Chinese catalog interpolation follows the runtime boundary rule", () => {
  expect(zhCN.planning.palette.customise("功能")).toBe("自定义功能工作流");
  expect(zhCN.planning.palette.customise("Latin")).toBe("自定义 Latin 工作流");
  expect(zhCN.planning.roadmap.rename("First")).toBe("重命名 First");
  expect(zhCN.planning.roadmap.rename("（中文）")).toBe("重命名（中文）");
  expect(zhCN.review.diff.recorded("审查发现", "已解决")).toBe("审查发现已记录为已解决。");
  expect(zhCN.stints.gateApproved("审查")).toBe("关卡已批准。阶段推进至审查。");
  expect(zhCN.stints.approve("实现")).toBe("批准实现");
  expect(zhCN.stints.approve("Design 自定义")).toBe("批准 Design 自定义");
  expect(zhCN.stints.workflowStages("Team workflow 自定义")).toBe("Team workflow 自定义工作流阶段");
});

test("Chinese catalogs have exactly the English keys and translated, nonempty entries", () => {
  function check(english: Record<string, unknown>, chinese: Record<string, unknown>, prefix = "") {
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort());
    for (const [key, entry] of Object.entries(english)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const translated = chinese[key];
      expect(typeof translated, path).toBe(typeof entry);
      if (entry && typeof entry === "object") {
        check(entry as Record<string, unknown>, translated as Record<string, unknown>, path);
        continue;
      }
      if (typeof entry === "function") expect(samples[path], path).toBeDefined();
      for (const args of samples[path] ?? [[]]) {
        const original =
          typeof entry === "function" ? Reflect.apply(entry, undefined, args) : entry;
        const result =
          typeof translated === "function"
            ? Reflect.apply(translated, undefined, args)
            : translated;
        expect(typeof result, path).toBe("string");
        expect((result as string).trim(), path).not.toBe("");
        if (!unchanged.has(original as string)) expect(result, path).not.toBe(original);
      }
    }
  }
  check(en, zhCN);
});
