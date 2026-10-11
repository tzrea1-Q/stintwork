// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";

export function findGitRoot(directory = process.cwd()): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Git is required to open a project. Install Git and try again.", { cause });
    }
    throw new Error(`Not inside a Git repository: ${directory}`, { cause });
  }
}
