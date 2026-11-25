// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { AgentAvatar } from "./AgentAvatar";

test.each([
  ["Claude Code", "CC"],
  ["Codex", "Co"],
  ["Antigravity", "An"],
  ["custom-agent", "CA"],
  ["grok", "Gr"],
])("shows initials for %s", (name, initials) => {
  render(<AgentAvatar agent={name} name={name} size="sm" />);
  expect(screen.getByRole("img", { name })).toHaveTextContent(initials);
});

test("unknown agent retains fallback colors and small size", () => {
  render(<AgentAvatar agent="unknown" name="New agent" active size="sm" />);
  const avatar = screen.getByRole("img", { name: "New agent" });
  expect(avatar).toHaveTextContent("NA");
  expect(avatar.firstChild).toHaveClass("bg-stopped-soft");
  expect(avatar).toHaveClass("size-5");
});
