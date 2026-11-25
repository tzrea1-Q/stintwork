// SPDX-License-Identifier: Apache-2.0
import { expect, type Locator } from "@playwright/test";

export async function expectNoFocusRing(element: Locator) {
  const style = await element.evaluate((node) => {
    const computed = getComputedStyle(node);
    return { shadow: computed.boxShadow, outline: computed.outlineStyle };
  });
  const transparent =
    /^(?:rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*0(?:\.0+)?\s*\)|transparent)(?=\s|$)/i;
  expect(style.outline).toBe("none");
  expect(
    style.shadow === "none" ||
      style.shadow.split(/,(?![^()]*\))/).every((layer) => transparent.test(layer.trim())),
    style.shadow,
  ).toBe(true);
}

export async function expectNoAddedFocusRing(element: Locator) {
  const styles = await element.evaluate((node) => {
    if (!(node instanceof HTMLElement) || document.activeElement !== node)
      throw new Error("Expected a focused element");
    const focused = getComputedStyle(node).boxShadow;
    node.blur();
    const unfocused = getComputedStyle(node).boxShadow;
    node.focus({ preventScroll: true, focusVisible: false });
    return { focused, unfocused };
  });
  expect(styles.focused).toBe(styles.unfocused);
  await expect(element).toBeFocused();
  await expect(element).toHaveCSS("outline-style", "none");
}
