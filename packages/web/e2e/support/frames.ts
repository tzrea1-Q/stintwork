// SPDX-License-Identifier: Apache-2.0
import type { Page } from "@playwright/test";

export async function sampleFrames(page: Page, selector: string, ms: number) {
  return page.evaluate(
    ({ selector, ms }) =>
      new Promise<
        { opacity: string; transform: string; height: string; overflow: number; left: number }[]
      >((resolve, reject) => {
        const element = document.querySelector(selector);
        if (!element) return reject(new Error(`Missing element: ${selector}`));
        const frames: {
          opacity: string;
          transform: string;
          height: string;
          overflow: number;
          left: number;
        }[] = [];
        const start = performance.now();
        const sample = () => {
          const current = document.querySelector(selector) ?? element;
          const style = getComputedStyle(current);
          frames.push({
            left: current.getBoundingClientRect().left,
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
          if (performance.now() - start < ms) requestAnimationFrame(sample);
          else resolve(frames);
        };
        requestAnimationFrame(sample);
      }),
    { selector, ms },
  );
}
