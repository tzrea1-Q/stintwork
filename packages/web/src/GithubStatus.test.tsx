// SPDX-License-Identifier: Apache-2.0
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { GithubStatus } from "./GithubStatus";

afterEach(() => vi.useRealTimers());

test("conflicts retry on timers and eventually release controls", async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .spyOn(window, "fetch")
    .mockResolvedValue({ ok: false, status: 409 } as Response);
  render(<GithubStatus />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  fetcher.mockRestore();
});

test("load more stops retrying when the cursor disappears", async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .spyOn(window, "fetch")
    .mockResolvedValue({ ok: false, status: 409 } as Response);
  const github = {
    repository: "a/b",
    repositoryId: "R",
    items: [],
    scanned: 1,
    cursor: "next",
    complete: false,
    pages: [],
    warnings: [],
  };
  const { rerender } = render(<GithubStatus github={github} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  });
  rerender(<GithubStatus github={{ ...github, cursor: null }} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
  fetcher.mockRestore();
});

test.each([1, 3])(
  "load more retries after snapshot updates, with %s conflicts",
  async (conflicts) => {
    const fetcher = vi.spyOn(window, "fetch");
    for (let i = 0; i < conflicts; i++)
      fetcher.mockResolvedValueOnce({ ok: false, status: 409 } as Response);
    fetcher.mockResolvedValueOnce({ ok: true, status: 200 } as Response);
    const github = {
      repository: "a/b",
      repositoryId: "R",
      items: [],
      scanned: 1,
      cursor: "next",
      complete: false,
      pages: [],
      warnings: [],
    };
    const { rerender } = render(<GithubStatus github={github} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    for (let i = 1; i < conflicts; i++) {
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(i));
      rerender(<GithubStatus github={{ ...github, scanned: i + 1 }} />);
    }
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(conflicts));
    if (conflicts === 1) {
      rerender(<GithubStatus github={{ ...github, scanned: 10 }} />);
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
      expect(fetcher).toHaveBeenLastCalledWith("/api/github/discovery/load-more", {
        method: "POST",
      });
    } else {
      expect(await screen.findByRole("button", { name: "Retry" })).toBeEnabled();
    }
    fetcher.mockRestore();
  },
);

test("retry and load more unlock at a retry time received after mount", () => {
  vi.useFakeTimers();
  const github = {
    repository: "example/project",
    repositoryId: "R_1",
    items: [],
    scanned: 1,
    cursor: "next",
    complete: false,
    pages: [],
    warnings: [],
    error: "rate limit",
    discoveryFailed: true,
  };
  const { rerender } = render(<GithubStatus github={github} />);
  act(() => vi.advanceTimersByTime(600_000));
  rerender(
    <GithubStatus github={{ ...github, retryAt: new Date(Date.now() + 30_000).toISOString() }} />,
  );
  const retry = screen.getByRole("button", { name: "Retry" });
  const more = screen.getByRole("button", { name: "Load more" });
  expect(retry).toBeDisabled();
  expect(more).toBeDisabled();
  act(() => vi.advanceTimersByTime(29_999));
  expect(retry).toBeDisabled();
  act(() => vi.advanceTimersByTime(1));
  expect(retry).toBeEnabled();
  expect(more).toBeEnabled();
});

test.each([false, true])(
  "discovery failure %s controls board freshness and retry",
  (discoveryFailed) => {
    render(
      <GithubStatus
        github={{
          repository: "example/project",
          repositoryId: "R_1",
          items: [
            {
              id: "A",
              number: 1,
              title: "A",
              url: "https://example.com/1",
              complete: true,
              detail: { spec: "", tickets: [], stale: true },
            },
          ],
          scanned: 1,
          cursor: "next",
          complete: false,
          pages: [],
          warnings: [],
          fetchedAt: "2026-10-28T00:00:00Z",
          stale: true,
          discoveryFailed,
          error: "detail or discovery failure",
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: discoveryFailed ? "Retry" : "Refresh" }),
    ).toBeEnabled();
    if (discoveryFailed) expect(screen.getByText(/Last successful fetch:/)).toBeInTheDocument();
    else expect(screen.queryByText(/Last successful fetch:/)).not.toBeInTheDocument();
  },
);

test("cursor-only discovery explains that more pages can be loaded", () => {
  render(
    <GithubStatus
      github={{
        repository: "a/b",
        repositoryId: "R",
        items: [],
        scanned: 1,
        cursor: "next",
        complete: false,
        pages: [],
        warnings: [],
      }}
    />,
  );
  expect(screen.getByText("More pages are available to load.")).toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

test.each([
  [
    "en",
    "Some connections failed or are incomplete.",
    "2 items have incomplete membership.",
    "Issue #1: relationship unavailable or incomplete.",
    "Issue #2: labelled child excluded.",
  ],
  [
    "zh-CN",
    "部分连接失败或不完整。",
    "2 个工作项的归属信息不完整。",
    "Issue #1：关系连接不可用或不完整。",
    "Issue #2：已排除带标签的子 Issue。",
  ],
])(
  "%s discovery shows localized warnings and incomplete membership",
  async (language, summary, count, first, second) => {
    const { readCoreTextWire } = await import("@stintwork/core");
    const { LanguageProvider, languageStorageKey } = await import("./i18n/language");
    localStorage.setItem(languageStorageKey, language);
    const github = readCoreTextWire({
      repository: "a/b",
      repositoryId: "R",
      items: [1, 2].map((number) => ({
        id: String(number),
        number,
        title: "A",
        url: "https://example.com",
        complete: false,
      })),
      scanned: 2,
      cursor: null,
      complete: false,
      pages: [],
      warnings: [
        "Issue #1: relationship unavailable or incomplete.",
        "Issue #2: labelled child excluded.",
      ],
      warningMessages: [
        { code: "github.relationshipIncomplete", params: { issue: "1" } },
        { code: "github.labelledChildExcluded", params: { issue: "2" } },
      ],
    }) as NonNullable<import("@stintwork/core").ProjectSnapshot["github"]>;
    render(
      <LanguageProvider>
        <GithubStatus github={github} />
      </LanguageProvider>,
    );
    expect(screen.getByText(summary)).toBeInTheDocument();
    expect(screen.getByText(count)).toBeInTheDocument();
    expect(screen.getByText(first)).toBeInTheDocument();
    expect(screen.getByText(second)).toBeInTheDocument();
    localStorage.removeItem(languageStorageKey);
  },
);
