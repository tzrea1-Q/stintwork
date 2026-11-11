// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { toast } from "sonner";
import { Toaster } from "./Sonner";
test("announces toast", async () => {
  render(<Toaster />);
  toast("Saved");
  expect(await screen.findByText("Saved")).toBeInTheDocument();
  expect(screen.getByText("Saved").closest("[aria-live]")).toBeInTheDocument();
});
