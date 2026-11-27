// SPDX-License-Identifier: Apache-2.0
export type ThemeChoice = "system" | "light" | "dark";
export type MotionChoice = "system" | "full" | "reduced";
export const themeStorageKey = "stintwork.theme";
export const motionStorageKey = "stintwork.motion";

function read<T extends string>(key: string, choices: readonly T[]): T {
  try {
    const value = typeof window === "undefined" ? null : window.localStorage.getItem(key);
    if (value && choices.includes(value as T)) return value as T;
  } catch {}
  return "system" as T;
}
const themes = ["system", "light", "dark"] as const;
const motions = ["system", "full", "reduced"] as const;
let theme = read(themeStorageKey, themes);
let motion = read(motionStorageKey, motions);
const scheme =
  typeof window === "undefined" ? undefined : window.matchMedia?.("(prefers-color-scheme: dark)");
const motionMedia =
  typeof window === "undefined"
    ? undefined
    : window.matchMedia?.("(prefers-reduced-motion: reduce)");
const listeners = new Set<() => void>();
export const subscribeAppearance = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getTheme = () => theme;
export const getMotion = () => motion;
export const getReducedMotion = () =>
  motion === "reduced" || (motion === "system" && !!motionMedia?.matches);
function sync() {
  if (typeof window === "undefined") return;
  document.documentElement.classList.toggle(
    "dark",
    theme === "dark" || (theme === "system" && !!scheme?.matches),
  );
  document.documentElement.dataset.motion = getReducedMotion() ? "reduced" : "full";
  listeners.forEach((listener) => {
    listener();
  });
}
function persist(key: string, value: string) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {}
}
export function setTheme(choice: ThemeChoice) {
  theme = choice;
  persist(themeStorageKey, choice);
  sync();
}
export function setMotion(choice: MotionChoice) {
  motion = choice;
  persist(motionStorageKey, choice);
  sync();
}
scheme?.addEventListener("change", sync);
motionMedia?.addEventListener("change", sync);
sync();
