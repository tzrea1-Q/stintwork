// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./DropdownMenu";

function LanguageMenu() {
  const [language, setLanguage] = useState("en");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Language</DropdownMenuTrigger>
      <DropdownMenuContent aria-label="Languages">
        <DropdownMenuItem disabled>Unavailable</DropdownMenuItem>
        <DropdownMenuRadioGroup value={language} onValueChange={setLanguage}>
          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="zh-CN">简体中文</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

test("a menu supports keyboard radio selection, a check indicator and Escape focus return", async () => {
  const user = userEvent.setup();
  const { container } = render(<LanguageMenu />);
  await user.tab();
  await user.keyboard("{ArrowDown}");
  const english = await screen.findByRole("menuitemradio", { name: "English" });
  expect(english).toHaveAttribute("aria-checked", "true");
  expect(english.querySelector("svg")).toBeInTheDocument();
  expect(container).not.toContainElement(screen.getByRole("menu"));
  await user.keyboard("{ArrowDown}{Enter}");
  await waitFor(() => expect(screen.getByRole("button", { name: "Language" })).toHaveFocus());
  await user.keyboard("{ArrowDown}");
  expect(await screen.findByRole("menuitemradio", { name: "简体中文" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Language" })).toHaveFocus();
});

test("outside press dismisses a menu and restores trigger focus", async () => {
  const user = userEvent.setup();
  render(<LanguageMenu />);
  await user.tab();
  await user.keyboard("{ArrowDown}");
  expect(await screen.findByRole("menu")).toBeVisible();
  fireEvent.pointerDown(document.body);
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Language" })).toHaveFocus();
});
