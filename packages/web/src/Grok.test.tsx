import { builtInWorkflows, compileBrief, type AgentProfile } from "@stintwork/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Board } from "./Board";
import { WorkItemDrawer } from "./WorkItemDrawer";
import { attentionProfile, attentionSnapshot } from "./attention-test-fixtures";

const warning =
  'Grok Build has permission_mode = "always-approve" in its config. Grok won’t ask for permissions, regardless of the stint’s permission level.';
const grok: AgentProfile = {
  ...attentionProfile,
  id: "grok",
  displayName: "Grok Build",
  warnings: [warning],
  capabilities: {
    ...attentionProfile.capabilities,
    authenticationRequired: { message: "Authentication required", loginCommand: "grok login" },
    permissionMode: "always-approve",
  },
};
afterEach(() => {
  vi.unstubAllGlobals();
});

test("choosing Grok in the brief preview shows the permission warning before Start, and choosing another agent removes it", async () => {
  const user = userEvent.setup();
  const snapshot = attentionSnapshot([], grok);
  snapshot.workItems[0].activeStint = null;
  const item = snapshot.workItems[0];
  const brief = {
    ...compileBrief({
      files: { read: () => undefined, list: () => [] },
      workItem: item,
      ticket: item.tickets[0],
      stage: builtInWorkflows.feature.stages[3],
    }),
    agent: "grok",
    warnings: [warning],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(url === "/api/agents" ? { agents: [grok, attentionProfile] } : brief),
        ),
    ),
  );
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  const preview = within(screen.getByRole("dialog", { name: "Brief preview" }));
  expect(await preview.findByRole("alert")).toHaveTextContent(warning);
  expect(preview.getByRole("button", { name: "Start" })).toBeEnabled();
  await user.selectOptions(preview.getByRole("combobox", { name: "Agent" }), attentionProfile.id);
  expect(preview.queryByText(warning)).not.toBeInTheDocument();
  await user.selectOptions(preview.getByRole("combobox", { name: "Agent" }), "grok");
  expect(preview.getByRole("alert")).toHaveTextContent(warning);
});

test("Needs you shows the Grok login command without permission options and checks external login", async () => {
  const user = userEvent.setup();
  const profile: AgentProfile = {
    ...grok,
    availability: { available: false, kind: "login-required", checkedAt: "2026-10-09T10:00:00Z" },
  };
  const snapshot = attentionSnapshot([], profile);
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const { rerender } = render(<Board snapshot={snapshot} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  const queue = within(screen.getByRole("dialog", { name: "Needs you 1" }));
  expect(queue.getByText("grok login", { selector: "code" })).toBeInTheDocument();
  expect(queue.queryByRole("button", { name: /Yes, proceed/ })).not.toBeInTheDocument();
  await user.click(queue.getByRole("button", { name: "Refresh agent availability" }));
  expect(fetch).toHaveBeenCalledWith("/api/agents?refresh=true");
  rerender(<Board snapshot={{ ...snapshot, attentionItems: [] }} />);
  expect(await screen.findByText("Nothing needs you right now.")).toBeInTheDocument();
});

test("a failed login availability refresh stays in Needs you with an error", async () => {
  const user = userEvent.setup();
  const snapshot = attentionSnapshot([], {
    ...grok,
    availability: { available: false, kind: "login-required", checkedAt: "2026-10-09T10:00:00Z" },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
  render(<Board snapshot={snapshot} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  await user.click(screen.getByRole("button", { name: "Refresh agent availability" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not refresh agent availability.",
  );
  expect(screen.getByText("grok login", { selector: "code" })).toBeInTheDocument();
});
