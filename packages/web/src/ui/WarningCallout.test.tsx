// SPDX-License-Identifier: Apache-2.0
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { WarningCallout } from "./WarningCallout";

test("warning callout previews every path and first line, disclosing full developer text", async () => {
  const user = userEvent.setup();
  const path = `docs/${"long-path-中文/".repeat(30)}spec.md`;
  render(
    <WarningCallout
      warnings={[
        { path, message: "First line 原文\r\nMore detail 原文" },
        { message: "Another warning 原文" },
      ]}
    />,
  );
  const callout = screen.getByRole("alert", { name: "2 warnings" });
  expect(within(callout).getByText(path)).toHaveClass("truncate");
  expect(within(callout).getByText(path)).toHaveAttribute("title", path);
  expect(within(callout).getByText("First line 原文", { exact: true })).toBeVisible();
  expect(within(callout).getByText("First line 原文", { exact: true })).toHaveAttribute(
    "title",
    "First line 原文",
  );
  expect(within(callout).getByText("First line 原文", { exact: true })).toHaveClass("truncate");
  const previews = within(callout).getAllByRole("list")[0];
  expect(within(previews).getByText("Another warning 原文")).toBeVisible();
  const detail = within(callout).getByText(/More detail 原文/);
  expect(detail).not.toBeVisible();
  await user.click(screen.getByText("Warning details"));
  expect(detail).toBeVisible();
  expect(detail).toHaveTextContent(`${path}: First line 原文 More detail 原文`);
  await user.click(screen.getByText("Warning details"));
  expect(detail).not.toBeVisible();
  expect(within(previews).getByText("Another warning 原文")).toBeVisible();
});

test("an empty warning collection renders no callout", () => {
  render(<WarningCallout warnings={[]} />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
