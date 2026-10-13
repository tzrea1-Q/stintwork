// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { CodeBlock } from "./CodeBlock";

test("a named code region preserves whitespace and is reachable with the keyboard", async () => {
  render(<CodeBlock>{'const original = "原文";\n  keepIndentation();'}</CodeBlock>);
  const code = screen.getByRole("region", { name: "Code block" });
  expect(code.textContent).toBe('const original = "原文";\n  keepIndentation();');
  expect(code).toHaveClass("overflow-auto", "whitespace-pre", "[overflow-wrap:normal]");
  await userEvent.setup().tab();
  expect(code).toHaveFocus();
});
