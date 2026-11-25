// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { shortHash, shortStintId } from "./short-id";

test("shortens stint ids and hashes", () => {
  expect(shortStintId("1234567890")).toBe("12345678");
  expect(shortHash("abcdef12345")).toBe("abcdef1");
  expect(shortStintId("abc")).toBe("abc");
  expect(shortHash("abc")).toBe("abc");
});
