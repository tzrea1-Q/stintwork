// SPDX-License-Identifier: Apache-2.0
import { render } from "@testing-library/react";
import { expect, test } from "vitest";

import { Skeleton } from "./Skeleton";
test("is decorative", () => {
  const { container } = render(<Skeleton />);
  expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
});
