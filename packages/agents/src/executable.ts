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

export type CachedAgent = "claude" | "codex";
export type InstalledCliPair = {
  agent: CachedAgent;
  adapterVersion: string;
  cliVersion: string;
  result: "compatible" | "incompatible";
  evidence: string;
};

export const installedCliPairs: readonly InstalledCliPair[] = [
  {
    agent: "claude",
    adapterVersion: "0.88.0",
    cliVersion: "2.1.293",
    result: "compatible",
    evidence:
      "2026-10-17T09-10-49-274Z-claude, bundled, darwin-arm64, Node 22.22.3, all scenarios pass",
  },
  {
    agent: "claude",
    adapterVersion: "0.88.0",
    cliVersion: "2.1.295",
    result: "compatible",
    evidence: "2026-10-17T09-02-55-717Z-claude, darwin-arm64, Node 22.22.3, all scenarios pass",
  },
  {
    agent: "codex",
    adapterVersion: "2.1.1",
    cliVersion: "0.159.3",
    result: "compatible",
    evidence:
      "2026-10-17T09-11-57-214Z-codex + 2026-10-17T09-26-30-255Z-codex (Ask permission), bundled, darwin-arm64, Node 22.22.3, all scenarios pass",
  },
  {
    agent: "codex",
    adapterVersion: "2.1.1",
    cliVersion: "0.163.0",
    result: "compatible",
    evidence:
      "2026-10-17T09-30-46-164Z-codex, installed, darwin-arm64, Node 22.22.3, all Ask scenarios pass",
  },
];

const adapterVersions: Record<CachedAgent, string> = { claude: "0.88.0", codex: "2.1.1" };

function parseCliVersion(version: string): number[] | undefined {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.exec(
      version,
    );
  const parts = match?.slice(1, 4).map(Number);
  return parts?.every(Number.isSafeInteger) ? parts : undefined;
}

function compareCliVersions(left: number[], right: number[]): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

export function selectAgentSource(
  agent: CachedAgent,
  detected: { path: string; version?: string } | undefined,
  pairs: readonly InstalledCliPair[] = installedCliPairs,
): {
  source: "installed" | "bundled";
  reason: "compatible" | "missing" | "below-tested-range" | "unparseable" | "incompatible";
} {
  if (!detected?.path || !detected.version) return { source: "bundled", reason: "missing" };
  const version = parseCliVersion(detected.version);
  if (!version) return { source: "bundled", reason: "unparseable" };
  let floor: number[] | undefined;
  for (const pair of pairs) {
    if (
      pair.agent !== agent ||
      pair.adapterVersion !== adapterVersions[agent] ||
      !pair.evidence.trim()
    )
      continue;
    const point = parseCliVersion(pair.cliVersion);
    if (!point) continue;
    if (pair.result === "incompatible" && compareCliVersions(version, point) === 0) {
      return { source: "bundled", reason: "incompatible" };
    }
    if (pair.result === "compatible" && (!floor || compareCliVersions(point, floor) < 0))
      floor = point;
  }
  if (!floor || compareCliVersions(version, floor) < 0)
    return { source: "bundled", reason: "below-tested-range" };
  if (version[0] !== floor[0]) return { source: "bundled", reason: "incompatible" };
  return { source: "installed", reason: "compatible" };
}
