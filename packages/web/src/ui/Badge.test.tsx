// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Badge } from "./Badge";

test("a status badge keeps its accessible status and token variant", () => {
  render(
    <Badge variant="warning" role="status" aria-label="Needs you">
      Waiting 中文
    </Badge>,
  );
  expect(screen.getByRole("status", { name: "Needs you" })).toHaveTextContent("Waiting 中文");
  expect(screen.getByRole("status")).toHaveClass("text-warning");
});
