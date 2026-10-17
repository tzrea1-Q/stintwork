// SPDX-License-Identifier: Apache-2.0
import {
  builtInWorkflows,
  compileBrief,
  createMemoryRepoFiles,
  indexProject,
} from "@stintwork/core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { en } from "./i18n/en";
import { zhCN } from "./i18n/zh-CN";
import { WorkItemDrawer } from "./WorkItemDrawer";
import { codexProfile } from "../../agents/src/profiles";
import { TicketBriefPreview } from "./BriefPreview";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { Sheet, SheetContent, SheetTitle } from "./ui/Sheet";

test.each(["Escape", "outside"])(
  "brief preview contains focus and only dismisses itself with %s",
  async (dismissal) => {
    const user = userEvent.setup();
    const closeParent = vi.fn();
    vi.stubGlobal("fetch", previewFetch());
    render(
      <Sheet open onOpenChange={closeParent}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Work item details</SheetTitle>
          <TicketBriefPreview item={item} ticket={ticket} />
        </SheetContent>
      </Sheet>,
    );
    const start = screen.getByRole("button", { name: "Start stint" });
    await user.click(start);
    await screen.findByRole("heading", { name: "Read first" });
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Start" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close brief preview" })).toHaveFocus();
    if (dismissal === "Escape") await user.keyboard("{Escape}");
    else fireEvent.pointerDown(document.body);
    await waitFor(() => expect(start).toHaveFocus());
    expect(screen.queryByRole("dialog", { name: "Brief preview" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Work item details" })).toBeInTheDocument();
    expect(closeParent).not.toHaveBeenCalled();
  },
);

const ticketPath = ".scratch/first-stint/issues/02-brief-preview.md";
const specPath = ".scratch/first-stint/spec.md";
const files = createMemoryRepoFiles({
  "AGENTS.md": "Conventions",
  "GLOSSARY.md": "Terms",
  "docs/adr/0001-files.md": "# Files are the source of truth",
  [specPath]: "# The first stint",
  [ticketPath]: "# 02 — Brief preview\nStatus: ready-for-agent\nBlocked by: none",
});
const item = indexProject(files, { name: "Stintwork" }).workItems[0];
const ticket = item.tickets[0];

test.each([
  [true, false, "此工单已解决。"],
  [false, true, "被工单 01, 12 阻塞。"],
])("Chinese brief explains why a ticket cannot start (%s, %s)", (resolved, blocked, reason) => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  render(
    <LanguageProvider>
      <TicketBriefPreview
        item={item}
        ticket={{ ...ticket, resolved, blocked, blockedBy: [1, 12] }}
      />
    </LanguageProvider>,
  );
  expect(screen.getByText(reason)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "开始 Stint" })).toBeDisabled();
  localStorage.removeItem(languageStorageKey);
});
const agents = [codexProfile];
const brief = compileBrief({
  files,
  workItem: item,
  stage: builtInWorkflows.feature.stages[3],
  ticket,
});

function previewFetch(preview = brief) {
  return vi.fn(
    async (url: string) =>
      new Response(JSON.stringify(url === "/api/agents" ? { agents } : preview)),
  );
}

afterEach(() => {
  localStorage.removeItem(languageStorageKey);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test.each([
  ["en", "Start stint", "Read first", "Start", "Codex’s sandbox"],
  ["zh-CN", "开始 Stint", "先阅读", "开始", "Codex 的沙盒"],
])(
  "%s brief announces a start refusal once, separately from the safety warning",
  async (language, open, ready, start, warning) => {
    localStorage.setItem(languageStorageKey, language);
    const load = previewFetch();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/stints"
          ? new Response(JSON.stringify({ reason: "Fixture start refusal." }), { status: 409 })
          : load(url),
      ),
    );
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <TicketBriefPreview item={item} ticket={ticket} />
      </LanguageProvider>,
    );
    await user.click(screen.getByRole("button", { name: open }));
    await screen.findByRole("heading", { name: ready });
    const action = screen.getByRole("button", { name: start });
    await waitFor(() => expect(action).toBeEnabled());
    await user.click(action);
    await screen.findByText("Fixture start refusal.");
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(2);
    expect(alerts.filter((alert) => alert.textContent === "Fixture start refusal.")).toHaveLength(
      1,
    );
    expect(alerts.filter((alert) => alert.textContent?.startsWith(warning))).toHaveLength(1);
    expect(action).toBeEnabled();
  },
);

test("Chinese brief translates the Codex permission warning, not the agent prompt", async () => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  vi.stubGlobal("fetch", previewFetch());
  render(
    <LanguageProvider>
      <TicketBriefPreview item={item} ticket={ticket} />
    </LanguageProvider>,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "开始 Stint" }));
  expect(
    await screen.findByText(
      "Codex 的沙盒可以不经问询执行命令。Stintwork 只能控制 Codex 发出的请求；命令和工作树外的访问可能不会产生请求。",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      (_text, element) => element?.tagName === "PRE" && element.textContent === brief.prompt,
    ),
  ).toBeInTheDocument();
});

test("Chinese brief translates pointer reasons, preserving paths, decision titles and the prompt", async () => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  vi.stubGlobal("fetch", previewFetch());
  render(
    <LanguageProvider>
      <TicketBriefPreview item={item} ticket={ticket} />
    </LanguageProvider>,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "开始 Stint" }));
  expect(await screen.findByText(/项目约定与 Agent 指令/, { selector: "li" })).toHaveTextContent(
    "AGENTS.md",
  );
  expect(
    screen.getByText(/决策记录：Files are the source of truth/, { selector: "li" }),
  ).toHaveTextContent("docs/adr/0001-files.md");
  expect(
    screen.getByText(
      (_text, element) => element?.tagName === "PRE" && element.textContent === brief.prompt,
    ),
  ).toBeInTheDocument();
});

test("resume preview shows the checkpoint alongside the handoff and changed spec", async () => {
  const resumed = compileBrief({
    files,
    workItem: item,
    stage: builtInWorkflows.feature.stages[3],
    ticket,
    checkpointCommit: "0123456789abcdef",
    lastHandoff: {
      stint: "previous",
      agent: "codex",
      stoppedAt: "Code written",
      unresolved: "Checks remain",
      nextStep: "Review changes",
    },
    changedPaths: [specPath],
  });
  vi.stubGlobal("fetch", previewFetch(resumed));
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Start stint" }));
  const sheet = within(screen.getByRole("dialog", { name: "Brief preview" }));
  await sheet.findByRole("heading", { name: "Checkpoint commit" });
  expect(sheet.getByText("0123456789abcdef", { selector: "code" })).toBeInTheDocument();
  expect(
    sheet.getByRole("heading", { name: "Last handoff (previous, codex)" }),
  ).toBeInTheDocument();
  expect(sheet.getByText("Checks remain", { selector: "dd" })).toBeInTheDocument();
  const changes = sheet
    .getByRole("heading", { name: "Changed since the last handoff" })
    .closest("section");
  expect(
    within(changes as HTMLElement).getByText(specPath, { selector: "code" }),
  ).toBeInTheDocument();
});

test("opens the drawer's brief sheet, shows every section and copies the exact prompt", async () => {
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const fetch = previewFetch();
  vi.stubGlobal("fetch", fetch);
  render(<WorkItemDrawer item={item} onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  const preview = within(screen.getByRole("dialog", { name: "Brief preview" }));
  await preview.findByRole("heading", { name: "Read first" });
  for (const heading of [
    "Agent",
    "Skill",
    "Read first",
    "Last handoff",
    "Changed since the last handoff",
    "Full prompt",
  ]) {
    expect(preview.getByRole("heading", { name: heading })).toBeInTheDocument();
  }
  for (const pointer of brief.pointers) {
    expect(preview.getByText(pointer.path, { selector: "li code" })).toBeInTheDocument();
    expect(
      preview.getByText(`— ${pointer.reason.text}`, { exact: false, selector: "li" }),
    ).toBeInTheDocument();
  }
  expect(preview.getByText(`/implement ${ticketPath}`, { selector: "code" })).toBeInTheDocument();
  expect(
    preview.getByText("None — start from the project conventions and work item scope."),
  ).toBeInTheDocument();
  expect(preview.getByText("None.")).toBeInTheDocument();
  expect(
    preview.getByText("Where the handoff and the files disagree, the files win.", {
      selector: "p",
    }),
  ).toBeInTheDocument();
  expect(preview.getByRole("combobox", { name: "Agent" })).toHaveTextContent("Codex");
  await user.click(preview.getByRole("combobox", { name: "Agent" }));
  expect(screen.getByRole("option", { name: "Codex" })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.getAllByRole("option")).toHaveLength(1);
  await user.keyboard("{Escape}");
  expect(preview.getByRole("button", { name: "Start" })).toBeEnabled();
  expect(preview.getByText(/Working instructions:/, { selector: "pre" }).textContent).toBe(
    brief.prompt,
  );
  await user.click(preview.getByRole("button", { name: "Copy prompt" }));
  expect(writeText).toHaveBeenCalledWith(brief.prompt);
  expect(preview.getByRole("status")).toHaveTextContent("Copied");
  expect(fetch).toHaveBeenCalledWith(
    "/api/work-items/first-stint/tickets/2/brief-preview",
    expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
  );
  expect(fetch).toHaveBeenCalledWith(
    "/api/agents",
    expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
  );
  expect(fetch).toHaveBeenCalledTimes(3);
});

test("blocked and resolved implementation tickets show disabled reasons, and Ship cannot start", () => {
  const fetch = previewFetch();
  vi.stubGlobal("fetch", fetch);
  const { rerender } = render(
    <WorkItemDrawer
      item={{ ...item, tickets: [{ ...ticket, blocked: true, blockedBy: [1] }] }}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Start stint" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Start stint" })).toHaveAccessibleDescription(
    "Blocked by ticket 01.",
  );
  rerender(
    <WorkItemDrawer
      item={{ ...item, tickets: [{ ...ticket, resolved: true }] }}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Start stint" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Start stint" })).toHaveAccessibleDescription(
    "This ticket is resolved.",
  );
  rerender(<WorkItemDrawer item={{ ...item, stage: "ship" }} onClose={vi.fn()} />);
  for (const action of screen.getAllByRole("button", { name: "Start stint" })) {
    expect(action).toBeDisabled();
    expect(action).toHaveAccessibleDescription("This stage has no stint skill.");
  }
  expect(fetch.mock.calls.every(([url]) => url === "/api/agents")).toBe(true);
});

test("Escape closes only the preview and returns focus to Start stint", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", previewFetch());
  const closeDrawer = vi.fn();
  render(<WorkItemDrawer item={item} onClose={closeDrawer} />);
  const start = screen.getByRole("button", { name: "Start stint" });
  await user.click(start);
  await screen.findByRole("heading", { name: "Read first" });
  expect(screen.getByRole("button", { name: "Close brief preview" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Brief preview" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "The first stint" })).toBeInTheDocument();
  expect(start).toHaveFocus();
  expect(closeDrawer).not.toHaveBeenCalled();
});

test("load failures display the server reason without enabling Start", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ reason: "Blocked by ticket 01." }), { status: 409 }),
      ),
  );
  render(<WorkItemDrawer item={item} onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  expect(
    await within(screen.getByRole("dialog", { name: "Brief preview" })).findByRole("alert"),
  ).toHaveTextContent("Blocked by ticket 01.");
  expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Copy prompt" })).not.toBeInTheDocument();
});

test("closing during loading cancels the preview request, and a live resolved ticket removes the sheet", async () => {
  const user = userEvent.setup();
  const fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetch);
  const { rerender } = render(<WorkItemDrawer item={item} onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  expect(
    within(screen.getByRole("dialog", { name: "Brief preview" })).getByRole("status"),
  ).toHaveTextContent("Reading the brief…");
  const signal: AbortSignal = fetch.mock.calls[1][1].signal;
  expect(fetch.mock.calls[2][1].signal).toBe(signal);
  fireEvent.click(screen.getByRole("button", { name: "Close brief preview" }));
  expect(signal.aborted).toBe(true);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  rerender(
    <WorkItemDrawer
      item={{ ...item, tickets: [{ ...ticket, resolved: true }] }}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole("dialog", { name: "Brief preview" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start stint" })).toBeDisabled();
  rerender(<WorkItemDrawer item={item} onClose={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Start stint" })).toBeEnabled();
  expect(screen.queryByRole("dialog", { name: "Brief preview" })).not.toBeInTheDocument();
});

test("clipboard failure keeps the full prompt available for manual copying", async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Clipboard denied"));
  vi.stubGlobal("fetch", previewFetch());
  render(<WorkItemDrawer item={item} onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  await user.click(await screen.findByRole("button", { name: "Copy prompt" }));
  await waitFor(() =>
    expect(
      within(screen.getByRole("dialog", { name: "Brief preview" })).getByRole("status"),
    ).toHaveTextContent("Could not copy. Select the prompt to copy it manually."),
  );
  expect(screen.getByText(/Working instructions:/, { selector: "pre" }).textContent).toBe(
    brief.prompt,
  );
});

test("future handoff and changed-path inputs render as structured brief sections", async () => {
  const user = userEvent.setup();
  const resumed = compileBrief({
    files,
    workItem: item,
    stage: builtInWorkflows.feature.stages[3],
    ticket,
    lastHandoff: {
      stint: "stint-001",
      agent: "Codex",
      stoppedAt: "Compiler ready",
      unresolved: "Sheet missing",
      nextStep: "Build the sheet",
    },
    changedPaths: [specPath],
  });
  vi.stubGlobal("fetch", previewFetch(resumed));
  render(<WorkItemDrawer item={item} onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  expect(
    await screen.findByRole("heading", { name: "Last handoff (stint-001, Codex)" }),
  ).toBeInTheDocument();
  for (const text of [
    "Where it stopped",
    "Compiler ready",
    "What is unresolved",
    "Sheet missing",
    "Suggested next step",
    "Build the sheet",
  ]) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
  expect(screen.getAllByText(specPath, { selector: "li code" })).toHaveLength(2);
});

test.each(["en", "zh-CN"] as const)(
  "%s preparation streams source, confirms before download, cancels and retries",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const t = language === "en" ? en : zhCN;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const encode = new TextEncoder();
    const send = (event: unknown) =>
      controller.enqueue(encode.encode(`${JSON.stringify(event)}\n`));
    let starts = 0;
    const load = previewFetch();
    const fetch = vi.fn(async (url: string) => {
      if (url === "/api/stints") {
        starts++;
        return new Response(
          new ReadableStream<Uint8Array>({
            start(value) {
              controller = value;
            },
          }),
          { headers: { "Content-Type": "application/x-ndjson" } },
        );
      }
      if (url.endsWith("/stop")) {
        send({ type: "result", status: 503, body: { reason: "Cancelled" } });
        controller.close();
        return new Response("{}", { status: 202 });
      }
      if (url.endsWith("/confirm-agent")) return new Response("{}");
      return load(url);
    });
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <TicketBriefPreview item={item} ticket={ticket} />
      </LanguageProvider>,
    );
    await user.click(screen.getByRole("button", { name: t.stints.startStint }));
    await screen.findByRole("heading", { name: t.stints.fullPrompt });
    await user.click(screen.getByRole("button", { name: t.stints.start }));
    const progress = {
      source: "bundled",
      reason: "below-tested-range",
      phase: "confirm",
      adapterVersion: "2.1.1",
      executable: { path: "/cache/selected/codex", version: "0.159.3" },
    };
    await act(async () => send({ type: "preparation", stintId: "preparing", progress }));
    expect(
      await screen.findByRole("heading", {
        name: `${t.stints.preparation.source}: ${t.stints.preparation.bundled}`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(t.stints.preparation.bundledNotice)).toBeInTheDocument();
    expect(screen.getByText("/cache/selected/codex")).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/confirm-agent"))).toBe(false);
    await user.click(screen.getByRole("button", { name: t.stints.preparation.confirm }));
    expect(fetch).toHaveBeenCalledWith("/api/stints/preparing/confirm-agent", { method: "POST" });
    await act(async () =>
      send({
        type: "preparation",
        stintId: "preparing",
        progress: { ...progress, phase: "installing" },
      }),
    );
    expect(
      screen.getByText(t.coreText["agent.preparation.installing"], { exact: true }),
    ).toHaveAttribute("role", "status");
    await user.click(screen.getByRole("button", { name: t.stints.preparation.cancel }));
    const retry = await screen.findByRole("button", { name: t.stints.preparation.retry });
    expect(retry).toBeEnabled();
    await user.click(retry);
    expect(starts).toBe(2);
    await act(async () => {
      send({
        type: "availability",
        agent: "codex",
        availability: { available: false, canStart: true, kind: "preparation-failed" },
      });
      send({ type: "result", status: 503, body: { reason: "Offline fixture failure" } });
      controller.close();
    });
    expect(await screen.findByText("Offline fixture failure")).toHaveAttribute("role", "alert");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: t.stints.startStint })).toHaveFocus();
  },
);

test.each([
  "not-prepared",
  "missing-executable",
  "login-required",
  "incompatible",
  "preparation-failed",
  "ready",
] as const)("%s is honest and recoverable in the stint-start picker", async (state) => {
  const agent = {
    ...codexProfile,
    availability: {
      available: state === "ready",
      kind: state === "ready" ? undefined : state,
      canStart: true,
      selection: { source: "bundled", reason: "missing", adapterVersion: "2.1.1" },
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(JSON.stringify(url === "/api/agents" ? { agents: [agent] } : brief)),
    ),
  );
  const user = userEvent.setup();
  render(<TicketBriefPreview item={item} ticket={ticket} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  expect(await screen.findByText(en.stints.preparation.states[state])).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  if (state === "login-required")
    expect(screen.getByText("codex login", { selector: "code" })).toBeInTheDocument();
});

test("closing an explicit start aborts the request; cancellation is available during version inspection", async () => {
  const user = userEvent.setup();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let signal: AbortSignal | undefined;
  const load = previewFetch();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url !== "/api/stints") return load(url);
      signal = options?.signal as AbortSignal;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(value) {
            controller = value;
          },
        }),
        { headers: { "Content-Type": "application/x-ndjson" } },
      );
    }),
  );
  render(<TicketBriefPreview item={item} ticket={ticket} />);
  const trigger = screen.getByRole("button", { name: "Start stint" });
  await user.click(trigger);
  await screen.findByRole("heading", { name: "Full prompt" });
  await user.click(screen.getByRole("button", { name: "Start" }));
  await act(async () =>
    controller.enqueue(
      new TextEncoder().encode(`${JSON.stringify({ type: "starting", stintId: "inspecting" })}\n`),
    ),
  );
  expect(screen.getByRole("button", { name: en.stints.preparation.cancel })).toBeEnabled();
  await user.keyboard("{Escape}");
  expect(signal?.aborted).toBe(true);
  expect(trigger).toHaveFocus();
  await act(async () => controller.close());
});
