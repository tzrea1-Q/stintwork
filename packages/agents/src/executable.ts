// SPDX-License-Identifier: Apache-2.0
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, resolve } from "node:path";

export function findExecutable(command: string, env: NodeJS.ProcessEnv): string | undefined {
  const candidates = isAbsolute(command)
    ? [command]
    : command.includes("/")
      ? [resolve(command)]
      : (env.PATH ?? "").split(delimiter).map((directory) => resolve(directory, command));
  return candidates.find((path) => {
    try {
      accessSync(path, constants.X_OK);
      return statSync(path).isFile();
    } catch {
      return false;
    }
  });
}
