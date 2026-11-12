// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { PageHeader } from "./PageHeader";

test("renders the page identity and actions", () => {
  render(
    <PageHeader
      eyebrow="Project / Overview"
      title="Overview"
      description="Context"
      actions={<button type="button">Action</button>}
    />,
  );
  expect(screen.getByText("Project / Overview")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByText("Context")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
});
