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
