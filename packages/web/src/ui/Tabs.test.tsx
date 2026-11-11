// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import userEvent from "@testing-library/user-event";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./Tabs";
test("navigates with arrows", async () => {
  const user = userEvent.setup();
  render(
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">A</TabsTrigger>
        <TabsTrigger value="b">B</TabsTrigger>
      </TabsList>
      <TabsContent value="b">Panel</TabsContent>
    </Tabs>,
  );
  await user.tab();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "B" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Panel")).toBeVisible();
});

test("exposes line list variant", () => {
  render(
    <Tabs defaultValue="a">
      <TabsList variant="line">
        <TabsTrigger value="a">A</TabsTrigger>
      </TabsList>
    </Tabs>,
  );
  expect(screen.getByRole("tablist")).toHaveAttribute("data-variant", "line");
});
