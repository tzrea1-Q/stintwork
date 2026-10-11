// SPDX-License-Identifier: Apache-2.0
export const usage = `Usage: stintwork [options]

Opens Stintwork for the Git repository that contains the current directory.

Options:
  --no-open      Start the server without opening the browser
  -h, --help     Show this help and exit
  -v, --version  Show the version and exit
`;

export type CliAction =
  | { action: "help" }
  | { action: "version" }
  | { action: "unknown-option"; option: string }
  | { action: "start"; open: boolean };

const options = new Set(["--no-open", "--help", "-h", "--version", "-v"]);

export function parseCliArguments(args: readonly string[]): CliAction {
  const unknown = args.find((argument) => !options.has(argument));
  if (unknown !== undefined) {
    return { action: "unknown-option", option: unknown };
  }
  if (args.some((argument) => argument === "--help" || argument === "-h")) {
    return { action: "help" };
  }
  if (args.some((argument) => argument === "--version" || argument === "-v")) {
    return { action: "version" };
  }
  return { action: "start", open: !args.includes("--no-open") };
}
