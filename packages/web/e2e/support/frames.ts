// SPDX-License-Identifier: Apache-2.0
import type { Page } from "@playwright/test";

export async function sampleFrames(page: Page, selector: string, ms: number) {
  return page.evaluate(
    ({ selector, ms }) =>
      new Promise<
        {
          opacity: string;
          transform: string;
          height: string;
          overflow: number;
          left: number;
          width: number;
          timestamp: number;
        }[]
      >((resolve, reject) => {
        const element = document.querySelector(selector);
        if (!element) return reject(new Error(`Missing element: ${selector}`));
        const frames: {
          opacity: string;
          transform: string;
          height: string;
          overflow: number;
          left: number;
          width: number;
          timestamp: number;
        }[] = [];
        const start = performance.now();
        const sample = (timestamp: number) => {
          const current = document.querySelector(selector) ?? element;
          const style = getComputedStyle(current);
          const rect = current.getBoundingClientRect();
          frames.push({
            timestamp,
            left: rect.left,
            width: rect.width,
            opacity: String(
              Array.from(
                (function* () {
                  let node: Element | null = current;
                  while (node) {
                    yield node;
                    node = node.parentElement;
                  }
                })(),
              ).reduce((opacity, node) => opacity * Number(getComputedStyle(node).opacity), 1),
            ),
            transform: style.transform,
            height: style.height,
            overflow: document.documentElement.scrollWidth - innerWidth,
          });
          if (timestamp - start < ms) requestAnimationFrame(sample);
          else resolve(frames);
        };
        requestAnimationFrame(sample);
      }),
    { selector, ms },
  );
}

export async function waitForRest(page: Page, selector: string) {
  // An async waitForFunction predicate is treated as truthy before its Promise resolves.
  await page.evaluate(
    (selector) =>
      new Promise<void>((resolve, reject) => {
        let previousElement: Element | null = null;
        let previousBounds: DOMRect | undefined;
        let stableFrames = 0;
        let last = "element not found";
        let frameId = 0;
        const timeout = setTimeout(() => {
          cancelAnimationFrame(frameId);
          reject(new Error(`Timed out waiting for ${selector} to rest: ${last}`));
        }, 3000);
        const sample = () => {
          const element = document.querySelector(selector);
          if (!element) {
            last = "element not found";
            stableFrames = 0;
            previousElement = null;
            previousBounds = undefined;
          } else {
            const animations = element
              .getAnimations({ subtree: true })
              .filter((animation) => animation.playState === "running" || animation.pending);
            const style = getComputedStyle(element);
            const { transform, translate, scale, rotate } = style;
            const bounds = element.getBoundingClientRect();
            last = JSON.stringify({
              transform,
              translate,
              scale,
              rotate,
              bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
              animations: animations.map(({ playState, pending }) => ({ playState, pending })),
            });
            const identity = transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)";
            const unchanged =
              previousElement === element &&
              previousBounds &&
              previousBounds.x === bounds.x &&
              previousBounds.y === bounds.y &&
              previousBounds.width === bounds.width &&
              previousBounds.height === bounds.height;
            stableFrames =
              identity && animations.length === 0 ? (unchanged ? stableFrames + 1 : 1) : 0;
            previousElement = element;
            previousBounds = bounds;
            if (stableFrames >= 3) {
              clearTimeout(timeout);
              resolve();
              return;
            }
          }
          frameId = requestAnimationFrame(sample);
        };
        frameId = requestAnimationFrame(sample);
      }),
    selector,
  );
}
