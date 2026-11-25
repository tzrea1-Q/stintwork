// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Board } from "./Board";

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

test("an initial URL-opened panel leaves focus alone", () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("1024"),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  window.history.replaceState(null, "", "/?view=pipeline&item=first");
  const snapshot = indexProject(
    createMemoryRepoFiles({ ".scratch/first/spec.md": "# First work item" }),
    { name: "Project" },
  );
  render(<Board snapshot={snapshot} />);
  expect(screen.getByRole("complementary", { name: "First work item" })).toBeInTheDocument();
  expect(document.body).toHaveFocus();
});
