// SPDX-License-Identifier: Apache-2.0
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { en } from "../i18n/en";
import { StageStrip } from "./StageStrip";

function Board() {
  const scrollRef = useRef<HTMLElement>(null);
  return (
    <StageStrip items={[]} enabled scrollRef={scrollRef}>
      {(_narrow, _stage, edges) => (
        <section ref={scrollRef} data-fade-right={edges.right}>
          <div className="stage-grid" />
        </section>
      )}
    </StageStrip>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("overflow updates keep navigation mounted and do not resubscribe on rerender", () => {
  let resize: ResizeObserverCallback = () => {};
  const observe = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe = observe;
      disconnect = vi.fn();
    },
  );
  let callback: FrameRequestCallback | undefined;
  const request = vi.fn((next: FrameRequestCallback) => {
    callback = next;
    return 1;
  });
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  let width = 100;
  const reads = vi
    .spyOn(HTMLElement.prototype, "scrollWidth", "get")
    .mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100);
  const { container, rerender } = render(<Board />);
  const nav = container.querySelector(".stage-navigation");
  if (!nav) throw new Error("Missing stage navigation");
  const buttons = [...nav.querySelectorAll("button")];
  const elements = [...container.querySelectorAll("*")];
  expect(nav).toHaveAttribute("aria-hidden", "true");
  act(() => callback?.(0));
  const initialReads = reads.mock.calls.length;
  const initialObserves = observe.mock.calls.length;
  rerender(<Board />);
  rerender(<Board />);
  expect(reads).toHaveBeenCalledTimes(initialReads);
  expect(observe).toHaveBeenCalledTimes(initialObserves);
  expect(request).toHaveBeenCalledTimes(1);
  width = 200;
  act(() => resize([], {} as ResizeObserver));
  act(() => callback?.(0));
  expect(container.querySelector(".stage-navigation")).toBe(nav);
  expect([...container.querySelectorAll("*")]).toEqual(elements);
  expect([...nav.querySelectorAll("button")]).toEqual(buttons);
  expect(nav).toHaveAttribute("aria-hidden", "false");
  expect(screen.getByRole("button", { name: en.board.nextStages })).toBeEnabled();
  width = 100;
  act(() => resize([], {} as ResizeObserver));
  act(() => callback?.(0));
  expect(container.querySelector(".stage-navigation")).toBe(nav);
  expect([...container.querySelectorAll("*")]).toEqual(elements);
  expect([...nav.querySelectorAll("button")]).toEqual(buttons);
  expect(nav).toHaveAttribute("aria-hidden", "true");
  const scroller = container.querySelector("section");
  if (!scroller) throw new Error("Missing board scroller");
  fireEvent.scroll(scroller);
  expect(request).toHaveBeenCalledTimes(4);
});
