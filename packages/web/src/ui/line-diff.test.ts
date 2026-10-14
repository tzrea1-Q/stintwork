// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { unifiedLineDiff } from "./line-diff";

test("appends retain only three unchanged lines of context", () => {
  const before = "one\ntwo\nthree\nfour\nfive\nsix\n";
  expect(unifiedLineDiff(before, `${before}seven\neight\n`)).toMatchObject([
    {
      header: "@@ -4,3 +4,5 @@",
      lines: [
        { kind: "context", text: "four", noNewline: false },
        { kind: "context", text: "five", noNewline: false },
        { kind: "context", text: "six", noNewline: false },
        { kind: "added", text: "seven", noNewline: false },
        { kind: "added", text: "eight", noNewline: false },
      ],
    },
  ]);
});

test("distant edits form separate hunks while nearby edits share context", () => {
  const before = Array.from({ length: 30 }, (_, index) => `line ${index}\n`);
  const after = [...before];
  after[4] = "first edit\n";
  after[6] = "nearby edit\n";
  after[24] = "distant edit\n";
  const hunks = unifiedLineDiff(before.join(""), after.join(""));
  expect(hunks.map((hunk) => hunk.header)).toEqual(["@@ -2,9 +2,9 @@", "@@ -22,7 +22,7 @@"]);
  expect(hunks[0].lines.filter((line) => line.kind === "added").map((line) => line.text)).toEqual([
    "first edit",
    "nearby edit",
  ]);
  expect(hunks.flatMap((hunk) => hunk.lines).some((line) => line.text === "line 15")).toBe(false);
});

test.each([
  [null, "new\n\nlast", "@@ -0,0 +1,3 @@"],
  ["old\n", "", "@@ -1,1 +0,0 @@"],
  ["first\nold\nlast\n", "first\nnew\nlast\n", "@@ -1,3 +1,3 @@"],
  ["same\nsame\nend\n", "same\nadded\nsame\nend\n", "@@ -1,3 +1,4 @@"],
  ["first\nlast\n", "last\nfirst\n", "@@ -1,2 +1,2 @@"],
  ["old", "old\n", "@@ -1,1 +1,1 @@"],
  ["old\n", "old", "@@ -1,1 +1,1 @@"],
  ["first\r\nold\r\n", "first\r\nnew\r\n", "@@ -1,2 +1,2 @@"],
])(
  "diff reconstructs both versions, including repeated/blank and unterminated lines",
  (before, content, header) => {
    const hunks = unifiedLineDiff(before, content);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].header).toBe(header);
    const lines = hunks[0].lines;
    const restore = (skip: "added" | "removed") =>
      lines
        .filter((line) => line.kind !== skip)
        .map((line) => line.text + (line.noNewline ? "" : "\n"))
        .join("");
    expect(restore("added")).toBe(before ?? "");
    expect(restore("removed")).toBe(content);
  },
);

test("empty or identical content has no hunks", () => {
  expect(unifiedLineDiff(null, "")).toEqual([]);
  expect(unifiedLineDiff("same\n", "same\n")).toEqual([]);
});

test("large rewrites stay bounded and preserve all removed/added lines", () => {
  const before = Array.from({ length: 501 }, (_, index) => `old ${index}\n`).join("");
  const content = Array.from({ length: 501 }, (_, index) => `new ${index}\n`).join("");
  const [hunk] = unifiedLineDiff(before, content);
  expect(hunk.header).toBe("@@ -1,501 +1,501 @@");
  expect(hunk.lines.filter((line) => line.kind === "removed")).toHaveLength(501);
  expect(hunk.lines.filter((line) => line.kind === "added")).toHaveLength(501);
});
