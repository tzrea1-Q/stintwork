// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Avatar, AvatarFallback } from "./Avatar";
test("exposes named fallback", () => {
  render(
    <Avatar role="img" aria-label="Codex">
      <AvatarFallback>C</AvatarFallback>
    </Avatar>,
  );
  expect(screen.getByRole("img", { name: "Codex" })).toHaveTextContent("C");
});
