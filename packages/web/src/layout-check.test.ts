// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test, vi } from "vitest";
import { collectLayoutIssues } from "../e2e/layout-check";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

test("layout checking rejects horizontal document overflow", () => {
  Object.defineProperties(document.documentElement, {
    scrollWidth: { configurable: true, value: 901 },
    clientWidth: { configurable: true, value: 900 },
  });
  try {
    expect(collectLayoutIssues()).toContain("Document horizontal overflow: 901 > 900");
  } finally {
    Reflect.deleteProperty(document.documentElement, "scrollWidth");
    Reflect.deleteProperty(document.documentElement, "clientWidth");
  }
});

test("clipped text needs a deliberate marker with its full title; local code scrolling is allowed", () => {
  document.body.innerHTML = '<span style="overflow: hidden">完整标题 Full title</span>';
  const label = document.body.firstElementChild as HTMLElement;
  vi.spyOn(label, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 100, 20));
  Object.defineProperties(label, { clientWidth: { value: 100 }, scrollWidth: { value: 200 } });
  expect(collectLayoutIssues()).toEqual([
    "Clipped text without full-text truncation marker: 完整标题 Full title",
  ]);
  label.dataset.truncate = "";
  label.title = "Incomplete";
  expect(collectLayoutIssues()).not.toEqual([]);
  label.title = "完整标题 Full title";
  expect(collectLayoutIssues()).toEqual([]);
  label.removeAttribute("data-truncate");
  label.style.overflow = "auto";
  expect(collectLayoutIssues()).toEqual([]);
});

test("even one pixel of clipped text fails, including on the checked region itself", () => {
  document.body.innerHTML = '<section id="board" style="overflow:hidden">Title</section>';
  const board = document.getElementById("board") as HTMLElement;
  vi.spyOn(board, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 100, 20));
  Object.defineProperties(board, { clientWidth: { value: 100 }, scrollWidth: { value: 101 } });
  expect(collectLayoutIssues({ region: "#board" })).toEqual([
    "Clipped text without full-text truncation marker: Title",
  ]);
});

test.each(["data-radix-popper-content-wrapper", 'role="dialog"', 'role="menu"'])(
  "layout checking enforces the gutter for %s",
  (attribute) => {
    document.body.innerHTML = `<div ${attribute}>Overlay</div>`;
    const overlay = document.body.firstElementChild as HTMLElement;
    const bounds = vi.spyOn(overlay, "getBoundingClientRect");
    bounds.mockReturnValue(new DOMRect(16, 16, 100, 100));
    expect(collectLayoutIssues()).toEqual([]);
    bounds.mockReturnValue(new DOMRect(15, 16, 100, 100));
    expect(collectLayoutIssues()).toEqual(["Overlay outside 16px viewport gutter: Overlay"]);
    document.body.innerHTML = "";
  },
);
