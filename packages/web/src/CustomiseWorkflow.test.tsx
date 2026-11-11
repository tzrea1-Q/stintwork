// SPDX-License-Identifier: Apache-2.0

import {
  builtInWorkflows,
  builtInWorkflowYaml,
  createMemoryRepoFiles,
  indexProject,
} from "@stintwork/core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Board } from "./Board";
import { CustomiseWorkflow } from "./CustomiseWorkflow";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { chooseOption } from "./select-test-helper";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function snapshot(id = "feature") {
  return indexProject(
    createMemoryRepoFiles({
      ".scratch/example/workflow.yaml": `title: Example\nworkflow: ${id}\nstage: ${builtInWorkflows[id as keyof typeof builtInWorkflows].stages[0].id}\n`,
    }),
    { name: "Fixture" },
  );
}
function fetcher(id: keyof typeof builtInWorkflowYaml = "feature") {
  const fetch = vi.fn(async (path: string) =>
    response(
      path.endsWith("/customise/preview")
        ? { id, path: `.stintwork/workflows/${id}.yaml`, yaml: builtInWorkflowYaml[id] }
        : { agents: [], id, commit: "a".repeat(40) },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

test("the YAML grid item can shrink so code scrolls inside its preview", async () => {
  fetcher();
  render(<CustomiseWorkflow id="feature" onClose={vi.fn()} />);
  const preview = await screen.findByRole("region", { name: "Built-in workflow YAML" });
  expect(screen.getAllByRole("listitem")).toHaveLength(builtInWorkflows.feature.stages.length);
  expect(screen.getByText("/to-spec")).toBeInTheDocument();
  expect(preview).toHaveClass("min-w-0");
  expect(preview.querySelector("pre")).toHaveClass("overflow-auto");
});

test("customisation traps Tab and dismisses on an outside click", async () => {
  fetcher();
  const user = userEvent.setup();
  const close = vi.fn();
  render(<CustomiseWorkflow id="feature" onClose={close} />);
  await screen.findByLabelText("Built-in workflow YAML");
  screen.getByRole("button", { name: "Cancel" }).focus();
  await user.tab({ shift: true });
  expect(document.activeElement?.tagName).toBe("PRE");
  await user.tab({ shift: true });
  expect(screen.getByRole("button", { name: "Confirm customisation" })).toHaveFocus();
  await user.tab();
  expect(document.activeElement?.tagName).toBe("PRE");
  await user.tab();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  fireEvent.pointerDown(document.body);
  expect(close).toHaveBeenCalledOnce();
});
beforeEach(() => {
  window.history.replaceState(null, "", "/?view=pipeline");
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.lang = "en";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

test("Chinese customisation preserves the exact workflow YAML, path and commit message", async () => {
  const success = vi.spyOn(toast, "success");
  localStorage.setItem(languageStorageKey, "zh-CN");
  const fetch = fetcher();
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(
    <LanguageProvider>
      <CustomiseWorkflow id="feature" onClose={onClose} />
    </LanguageProvider>,
  );
  const dialog = within(screen.getByRole("dialog", { name: "自定义功能工作流" }));
  expect(await dialog.findByText(".stintwork/workflows/feature.yaml")).toBeInTheDocument();
  expect(
    dialog.getByRole("region", { name: "内置工作流 YAML" }).querySelector("code")?.textContent,
  ).toBe(builtInWorkflowYaml.feature);
  expect(dialog.getByText(/Customise workflow feature/)).toBeInTheDocument();
  expect(dialog.getByRole("button", { name: "取消" })).toBeInTheDocument();
  await user.click(dialog.getByRole("button", { name: "确认自定义" }));
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/workflows/feature/customise",
    expect.objectContaining({ method: "POST", body: "{}" }),
  );
  expect(onClose).toHaveBeenCalledOnce();
  expect(success).toHaveBeenCalledWith("工作流已保存。");
  success.mockRestore();
});

test("Chinese stage summaries translate gate kinds", async () => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  fetcher();
  render(
    <LanguageProvider>
      <CustomiseWorkflow id="feature" onClose={vi.fn()} />
    </LanguageProvider>,
  );
  await screen.findByText(".stintwork/workflows/feature.yaml");
  expect(screen.getAllByText("人工审批").length).toBeGreaterThan(0);
  expect(screen.getByText("规格审批")).toBeInTheDocument();
  expect(screen.getByText("工单审批")).toBeInTheDocument();
  expect(screen.getByText("审查证据")).toBeInTheDocument();
  expect(screen.getByText("合并")).toBeInTheDocument();
});

test.each(["drawer", "palette"])(
  "previews and confirms customisation from the %s",
  async (entry) => {
    const user = userEvent.setup();
    const fetch = fetcher();
    render(<Board snapshot={snapshot()} />);
    if (entry === "drawer") {
      await user.click(screen.getByRole("button", { name: "Open example: Example" }));
      await user.click(screen.getByRole("button", { name: "Customise" }));
    } else {
      fireEvent.keyDown(document, { key: "k", metaKey: true });
      await user.type(
        within(screen.getByRole("dialog", { name: "Command palette" })).getByRole("combobox"),
        "Customise",
      );
      await user.click(screen.getByRole("option", { name: "Customise Feature workflow" }));
      expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
    }
    const dialog = within(screen.getByRole("dialog", { name: "Customise Feature workflow" }));
    await dialog.findByText(".stintwork/workflows/feature.yaml");
    expect(dialog.getByLabelText("Built-in workflow YAML").textContent).toBe(
      builtInWorkflowYaml.feature,
    );
    expect(dialog.getByText(/Commits as/)).toHaveTextContent("Customise workflow feature");
    expect(fetch.mock.calls.filter(([path]) => path.endsWith("/customise"))).toHaveLength(0);
    expect(fetch).toHaveBeenCalledWith(
      "/api/workflows/feature/customise/preview",
      expect.objectContaining({ method: "POST", body: "{}", signal: expect.any(AbortSignal) }),
    );
    await user.click(dialog.getByRole("button", { name: "Confirm customisation" }));
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/workflows/feature/customise",
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Customise Feature workflow" }),
      ).not.toBeInTheDocument(),
    );
    if (entry === "drawer") expect(screen.getByRole("button", { name: "Customise" })).toHaveFocus();
  },
);

test.each(["bug", "quick"] as const)("the palette previews the %s built-in", async (id) => {
  const user = userEvent.setup();
  fetcher(id);
  render(<Board snapshot={snapshot()} />);
  fireEvent.keyDown(document, { key: "k", metaKey: true });
  await user.click(
    screen.getByRole("option", { name: `Customise ${builtInWorkflows[id].name} workflow` }),
  );
  const dialog = within(
    screen.getByRole("dialog", { name: `Customise ${builtInWorkflows[id].name} workflow` }),
  );
  expect((await dialog.findByLabelText("Built-in workflow YAML")).textContent).toBe(
    builtInWorkflowYaml[id],
  );
});

test("Cancel and Escape do not write and restore the drawer action's focus", async () => {
  const user = userEvent.setup();
  const fetch = fetcher();
  render(<Board snapshot={snapshot()} />);
  await user.click(screen.getByRole("button", { name: "Open example: Example" }));
  for (const dismissal of ["Cancel", "Escape"]) {
    await user.click(screen.getByRole("button", { name: "Customise" }));
    const dialog = within(screen.getByRole("dialog", { name: "Customise Feature workflow" }));
    await dialog.findByLabelText("Built-in workflow YAML");
    if (dismissal === "Cancel") await user.click(dialog.getByRole("button", { name: "Cancel" }));
    else await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "Customise Feature workflow" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Example" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Customise" })).toHaveFocus();
  }
  expect(fetch.mock.calls.filter(([path]) => path.endsWith("/customise"))).toHaveLength(0);
});

test("confirmation stays disabled until the YAML preview arrives", async () => {
  let finish!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  render(<CustomiseWorkflow id="feature" onClose={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Confirm customisation" })).toBeDisabled();
  await act(async () =>
    finish(
      response({ path: ".stintwork/workflows/feature.yaml", yaml: builtInWorkflowYaml.feature }),
    ),
  );
  expect(screen.getByRole("button", { name: "Confirm customisation" })).toBeEnabled();
});

test.each(["already exists", "has uncommitted changes"])(
  "a preview refusal (%s) cannot be confirmed",
  async (reason) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response({ reason }, 409)),
    );
    render(<CustomiseWorkflow id="feature" onClose={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(reason);
    expect(screen.getByRole("button", { name: "Confirm customisation" })).toBeDisabled();
  },
);

test("a confirmation refusal keeps the YAML preview and allows cancel", async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      path.endsWith("/preview")
        ? response({ path: ".stintwork/workflows/feature.yaml", yaml: builtInWorkflowYaml.feature })
        : response({ reason: "Workflow file already exists." }, 409),
    ),
  );
  render(<CustomiseWorkflow id="feature" onClose={close} />);
  await screen.findByLabelText("Built-in workflow YAML");
  await user.click(screen.getByRole("button", { name: "Confirm customisation" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
  expect(screen.getByLabelText("Built-in workflow YAML").textContent).toBe(
    builtInWorkflowYaml.feature,
  );
  expect(close).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(close).toHaveBeenCalledOnce();
});

test("pending confirmation disables duplicate writes and dismissal", async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  let finish!: (value: Response) => void;
  const fetch = vi.fn((path: string) =>
    path.endsWith("/preview")
      ? Promise.resolve(
          response({
            path: ".stintwork/workflows/feature.yaml",
            yaml: builtInWorkflowYaml.feature,
          }),
        )
      : new Promise<Response>((resolve) => {
          finish = resolve;
        }),
  );
  vi.stubGlobal("fetch", fetch);
  render(<CustomiseWorkflow id="feature" onClose={close} />);
  await screen.findByLabelText("Built-in workflow YAML");
  await user.click(screen.getByRole("button", { name: "Confirm customisation" }));
  expect(screen.getByRole("button", { name: "Customising…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await user.keyboard("{Escape}");
  fireEvent.pointerDown(document.body);
  expect(close).not.toHaveBeenCalled();
  expect(fetch.mock.calls.filter(([path]) => path.endsWith("/customise"))).toHaveLength(1);
  await act(async () => finish(response({ commit: "a".repeat(40) }, 201)));
  expect(close).toHaveBeenCalledOnce();
});

test("new workflow ids appear in the create dialog without a built-in copy action", async () => {
  const user = userEvent.setup();
  fetcher();
  const project = indexProject(
    createMemoryRepoFiles({
      ".stintwork/workflows/team.yaml": builtInWorkflowYaml.quick
        .replace("id: quick", "id: team")
        .replace("name: Quick", "name: Team"),
      ".scratch/example/workflow.yaml": "title: Example\nworkflow: team\nstage: do\n",
    }),
    { name: "Fixture" },
  );
  render(<Board snapshot={project} />);
  await user.keyboard("c");
  const create = within(screen.getByRole("dialog", { name: "Create work item" }));
  await chooseOption(user, create.getByRole("combobox", { name: "Workflow" }), "Team");
  expect(create.getByRole("combobox", { name: "Workflow" })).toHaveTextContent("Team");
  await user.click(create.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Open example: Example" }));
  expect(screen.getByText("Workflow: Team")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Customise" })).not.toBeInTheDocument();
});
