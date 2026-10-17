// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CachedAgent } from "./executable.js";

export const adapterPins = {
  claude: {
    adapter: "@agentclientprotocol/claude-agent-acp",
    version: "0.88.0",
    dependency: "@anthropic-ai/claude-agent-sdk",
    dependencyVersion: "0.3.293",
    cliVersion: "2.1.293",
  },
  codex: {
    adapter: "@agentclientprotocol/codex-acp",
    version: "2.1.1",
    dependency: "@openai/codex",
    dependencyVersion: "0.159.3",
    cliVersion: "0.159.3",
  },
} as const;

export type AdapterHost = { os: string; arch: string; libc: string; node: string; abi: string };

export function adapterHost(): AdapterHost {
  const report = process.platform === "linux" ? process.report.getReport() : undefined;
  const header = (report as { header?: { glibcVersionRuntime?: string } } | undefined)?.header;
  return {
    os: process.platform,
    arch: process.arch,
    libc: !report
      ? "none"
      : header?.glibcVersionRuntime
        ? `glibc-${header.glibcVersionRuntime}`
        : (report as { sharedObjects?: string[] }).sharedObjects?.some((path) =>
              /(?:ld-musl|libc\.musl)/.test(path),
            )
          ? "musl"
          : "unknown",
    node: process.versions.node.split(".")[0],
    abi: process.versions.modules,
  };
}

export function nativePackage(agent: CachedAgent, host: AdapterHost) {
  if (!["darwin", "linux", "win32"].includes(host.os) || !["arm64", "x64"].includes(host.arch))
    throw new Error(
      `Unsupported bundled platform: ${host.os}-${host.arch}. Use a compatible installed CLI.`,
    );
  if (agent === "claude" && host.os === "linux" && !/^(glibc-|musl$)/.test(host.libc))
    throw new Error(
      "Cannot select bundled Claude for unknown Linux libc. Use a compatible installed CLI.",
    );
  const suffix = `${host.os}-${host.arch}${agent === "claude" && host.libc === "musl" ? "-musl" : ""}`;
  return agent === "claude"
    ? { name: `@anthropic-ai/claude-agent-sdk-${suffix}`, version: "0.3.293", suffix }
    : { name: `@openai/codex-${suffix}`, version: `npm:@openai/codex@0.159.3-${suffix}`, suffix };
}

export function profileName(
  agent: CachedAgent,
  source: "installed" | "bundled",
  host: AdapterHost,
) {
  return `${agent}/${source === "installed" ? source : `bundled-${nativePackage(agent, host).suffix}`}`;
}

export function profileManifest(
  agent: CachedAgent,
  source: "installed" | "bundled",
  host: AdapterHost,
) {
  const pin = adapterPins[agent];
  const native = source === "bundled" ? nativePackage(agent, host) : undefined;
  return {
    name: `stintwork-${agent}-${source}${native ? `-${native.suffix}` : ""}`,
    private: true,
    type: "module",
    dependencies: {
      [pin.adapter]: pin.version,
      [pin.dependency]: pin.dependencyVersion,
      ...(native ? { [native.name]: native.version } : {}),
    },
    overrides: { [pin.dependency]: pin.dependencyVersion },
  };
}

export function adapterProfilesDirectory(): string {
  const packed = new URL("./agent-profiles/", import.meta.url);
  return fileURLToPath(existsSync(packed) ? packed : new URL("../profiles/", import.meta.url));
}
