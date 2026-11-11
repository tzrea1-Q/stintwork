// SPDX-License-Identifier: Apache-2.0
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Toaster } from "./ui/Sonner";
import "./style.css";
import "./system-theme";

const root = document.getElementById("root");
if (!root) {
  throw new Error("The page is missing its root element.");
}
createRoot(root).render(
  <>
    <App />
    <Toaster position="bottom-center" offset={16} mobileOffset={16} />
  </>,
);
