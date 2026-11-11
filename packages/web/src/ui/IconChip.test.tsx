// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Search } from "lucide-react";
import { IconChip } from "./IconChip";
test("names meaningful icons and hides decorative icons", () => {
  const { container } = render(
    <>
      <IconChip icon={Search} label="Search" />
      <IconChip icon={Search} />
    </>,
  );
  expect(screen.getByRole("img", { name: "Search" }).firstChild).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  expect(container.lastChild).toHaveAttribute("aria-hidden", "true");
});
