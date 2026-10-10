import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Board } from "./Board";
import { attentionProfile, attentionSnapshot } from "./attention-test-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

function loggedOut() {
  return attentionSnapshot([], {
    ...attentionProfile,
    id: "claude",
    displayName: "Claude Code",
    capabilities: {
      ...attentionProfile.capabilities,
      authenticationRequired: {
        message: "Authentication required",
        loginCommand: "claude auth login",
      },
    },
    availability: {
      available: false,
      kind: "login-required",
      checkedAt: "2026-10-09T10:00:00Z",
      reason: "Sign in with claude auth login.",
    },
  });
}

test("login attention shows the agent and exact login command without fake work-item, stint or permission controls", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Board snapshot={loggedOut()} />);
  expect(document.title).toBe("(1) Project · Stintwork");
  expect(screen.queryByLabelText("1 open attention items")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  const queue = screen.getByRole("dialog");
  expect(
    within(queue).getByRole("heading", { name: "Claude Code needs a login" }),
  ).toBeInTheDocument();
  expect(within(queue).getByText("claude auth login", { selector: "code" })).toBeInTheDocument();
  expect(within(queue).queryByText(/Ticket|Stint|No ticket/)).not.toBeInTheDocument();
  expect(within(queue).queryByRole("button", { name: /^Yes|^No$/ })).not.toBeInTheDocument();
  rerender(<Board snapshot={attentionSnapshot([])} />);
  expect(within(queue).getByText("Nothing needs you right now.")).toBeInTheDocument();
});

test("after signing in, the developer can refresh cached availability and sees errors when refresh fails", async () => {
  const user = userEvent.setup();
  let acknowledge: (response: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          acknowledge = resolve;
        }),
    ),
  );
  render(<Board snapshot={loggedOut()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  await user.click(screen.getByRole("button", { name: "Refresh agent availability" }));
  expect(fetch).toHaveBeenCalledWith("/api/agents?refresh=true");
  expect(screen.getByRole("button", { name: "Checking login…" })).toBeDisabled();
  acknowledge(new Response("{}", { status: 503 }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not refresh agent availability. Try again.",
  );
  await user.click(screen.getByRole("button", { name: "Refresh agent availability" }));
  acknowledge(new Response("{}"));
  expect(await screen.findByRole("button", { name: "Refresh agent availability" })).toBeEnabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Claude Code needs a login" })).toBeInTheDocument();
});
