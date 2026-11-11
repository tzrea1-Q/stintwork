// SPDX-License-Identifier: Apache-2.0
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { DiffPreview } from "./DiffPreview";

test("diff preview discloses unified removed and added lines with visible markers and tones", async () => {
  const user = userEvent.setup();
  render(<DiffPreview before={"Original 原文\n"} content={"Proposed 原文\n"} />);
  expect(screen.getByText("-Original 原文", { exact: false })).not.toBeVisible();
  await user.click(screen.getByText("Preview diff"));
  const diff = screen.getByRole("region", { name: "Code block" });
  expect(diff).toHaveTextContent("@@ -1,1 +1,1 @@");
  expect(within(diff).getByText("+Proposed 原文")).toHaveClass("text-success-foreground");
  expect(within(diff).getByText("-Original 原文")).toHaveClass("text-destructive");
  expect(diff).toHaveClass("overflow-auto", "max-h-64");
  diff.focus();
  expect(diff).toHaveFocus();
});

test("an append collapses old instructions to three context lines", () => {
  const before = "Hidden one\nHidden two\nContext one\nContext two\nContext three\n";
  render(<DiffPreview before={before} content={`${before}New instruction 原文\n`} open />);
  const diff = screen.getByRole("region", { name: "Code block" });
  expect(diff).not.toHaveTextContent("Hidden");
  expect(diff.querySelectorAll('[data-diff-kind="context"]')).toHaveLength(3);
  expect(within(diff).getByText("+New instruction 原文")).toBeVisible();
});

test("a create displays every line as added and explains missing final newline", () => {
  render(<DiffPreview before={null} content={"First\n\nLast"} open />);
  const diff = screen.getByRole("region", { name: "Code block" });
  expect(
    [...diff.querySelectorAll('[data-diff-kind="added"]')].map((line) => line.textContent),
  ).toEqual(["+First\n", "+\n", "+Last\n"]);
  expect(diff.querySelector('[data-diff-kind="removed"]')).not.toBeInTheDocument();
  expect(within(diff).getByText("No newline at end of file")).toBeVisible();
});

test("identical content has an explicit empty diff", () => {
  render(<DiffPreview before="Same" content="Same" open />);
  expect(screen.getByText("No content changes.")).toBeVisible();
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});
