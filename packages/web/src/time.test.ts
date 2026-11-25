// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { fullTime, relativeTime } from "./time";

test.each([
  ["en", ["30 seconds ago", "2 hours ago", "6 weeks ago"]],
  ["zh-CN", ["30秒钟前", "2小时前", "6周前"]],
])("formats relative and full times in %s", (language, expected) => {
  const now = Date.parse("2026-11-25T12:34:56Z");
  expect(
    [30, 2 * 3600, 6 * 7 * 86400].map((seconds) =>
      relativeTime(new Date(now - seconds * 1000).toISOString(), now, language),
    ),
  ).toEqual(expected);
  expect(fullTime(new Date(now).toISOString(), language)).toBe(
    new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(now),
  );
  expect(
    new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" })
      .formatToParts(now)
      .some((part) => part.type === "second"),
  ).toBe(false);
});
