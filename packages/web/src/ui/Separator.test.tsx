// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Separator } from "./Separator";
test("supports semantic and decorative separators", () => {
  const { container } = render(
    <>
      <Separator />
      <Separator decorative />
    </>,
  );
  expect(screen.getAllByRole("separator")).toHaveLength(1);
  expect(container.lastChild).toHaveAttribute("role", "none");
});
