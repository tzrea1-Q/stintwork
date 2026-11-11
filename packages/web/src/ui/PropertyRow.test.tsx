// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Search } from "lucide-react";
import { PropertyList, PropertyRow } from "./PropertyRow";
test("uses definition semantics and exposes full value", () => {
  const { container } = render(
    <PropertyList>
      <PropertyRow icon={Search} label="Name" value="Long value" />
    </PropertyList>,
  );
  expect(container.querySelector("dl dt")).toHaveTextContent("Name");
  expect(container.querySelector("dl dd")).toHaveAttribute("title", "Long value");
  expect(screen.getByRole("group").querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});
