// SPDX-License-Identifier: Apache-2.0
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    value() {
      this.setAttribute("open", "");
    },
    configurable: true,
  },
  close: {
    value() {
      this.removeAttribute("open");
    },
    configurable: true,
  },
});
Object.defineProperty(Element.prototype, "scrollIntoView", { value() {}, configurable: true });
Object.defineProperty(Element.prototype, "hasPointerCapture", {
  value() {
    return false;
  },
  configurable: true,
});
Object.defineProperty(globalThis, "ResizeObserver", {
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  configurable: true,
});
