// SPDX-License-Identifier: Apache-2.0
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const media = vi.hoisted(() => {
  const motion = { matches: false, addEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", (query: string) =>
    query.includes("reduced-motion") ? motion : { matches: false, addEventListener: vi.fn() },
  );
  return motion;
});
import { AppearanceMenu } from "./AppearanceMenu";
import { setMotion, setTheme } from "./appearance";
import { LanguageProvider } from "./i18n/language";
import { en } from "./i18n/en";
import { zhCN } from "./i18n/zh-CN";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "./ui/DropdownMenu";
import { useReducedMotionSafe } from "./ui/motion";

function Probe() {
  return <output data-testid="reduced">{String(useReducedMotionSafe())}</output>;
}
function view() {
  return render(
    <LanguageProvider>
      <Probe />
      <DropdownMenu>
        <DropdownMenuTrigger>Settings</DropdownMenuTrigger>
        <DropdownMenuContent>
          <AppearanceMenu />
        </DropdownMenuContent>
      </DropdownMenu>
    </LanguageProvider>,
  );
}
beforeEach(() => {
  localStorage.clear();
  setTheme("system");
  setMotion("system");
});
afterEach(() => {
  setTheme("system");
  setMotion("system");
  localStorage.clear();
});
test.each(["en", "zh-CN"] as const)("both groups default to System in %s", async (language) => {
  localStorage.setItem("stintwork.language", language);
  const t = language === "en" ? en : zhCN;
  const user = userEvent.setup();
  view();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  for (const [name, label] of [
    [t.topBar.appearance, t.topBar.themes.system],
    [t.topBar.motion, t.topBar.motions.system],
  ]) {
    expect(
      within(screen.getByRole("group", { name })).getByRole("menuitemradio", { name: label }),
    ).toHaveAttribute("aria-checked", "true");
  }
});
test("Dark persists and remains selected after remount", async () => {
  localStorage.setItem("stintwork.language", "en");
  const user = userEvent.setup();
  const rendered = view();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));
  expect(document.documentElement).toHaveClass("dark");
  expect(localStorage.getItem("stintwork.theme")).toBe("dark");
  rendered.unmount();
  view();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
test("Reduced and Full update the motion hook", async () => {
  localStorage.setItem("stintwork.language", "en");
  media.matches = false;
  const user = userEvent.setup();
  view();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Reduced" }));
  expect(screen.getByTestId("reduced")).toHaveTextContent("true");
  media.matches = true;
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Full" }));
  expect(screen.getByTestId("reduced")).toHaveTextContent("false");
});
