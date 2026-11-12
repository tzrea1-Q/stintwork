// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { Markdown } from "./Markdown";

test("developer Markdown keeps GFM, omits HTML and gives code keyboard scroll access", async () => {
  const { container } = render(
    <Markdown>
      {
        '# Developer 原文\n\n- [x] Done\n\n<script>unsafe()</script>\n\n```json\n{"command": "long unbroken original command"}\n```'
      }
    </Markdown>,
  );
  expect(screen.getByRole("heading", { name: "Developer 原文" })).toBeInTheDocument();
  expect(screen.getByRole("checkbox")).toBeChecked();
  expect(container.querySelector("script")).not.toBeInTheDocument();
  const code = container.querySelector("pre");
  expect(code).toHaveTextContent('"long unbroken original command"');
  expect(code).toHaveClass("overflow-auto", "whitespace-pre", "[overflow-wrap:normal]");
  await userEvent.setup().tab();
  expect(code).toHaveFocus();
});

test("Markdown headings retain their source styles at accessible detail levels", () => {
  const { container } = render(
    <Markdown>{"# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six"}</Markdown>,
  );
  for (const [index, name] of ["One", "Two", "Three", "Four", "Five", "Six"].entries()) {
    expect(screen.getByRole("heading", { name, level: Math.min(index + 3, 6) })).toHaveAttribute(
      "data-markdown-heading",
      `h${index + 1}`,
    );
  }
  expect(container.firstChild).toHaveClass(
    "[&_[data-markdown-heading=h1]]:text-xl",
    "[&_[data-markdown-heading=h2]]:text-lg",
    "[&_[data-markdown-heading=h3]]:text-base",
  );
});
