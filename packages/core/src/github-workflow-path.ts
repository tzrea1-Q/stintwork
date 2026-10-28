// SPDX-License-Identifier: Apache-2.0
export function githubWorkflowPath(path: string): RegExpExecArray | null {
  const match =
    /^\.stintwork\/github\/([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)\/([a-z0-9_.-]{1,100})\/([1-9]\d*)\/workflow\.yaml$/.exec(
      path,
    );
  return match && match[2] !== "." && match[2] !== ".." && Number.isSafeInteger(Number(match[3]))
    ? match
    : null;
}
