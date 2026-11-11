// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";

import { toast } from "sonner";
import { Toaster } from "./Sonner";
test("announces toast", async () => {
  render(<Toaster />);
  toast("Saved");
  expect(await screen.findByText("Saved")).toBeInTheDocument();
  expect(screen.getByText("Saved").closest("[aria-live]")).toBeInTheDocument();
});

test("tracks the document theme", async () => {
  const { container, unmount } = render(<Toaster />);
  try {
    document.documentElement.classList.add("dark");
    await waitFor(() =>
      expect(container.querySelector("[data-sonner-toaster]")).toHaveAttribute(
        "data-sonner-theme",
        "dark",
      ),
    );
    document.documentElement.classList.remove("dark");
    await waitFor(() =>
      expect(container.querySelector("[data-sonner-toaster]")).toHaveAttribute(
        "data-sonner-theme",
        "light",
      ),
    );
  } finally {
    document.documentElement.classList.remove("dark");
    unmount();
  }
});
