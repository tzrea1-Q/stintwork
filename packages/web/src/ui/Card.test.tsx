// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Eyebrow,
} from "./Card";

test("renders its content", () => {
  const { container } = render(<Card>Content</Card>);
  expect(screen.getByText("Content")).toBeInTheDocument();
  expect(container.firstElementChild).toHaveAttribute("data-slot", "card");
});

test("supports compact cards", () => {
  const { container } = render(<Card size="sm">Content</Card>);
  expect(container.firstChild).toHaveAttribute("data-size", "sm");
});

test("composes all card parts", () => {
  const { container } = render(
    <Card>
      <CardHeader>
        <CardTitle>Title</CardTitle>
        <CardDescription>Details</CardDescription>
        <CardAction>Action</CardAction>
      </CardHeader>
      <CardContent>Body</CardContent>
      <CardFooter>Footer</CardFooter>
    </Card>,
  );
  for (const slot of [
    "card-header",
    "card-title",
    "card-description",
    "card-action",
    "card-content",
    "card-footer",
  ])
    expect(container.querySelector(`[data-slot="${slot}"]`)).toBeInTheDocument();
});

test("eyebrow precedes the accessible card title", () => {
  render(
    <Card>
      <CardHeader>
        <Eyebrow>Live</Eyebrow>
        <CardTitle>Running stints</CardTitle>
      </CardHeader>
    </Card>,
  );
  const eyebrow = screen.getByText("Live");
  const title = screen.getByRole("heading", { name: "Running stints" });
  expect(eyebrow.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
