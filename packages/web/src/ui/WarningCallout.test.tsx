// SPDX-License-Identifier: Apache-2.0
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { WarningCallout } from "./WarningCallout";

test("warning callout shows the first line and discloses full developer text", async () => {
  const user = userEvent.setup();
  render(
    <WarningCallout
      warnings={[
        { path: "docs/中文.md", message: "First line 原文\nMore detail 原文" },
        { message: "Another warning 原文" },
      ]}
    />,
  );
  const callout = screen.getByRole("alert", { name: "2 warnings" });
  expect(within(callout).getByText("First line 原文", { exact: true })).toBeVisible();
  expect(within(callout).getByText("First line 原文", { exact: true })).toHaveAttribute(
    "title",
    "First line 原文",
  );
  expect(within(callout).getByText("Another warning 原文")).not.toBeVisible();
  await user.click(screen.getByText("Warning details"));
  expect(within(callout).getByText("Another warning 原文")).toBeVisible();
  expect(within(callout).getByRole("list")).toHaveTextContent(
    "docs/中文.md: First line 原文 More detail 原文",
  );
  await user.click(screen.getByText("Warning details"));
  expect(within(callout).getByText("Another warning 原文")).not.toBeVisible();
});

test("an empty warning collection renders no callout", () => {
  render(<WarningCallout warnings={[]} />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
