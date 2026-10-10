import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Board } from "./Board";
import {
  attentionOptions,
  attentionProfile,
  attentionSnapshot,
  mixedAttentionSnapshot,
} from "./attention-test-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

test("permission, gate and handoff renderers coexist in the queue's derived order", async () => {
  const user = userEvent.setup();
  const snapshot = mixedAttentionSnapshot();
  render(<Board snapshot={snapshot} />);
  await user.click(screen.getByRole("button", { name: "Needs you 3" }));
  const queue = within(screen.getByRole("dialog", { name: "Needs you 3" }));
  const articles = queue
    .getAllByRole("article")
    .filter((article) => article.classList.contains("attention-item"));
  expect(articles.map((article) => article.getAttribute("aria-label"))).toEqual(
    snapshot.attentionItems.map(({ title }) => title),
  );
  expect(within(articles[0]).getByText("Permission · Test Agent")).toBeInTheDocument();
  expect(within(articles[0]).getByRole("button", { name: /Yes, proceed/ })).toBeEnabled();
  expect(within(articles[1]).getByText("Gate ready · Test Agent")).toBeInTheDocument();
  expect(within(articles[1]).getByRole("button", { name: "Approve Implement" })).toBeEnabled();
  expect(within(articles[2]).getByText("Handoff · Test Agent")).toBeInTheDocument();
  expect(within(articles[2]).getByRole("textbox", { name: "Developer note" })).toBeInTheDocument();
  expect(within(articles[2]).getByRole("button", { name: "Dismiss" })).toBeEnabled();
});

test("Needs you opens a slide-over with source, waiting time, full command and path; counts and badges follow snapshots", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Board snapshot={attentionSnapshot()} />);
  expect(document.title).toBe("(1) Project · Stintwork");
  const card = within(screen.getByRole("article", { name: /^first:/ }));
  expect(card.getByLabelText("1 open attention items")).toHaveTextContent("Needs you · 1");
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  const queue = screen.getByRole("dialog", { name: "Needs you 1" });
  expect(screen.getByRole("button", { name: "Close Needs you" })).toHaveFocus();
  expect(within(queue).getByText("Permission · Test Agent")).toBeInTheDocument();
  expect(within(queue).getByText(/Ticket 1 · Stint/)).toHaveTextContent("stint");
  expect(within(queue).getByText(/Waiting/)).toHaveAttribute("datetime", "2026-10-09T10:15:00Z");
  expect(within(queue).getByText(/pnpm test --filter/).textContent).toBe(
    "pnpm test --filter /full/path/to/project\n/full/path/to/file.ts",
  );
  expect(within(queue).getByText("Declining ends Test Agent’s turn.")).toBeInTheDocument();
  rerender(<Board snapshot={attentionSnapshot([])} />);
  expect(screen.getByRole("button", { name: "Needs you 0" })).toBeInTheDocument();
  expect(document.title).toBe("Project · Stintwork");
  expect(screen.queryByLabelText("1 open attention items")).not.toBeInTheDocument();
  expect(within(queue).getByText("Nothing needs you right now.")).toBeInTheDocument();
  fireEvent(queue, new Event("cancel", { bubbles: true }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Needs you 0" })).toHaveFocus();
});

test.each(attentionOptions)(
  "the queue forwards the agent's $name option and disables answers until acknowledged",
  async (option) => {
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
    render(<Board snapshot={attentionSnapshot()} />);
    await user.click(screen.getByRole("button", { name: "Needs you 1" }));
    await user.click(screen.getByRole("button", { name: new RegExp(option.name) }));
    expect(fetch).toHaveBeenCalledWith(
      "/api/stints/stint/permissions/request",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ optionId: option.optionId }),
      }),
    );
    for (const offered of attentionOptions)
      expect(screen.getByRole("button", { name: new RegExp(offered.name) })).toBeDisabled();
    expect(screen.queryByText("Answer sent.")).not.toBeInTheDocument();
    acknowledge(new Response("{}"));
    expect(await screen.findByText("Answer sent.")).toBeInTheDocument();
  },
);

test("failed answers stay visible with the server's reason and can be retried", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ reason: "The agent is unavailable" }), { status: 503 }),
      )
      .mockResolvedValueOnce(new Response("{}")),
  );
  render(<Board snapshot={attentionSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  await user.click(screen.getByRole("button", { name: /Yes, proceed/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The agent is unavailable");
  expect(screen.getByRole("button", { name: /Yes, proceed/ })).toBeEnabled();
  expect(screen.queryByText("Answer sent.")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Yes, proceed/ }));
  expect(await screen.findByText("Answer sent.")).toBeInTheDocument();
});

test("forwarding errors remain visible even if a decision snapshot removes the item before HTTP completes", async () => {
  const user = userEvent.setup();
  let fail: (response: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          fail = resolve;
        }),
    ),
  );
  const { rerender } = render(<Board snapshot={attentionSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  await user.click(screen.getByRole("button", { name: /Yes, proceed/ }));
  rerender(<Board snapshot={attentionSnapshot([])} />);
  fail(
    new Response(JSON.stringify({ reason: "Permission could not be forwarded" }), { status: 503 }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Check project request: Permission could not be forwarded",
  );
  expect(screen.getByText("Nothing needs you right now.")).toBeInTheDocument();
});

test.each([false, null])(
  "a profile with declineEndsTurn=%s does not claim declining ends the turn",
  async (declineEndsTurn) => {
    const user = userEvent.setup();
    const profile = {
      ...attentionProfile,
      capabilities: { ...attentionProfile.capabilities, declineEndsTurn },
    };
    render(<Board snapshot={attentionSnapshot(["request"], profile)} />);
    await user.click(screen.getByRole("button", { name: "Needs you 1" }));
    expect(screen.queryByText(/Declining ends/)).not.toBeInTheDocument();
  },
);

test("the queue spans all work items regardless of the board's milestone filter and can open a work item", async () => {
  const user = userEvent.setup();
  const snapshot = attentionSnapshot();
  snapshot.milestones = [{ id: "other", name: "Other", status: "planned", workItemSlugs: [] }];
  render(<Board snapshot={snapshot} />);
  await user.selectOptions(screen.getByRole("combobox", { name: "Milestone" }), "other");
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  await user.click(screen.getByRole("button", { name: "First work item · first" }));
  expect(screen.getByRole("dialog", { name: "First work item" })).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: /Needs you/ })).not.toBeInTheDocument();
});

test("notification permission is requested only after opt-in; only new stable ids notify and opt-out persists", async () => {
  const user = userEvent.setup();
  const requestPermission = vi.fn().mockResolvedValue("granted");
  const notify = vi.fn(function (this: unknown) {});
  vi.stubGlobal(
    "Notification",
    Object.assign(notify, { permission: "granted", requestPermission }),
  );
  const { rerender, unmount } = render(<Board snapshot={attentionSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  expect(requestPermission).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Enable browser notifications" }));
  expect(requestPermission).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("stintwork.attention-notifications")).toBe("enabled");
  rerender(<Board snapshot={attentionSnapshot(["request", "second"])} />);
  expect(notify).toHaveBeenCalledWith("Project · Needs you", {
    body: "Check project second",
    tag: 'permission:["stint","second"]',
  });
  rerender(<Board snapshot={attentionSnapshot(["second", "request"])} />);
  expect(notify).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Disable browser notifications" }));
  rerender(<Board snapshot={attentionSnapshot(["request", "second", "third"])} />);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("stintwork.attention-notifications")).toBeNull();
  unmount();
});

test("denied and unsupported browser notifications leave the queue usable without automatically prompting", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("Notification", {
    permission: "denied",
    requestPermission: vi.fn().mockResolvedValue("denied"),
  });
  const { unmount } = render(<Board snapshot={attentionSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  await user.click(screen.getByRole("button", { name: "Enable browser notifications" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Browser notifications were not enabled",
  );
  expect(screen.getByRole("button", { name: /Yes, proceed/ })).toBeEnabled();
  unmount();
  vi.stubGlobal("Notification", undefined);
  render(<Board snapshot={attentionSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  expect(screen.getByRole("button", { name: "Enable browser notifications" })).toBeDisabled();
  expect(screen.getByText("Browser notifications are not supported here.")).toBeInTheDocument();
});

test("saved opt-in survives remount without asking again or notifying for the rebuilt queue", async () => {
  const user = userEvent.setup();
  localStorage.setItem("stintwork.attention-notifications", "enabled");
  const notify = vi.fn(function (this: unknown) {});
  const requestPermission = vi.fn();
  vi.stubGlobal(
    "Notification",
    Object.assign(notify, { permission: "granted", requestPermission }),
  );
  const { rerender } = render(<Board snapshot={attentionSnapshot()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  expect(screen.getByRole("button", { name: "Disable browser notifications" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(notify).not.toHaveBeenCalled();
  expect(requestPermission).not.toHaveBeenCalled();
  rerender(<Board snapshot={attentionSnapshot(["request", "new"])} />);
  expect(notify).toHaveBeenCalledTimes(1);
});
