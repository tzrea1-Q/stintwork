// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Kbd, KbdGroup } from "./Kbd";
test("renders keyboard text", () => {
  render(<Kbd>Esc</Kbd>);
  expect(screen.getByText("Esc").tagName).toBe("KBD");
});

test("groups keys", () => {
  const { container } = render(
    <KbdGroup>
      <Kbd>Ctrl</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>,
  );
  expect(container.querySelector('[data-slot="kbd-group"]')?.querySelectorAll("kbd")).toHaveLength(
    2,
  );
});
