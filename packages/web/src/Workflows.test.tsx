// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Board } from "./Board";

function project(id = "team", stage = "design", tickets = false) {
  return indexProject(
    createMemoryRepoFiles({
      ".stintwork/workflows/custom.yaml": JSON.stringify({
        id,
        name: "Team workflow",
        defaultAgent: "codex",
        stages: [
          { id: "design", name: "Design", column: "spec", skill: "/design", gate: "manual" },
          { id: "build", name: "Build", column: "implement", skill: "/implement", gate: "manual" },
          { id: "deliver", name: "Deliver", column: "ship", skill: null, gate: "merge" },
        ],
      }),
      ".scratch/example/spec.md": "# Example",
      ".scratch/example/workflow.yaml": `workflow: ${id}\nstage: ${stage}\n`,
      ...(tickets
        ? { ".scratch/example/issues/01-build.md": "# Build\nStatus: resolved\nBlocked by: none" }
        : {}),
    }),
    { name: "Fixture" },
  );
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

test.each(["feature", "team", "constructor"])(
  "the %s board and drawer use the loaded stages",
  (id) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ agents: [] }))),
    );
    const snapshot = project(id);
    render(<Board snapshot={snapshot} />);
    const column = screen.getByRole("region", { name: "Spec" });
    const card = within(column).getByRole("article", { name: "example: Example" });
    fireEvent.click(within(card).getByRole("button", { name: "Open example: Example" }));
    expect(screen.getByRole("list", { name: "Team workflow workflow stages" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Design agent" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Build agent" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Deliver agent" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Design gate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start stint" })).toBeEnabled();
  },
);

test("custom implementation gates and renamed Ship stages stay usable", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ agents: [] }))),
  );
  window.history.replaceState({}, "", "/?item=example");
  const rendered = render(<Board snapshot={project("team", "build")} />);
  expect(screen.getByRole("button", { name: "Approve Build" })).toBeDisabled();
  rendered.rerender(<Board snapshot={project("team", "build", true)} />);
  expect(screen.getByRole("button", { name: "Approve Build" })).toBeEnabled();
  rendered.rerender(<Board snapshot={project("team", "deliver")} />);
  expect(screen.getByRole("button", { name: "Merge locally" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Approve Deliver" })).not.toBeInTheDocument();
});

test("invalid YAML warnings are visible while the fallback work item remains on the board", () => {
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".stintwork/workflows/team.yaml": "id: team\nstages: []\n",
      ".scratch/example/spec.md": "# Example",
      ".scratch/example/workflow.yaml": "workflow: team\nstage: design\n",
    }),
    { name: "Fixture" },
  );
  render(<Board snapshot={snapshot} />);
  fireEvent.click(screen.getByRole("button", { name: /^Needs you/ }));
  expect(screen.getByText(/Invalid workflow definition/, { selector: "p" })).toBeVisible();
  expect(
    screen.getByRole("article", { name: "example: Example", hidden: true }),
  ).toBeInTheDocument();
});
