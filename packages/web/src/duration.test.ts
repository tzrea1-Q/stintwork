// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { formatDuration } from "./duration";
import { en } from "./i18n/en";
import { zhCN } from "./i18n/zh-CN";

test.each([
  [en, ["less than a minute", "59 min", "3 h 12 min", "34 days"]],
  [zhCN, ["不到 1 分钟", "59 分钟", "3 小时 12 分钟", "34 天"]],
])("formats durations in the catalog language", (t, expected) => {
  expect([0, 59, 192, 49065].map((minutes) => formatDuration(minutes, t))).toEqual(expected);
});
