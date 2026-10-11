// SPDX-License-Identifier: Apache-2.0
import { createMemoryRepoFiles, indexProject, planSetup } from "@stintwork/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Board } from "./Board";
import { SetupGuide } from "./SetupGuide";

const original = "# Developer rules\nKeep this exactly.\n";
function guide() {
  return {
    ...planSetup(createMemoryRepoFiles({ "AGENTS.md": original })),
    skills: [
      {
        agent: "claude",
        displayName: "Claude Code",
        skills: [
          {
            workflowId: "feature",
            stageId: "spec",
            workflow: "Feature",
            stage: "Spec",
            skill: "/to-spec",
            status: "found",
          },
          {
            workflowId: "feature",
            stageId: "tickets",
            workflow: "Feature",
            stage: "Tickets",
            skill: "/to-tickets",
            status: "missing",
            installationHint:
              "Use npx skills@latest add mattpocock/skills, select Claude Code and /to-tickets.",
          },
        ],
      },
      {
        agent: "grok",
        displayName: "Grok Build",
        skills: [
          {
            workflowId: "team",
            stageId: "design",
            workflow: "Team",
            stage: "Design",
            skill: "/design",
            status: "unknown",
          },
        ],
      },
    ],
  };
}
function server() {
  const initial = guide();
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      const { changes } = JSON.parse(String(options.body));
      return new Response(
        JSON.stringify({
          ...initial,
          changes: initial.changes.filter(
            ({ path }) => !changes.some((change: { path: string }) => change.path === path),
          ),
          commit: "a".repeat(40),
        }),
      );
    }
    return new Response(JSON.stringify(initial));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

test("the Setup chip opens exact current/proposed file content and a read-only stage skill report", async () => {
  const fetch = server();
  const user = userEvent.setup();
  render(<Board snapshot={indexProject(createMemoryRepoFiles({}), { name: "Project" })} />);
  const trigger = screen.getByRole("button", { name: /^Setup/ });
  await user.click(trigger);
  const panel = within(screen.getByRole("region", { name: "Project setup" }));
  expect(await panel.findByRole("checkbox", { name: "AGENTS.md (change)" })).toBeChecked();
  await user.click(panel.getByText("Preview AGENTS.md"));
  const agents = within(panel.getByRole("region", { name: "Change AGENTS.md" }));
  expect(agents.getByText("Current content").nextElementSibling?.textContent).toBe(original);
  expect(agents.getByText("Proposed content").nextElementSibling?.textContent).toBe(
    guide().changes.find(({ path }) => path === "AGENTS.md")?.content,
  );
  for (const change of guide().changes.filter(({ before }) => before === null)) {
    await user.click(panel.getByText(`Preview ${change.path}`));
    const section = within(panel.getByRole("region", { name: `Change ${change.path}` }));
    expect(section.queryByText("Current content")).not.toBeInTheDocument();
    expect(section.getByText("Proposed content").nextElementSibling?.textContent).toBe(
      change.content,
    );
  }
  expect(panel.getByRole("region", { name: "Claude Code skills" })).toHaveTextContent(
    "/to-spec — Found",
  );
  expect(panel.getByRole("region", { name: "Claude Code skills" })).toHaveTextContent(
    "/to-tickets — Missing",
  );
  expect(panel.getByText(/Use npx skills@latest add mattpocock\/skills/)).toBeInTheDocument();
  expect(panel.getByRole("region", { name: "Grok Build skills" })).toHaveTextContent(
    "/design — Can't tell",
  );
  expect(
    panel.getByText(/never installs skills or changes agent configuration/),
  ).toBeInTheDocument();
  expect(fetch.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "Project setup" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test("selection needs a separate confirmation and posts only the selected preview", async () => {
  const fetch = server();
  const user = userEvent.setup();
  render(<SetupGuide />);
  await screen.findByRole("checkbox", { name: "AGENTS.md (change)" });
  for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
  expect(screen.getByRole("button", { name: "Review selected changes" })).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: "AGENTS.md (change)" }));
  await user.click(screen.getByRole("button", { name: "Review selected changes" }));
  const confirm = within(screen.getByRole("region", { name: "Confirm setup" }));
  expect(confirm.getByText("Set up Stintwork")).toBeInTheDocument();
  expect(confirm.getAllByRole("listitem")).toHaveLength(1);
  expect(confirm.getByText("AGENTS.md")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("checkbox", { name: "AGENTS.md (change)" })).toBeDisabled();
  await user.click(confirm.getByRole("button", { name: "Back to selection" }));
  expect(screen.queryByRole("region", { name: "Confirm setup" })).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Review selected changes" }));
  await user.click(screen.getByRole("button", { name: "Confirm and apply setup" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Setup committed: aaaaaaa.");
  expect(fetch).toHaveBeenLastCalledWith("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      confirmed: true,
      changes: guide().changes.filter(({ path }) => path === "AGENTS.md"),
    }),
  });
  expect(screen.queryByRole("checkbox", { name: "AGENTS.md (change)" })).not.toBeInTheDocument();
  expect(
    screen.getAllByRole("checkbox").every((element) => !(element as HTMLInputElement).checked),
  ).toBe(true);
});

test("a server refusal is visible and keeps the preview and selection", async () => {
  const fetch = server();
  const user = userEvent.setup();
  render(<SetupGuide />);
  await screen.findByRole("checkbox", { name: "AGENTS.md (change)" });
  fetch.mockImplementationOnce(
    async () =>
      new Response(
        JSON.stringify({ reason: "Commit uncommitted changes to AGENTS.md before setup." }),
        { status: 409 },
      ),
  );
  await user.click(screen.getByRole("button", { name: "Review selected changes" }));
  await user.click(screen.getByRole("button", { name: "Confirm and apply setup" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("uncommitted changes to AGENTS.md");
  await user.click(screen.getByRole("button", { name: "Back to selection" }));
  expect(screen.getByRole("checkbox", { name: "AGENTS.md (change)" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "AGENTS.md (change)" })).toBeEnabled();
});

test("a fully set-up project still shows skill status but offers no file confirmation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ...guide(), changes: [] }))),
  );
  render(<SetupGuide />);
  expect(await screen.findByText("No setup file changes needed.")).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Review selected changes" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Grok Build skills" })).toHaveTextContent("Can't tell");
});

test.each(["network", "server"])("a %s preview failure cannot offer writes", async (kind) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (kind === "network") throw new Error("Cannot reach project server.");
      return new Response(JSON.stringify({ reason: "Setup unavailable." }), { status: 503 });
    }),
  );
  render(<SetupGuide />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    kind === "network" ? "Cannot reach project server." : "Setup unavailable.",
  );
  expect(screen.queryByRole("button", { name: "Review selected changes" })).not.toBeInTheDocument();
});
