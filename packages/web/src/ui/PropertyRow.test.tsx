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

test("truncates node values only when their full text is supplied", () => {
  const { rerender } = render(
    <PropertyList>
      <PropertyRow
        icon={Search}
        label="Name"
        value={<strong>Long value</strong>}
        fullText="Complete value"
      />
    </PropertyList>,
  );
  let value = screen.getByText("Long value").closest("dd");
  expect(value).toHaveAttribute("title", "Complete value");
  expect(value).toHaveClass("truncate");
  rerender(
    <PropertyList>
      <PropertyRow icon={Search} label="Name" value={<strong>Long value</strong>} />
    </PropertyList>,
  );
  value = screen.getByText("Long value").closest("dd");
  expect(value).not.toHaveAttribute("title");
  expect(value).not.toHaveClass("truncate");
  expect(value).toHaveClass("[overflow-wrap:anywhere]");
});
