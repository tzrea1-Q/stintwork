// SPDX-License-Identifier: Apache-2.0
import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { GithubStatus } from "./GithubStatus";

afterEach(() => vi.useRealTimers());

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
