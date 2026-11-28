// SPDX-License-Identifier: Apache-2.0
import { builtInWorkflows, createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { BoardWorkflowFilter } from "./BoardWorkflowFilter";
import { en } from "./i18n/en";
import { workflowName } from "./i18n/workflow-names";

test("the workflow label appears once when dismissing or choosing an option", async () => {
  const user = userEvent.setup();
  const snapshot = indexProject(createMemoryRepoFiles({}), { name: "Test", branch: "main" });
  snapshot.workflows = { feature: builtInWorkflows.feature };
  const label = workflowName(builtInWorkflows.feature, en);
  render(
    <BoardWorkflowFilter snapshot={snapshot} items={snapshot.workItems} openSlug={null}>
      {(_, picker) => picker}
    </BoardWorkflowFilter>,
  );
  const trigger = screen.getByRole("combobox", { name: en.pipelineBoard.workflow });
  await user.click(trigger);
  expect(trigger).toHaveTextContent(/^All workflows$/);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  expect(trigger).toHaveTextContent(/^All workflows$/);
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  expect(trigger).toHaveTextContent(/^All workflows$/);
  await user.click(await screen.findByRole("option", { name: label }));
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  expect(trigger.textContent).toBe(label);
  expect(trigger).toHaveFocus();
});
