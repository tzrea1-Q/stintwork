// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";
import { Board } from "./Board";

const project = (files: Record<string, string>) =>
  indexProject(createMemoryRepoFiles(files), { name: "Test" });
afterEach(() => window.history.replaceState(null, "", "/"));

test("Overview opens a work item in Pipeline with keyboard and restores view on history", async () => {
  window.history.replaceState(null, "", "/");
  const user = userEvent.setup();
  render(<Board snapshot={project({ ".scratch/one/spec.md": "# One" })} />);
  expect(screen.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  const next = screen.getByText("Next up").closest('[data-slot="card"]');
  if (!(next instanceof HTMLElement)) throw new Error("Missing Next up card");
  const button = within(next).getByRole("button", { name: /One/ });
  button.focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog", { name: "One" })).toBeVisible();
  expect(window.location.search).toContain("view=pipeline");
  expect(window.location.search).toContain("item=one");
});

test("empty Overview offers existing create and Pipeline actions and reports errors", async () => {
  window.history.replaceState(null, "", "/");
  const user = userEvent.setup();
  render(<Board snapshot={project({})} connection="reconnecting" error="Offline" />);
  expect(screen.getByRole("status")).toHaveTextContent("Reconnecting");
  expect(screen.getByRole("alert")).toHaveTextContent("Offline");
  expect(screen.queryByText("Next up")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "New work item" }));
  expect(screen.getByRole("dialog")).toBeVisible();
});
