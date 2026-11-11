// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { AgentAvatar } from "./AgentAvatar";
test("names agents and falls back for unknown agents", () => {
  render(<AgentAvatar agent="unknown" name="New agent" active size="sm" />);
  const avatar = screen.getByRole("img", { name: "New agent" });
  expect(avatar).toHaveTextContent("N");
  expect(avatar.firstChild).toHaveClass("bg-stopped-soft");
  expect(avatar).toHaveClass("size-5");
});
