// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { en } from "./en";
import { zhCN } from "./zh-CN";

const unchanged = new Set(["Stintwork", "Claude Code", "Codex", "Grok Build", "Stint", "Agent"]);
const samples: Record<string, unknown[][]> = {
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
  "planning.palette.customise": [["Repo 原文"]],
  "planning.roadmap.name": [["Repo 原文"]],
  "planning.roadmap.rename": [["Repo 原文"]],
  "planning.roadmap.status": [["Repo 原文"]],
  "planning.roadmap.setStatus": [["Repo 原文"]],
  "planning.roadmap.target": [["Repo 原文"]],
  "planning.roadmap.setTarget": [["Repo 原文"]],
  "planning.roadmap.up": [["Repo 原文"]],
  "planning.roadmap.down": [["Repo 原文"]],
  "planning.customise.title": [["Repo 原文"]],
  "planning.customise.commit": [["Repo 原文"]],
  "planning.setup.committed": [["Repo 原文"]],
  "planning.setup.changeLabel": [["Repo 原文"]],
  "planning.setup.preview": [["Repo 原文"]],
  "planning.setup.write": [[0], [1], [2]],
  "planning.setup.agentSkills": [["Repo 原文"]],
  "planning.create.exists": [["repo-name"]],
  "planning.create.existsInGit": [["repo-name"]],
  "planning.create.directory": [["repo-name"]],
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
  "review.diff.recorded": [["Finding", "resolved"]],
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
};

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
