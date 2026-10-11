// SPDX-License-Identifier: Apache-2.0
import {
  builtInWorkflows,
  compileBrief,
  createMemoryRepoFiles,
  indexProject,
  permissionLevels,
} from "@stintwork/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { codexProfile, claudeProfile, grokProfile } from "../../agents/src/profiles";
import { StageBriefPreview } from "./BriefPreview";

const files = createMemoryRepoFiles({
  ".scratch/first/workflow.yaml": "workflow: feature\nstage: spec\n",
});
const item = indexProject(files, { name: "Project" }).workItems[0];
const brief = compileBrief({ files, workItem: item, stage: builtInWorkflows.feature.stages[1] });
afterEach(() => vi.unstubAllGlobals());

test.each(permissionLevels)(
  "the selector uses the %s project default and sends the chosen stint level",
  async (level) => {
    const user = userEvent.setup();
    const fetch = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url === "/api/agents"
              ? { agents: [claudeProfile] }
              : { ...brief, agent: "claude", permissionLevel: level },
          ),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    render(<StageBriefPreview item={item} />);
    await user.click(screen.getByRole("button", { name: "Start stint" }));
    const sheet = within(screen.getByRole("dialog", { name: "Brief preview" }));
    await sheet.findByRole("heading", { name: "Full prompt" });
    const selector = sheet.getByRole("combobox", { name: "Permission level" });
    expect(selector).toHaveValue(level);
    expect(sheet.getByRole("button", { name: "Use as project default" })).toBeDisabled();
    await user.selectOptions(selector, "autonomous");
    await user.click(sheet.getByRole("button", { name: "Start" }));
    expect(fetch).toHaveBeenCalledWith(
      "/api/stints",
      expect.objectContaining({
        body: JSON.stringify({
          workItem: "first",
          ticket: null,
          agent: "claude",
          permissionLevel: "autonomous",
        }),
      }),
    );
  },
);

test("Edit freely is the fallback and changing the project default is explicit and handles save errors", async () => {
  const user = userEvent.setup();
  let failure = true;
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url === "/api/agents"
            ? { agents: [claudeProfile] }
            : url === "/api/project/permission-level"
              ? failure
                ? { reason: "Read-only config." }
                : { permissionLevel: "ask" }
              : { ...brief, agent: "claude" },
        ),
        { status: url === "/api/project/permission-level" && failure ? 503 : 200 },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  render(<StageBriefPreview item={item} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  const sheet = within(screen.getByRole("dialog", { name: "Brief preview" }));
  await sheet.findByRole("heading", { name: "Full prompt" });
  expect(sheet.getByRole("combobox", { name: "Permission level" })).toHaveValue("edit-freely");
  await user.selectOptions(sheet.getByRole("combobox", { name: "Permission level" }), "ask");
  expect(sheet.getByText("Project default: Edit freely")).toBeInTheDocument();
  expect(fetch.mock.calls).toHaveLength(2);
  await user.click(sheet.getByRole("button", { name: "Use as project default" }));
  expect(await sheet.findByRole("alert")).toHaveTextContent("Read-only config.");
  expect(sheet.getByText("Project default: Edit freely")).toBeInTheDocument();
  failure = false;
  await user.click(sheet.getByRole("button", { name: "Use as project default" }));
  expect(await sheet.findByText("Project default: Ask")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(
    "/api/project/permission-level",
    expect.objectContaining({ body: '{"permissionLevel":"ask"}' }),
  );
});

test("warnings follow the chosen agent and level before starting", async () => {
  const user = userEvent.setup();
  const grok = {
    ...grokProfile,
    capabilities: { ...grokProfile.capabilities, permissionMode: "always-approve" },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url === "/api/agents"
              ? { agents: [codexProfile, claudeProfile, grok] }
              : { ...brief, agent: "codex" },
          ),
        ),
    ),
  );
  render(<StageBriefPreview item={item} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  const sheet = within(screen.getByRole("dialog", { name: "Brief preview" }));
  await sheet.findByRole("heading", { name: "Full prompt" });
  expect(sheet.getByRole("alert")).toHaveTextContent("without asking");
  await user.selectOptions(sheet.getByRole("combobox", { name: "Agent" }), "claude");
  expect(sheet.queryByRole("alert")).not.toBeInTheDocument();
  await user.selectOptions(sheet.getByRole("combobox", { name: "Agent" }), "grok");
  for (const level of permissionLevels) {
    await user.selectOptions(sheet.getByRole("combobox", { name: "Permission level" }), level);
    expect(sheet.getByRole("alert")).toHaveTextContent("always-approve");
    expect(sheet.getByRole("alert")).toHaveTextContent("cannot enforce the worktree boundary");
  }
});
