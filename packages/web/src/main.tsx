// SPDX-License-Identifier: Apache-2.0
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("The page is missing its root element.");
}
createRoot(root).render(<App />);
