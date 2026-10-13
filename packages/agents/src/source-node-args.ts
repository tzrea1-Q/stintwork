// SPDX-License-Identifier: Apache-2.0
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export function sourceNodeArgs(...args: string[]): string[] {
  return [
    "--conditions=development",
    "--import",
    pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href,
    ...args,
  ];
}
