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
  "stints.copyPath": [["/repo/中文"]],
  "stints.stageStint": [["Stage 自定义"]],
  "stints.ticket": [[null], [1]],
  "stints.gateApproved": [["Stage 自定义"]],
  "stints.gateReopened": [["Stage 自定义"]],
  "stints.gate": [["Stage 自定义"]],
  "stints.gateConditions": [["Stage 自定义"]],
  "stints.approve": [["Stage 自定义"]],
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
