// SPDX-License-Identifier: Apache-2.0
let keyboard = false;
let input = false;
if (typeof window !== "undefined") {
  window.addEventListener(
    "keydown",
    () => {
      input = true;
      keyboard = true;
    },
    true,
  );
  window.addEventListener(
    "pointerdown",
    () => {
      input = true;
      keyboard = false;
    },
    true,
  );
}
export const isKeyboardInput = () => keyboard;
export const hadUserInput = () => input;
