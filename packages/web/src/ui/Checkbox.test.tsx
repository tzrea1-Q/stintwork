// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { Checkbox } from "./Checkbox";

test("shared checkbox toggles with pointer and Space and respects disabled", async () => {
  const user = userEvent.setup();
  const view = render(
    <label htmlFor="file-choice">
      <Checkbox id="file-choice" />
      Select file
    </label>,
  );
  const checkbox = screen.getByRole("checkbox", { name: "Select file" });
  await user.click(checkbox);
  expect(checkbox).toBeChecked();
  await user.keyboard(" ");
  expect(checkbox).not.toBeChecked();
  view.rerender(
    <label htmlFor="file-choice">
      <Checkbox id="file-choice" disabled />
      Select file
    </label>,
  );
  await user.click(checkbox);
  expect(checkbox).not.toBeChecked();
});
