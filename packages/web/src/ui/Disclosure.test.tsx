// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { Disclosure } from "./Disclosure";

test("shared disclosure starts collapsed and toggles independently", async () => {
  const user = userEvent.setup();
  render(
    <>
      <Disclosure label="First">First content</Disclosure>
      <Disclosure label="Second">Second content</Disclosure>
    </>,
  );
  expect(screen.getByText("First content")).not.toBeVisible();
  await user.click(screen.getByText("First", { exact: true }));
  expect(screen.getByText("First content")).toBeVisible();
  expect(screen.getByText("Second content")).not.toBeVisible();
  await user.click(screen.getByText("First", { exact: true }));
  expect(screen.getByText("First content")).not.toBeVisible();
});
