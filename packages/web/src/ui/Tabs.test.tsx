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
  const active = screen.getByRole("tab", { name: "A" });
  expect(active).toHaveAttribute("data-state", "active");
  expect(active).toHaveClass("data-[state=active]:text-foreground");
  expect(active.querySelectorAll("[data-slot=tabs-indicator]")).toHaveLength(1);
});

test("moves focus down in vertical tabs", async () => {
  const user = userEvent.setup();
  render(
    <Tabs orientation="vertical" defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">A</TabsTrigger>
        <TabsTrigger value="b">B</TabsTrigger>
      </TabsList>
    </Tabs>,
  );
  await user.tab();
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("tab", { name: "B" })).toHaveFocus();
  expect(screen.getByRole("tab", { name: "B" })).toHaveAttribute("aria-selected", "true");
});

test.each(["line", "default"] as const)(
  "indicator follows click and keyboard in %s tabs",
  async (variant) => {
    const user = userEvent.setup();
    const { container } = render(
      <Tabs defaultValue="a">
        <TabsList variant={variant}>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">First</TabsContent>
        <TabsContent value="b">Second</TabsContent>
      </Tabs>,
    );
    const a = screen.getByRole("tab", { name: "A" });
    const b = screen.getByRole("tab", { name: "B" });
    await user.click(b);
    expect(screen.getByText("Second")).toBeVisible();
    expect(container.querySelectorAll('[data-slot="tabs-indicator"]')).toHaveLength(1);
    expect(b.querySelector('[data-slot="tabs-indicator"]')).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("First")).toBeVisible();
    expect(a.querySelector('[data-slot="tabs-indicator"]')).toBeInTheDocument();
  },
);

test("each tab list owns its indicator", () => {
  const { container } = render(
    <>
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">One</TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Two</TabsTrigger>
        </TabsList>
      </Tabs>
    </>,
  );
  expect(container.querySelectorAll('[data-slot="tabs-indicator"]')).toHaveLength(2);
  expect(
    screen.getByRole("tab", { name: "One" }).querySelector('[data-slot="tabs-indicator"]'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("tab", { name: "Two" }).querySelector('[data-slot="tabs-indicator"]'),
  ).toBeInTheDocument();
});
