// SPDX-License-Identifier: Apache-2.0
const scheme = window.matchMedia("(prefers-color-scheme: dark)");
const syncTheme = () => document.documentElement.classList.toggle("dark", scheme.matches);
syncTheme();
scheme.addEventListener("change", syncTheme);

export {};
