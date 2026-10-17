// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releasedProfile } from "../packages/agents/src/adapter-cache.js";
import {
  adapterProfilesDirectory,
  profileManifest,
  profileName,
  type AdapterHost,
} from "../packages/agents/src/adapter-profiles.js";
import { isolatedNpmArgs, isolatedNpmEnvironment, runNpm } from "../packages/agents/src/npm.js";

export async function generateAgentLocks(
  profilesDirectory = adapterProfilesDirectory(),
  env: NodeJS.ProcessEnv = process.env,
  manifestsOnly = false,
) {
  const temporary = await mkdtemp(join(tmpdir(), "stintwork-release-locks-"));
  try {
    for (const agent of ["claude", "codex"] as const) {
      const profiles: { source: "installed" | "bundled"; host: AdapterHost }[] = [];
      for (const os of ["darwin", "linux", "win32"]) {
        for (const arch of ["arm64", "x64"]) {
          for (const libc of os === "linux" && agent === "claude"
            ? ["glibc-2.31", "musl"]
            : ["none"]) {
            const host = { os, arch, libc, node: "22", abi: "127" };
            if (!profiles.length) profiles.push({ source: "installed", host });
            profiles.push({ source: "bundled", host });
          }
        }
      }
      for (const { source, host } of profiles) {
        const name = profileName(agent, source, host);
        const destination = join(profilesDirectory, name);
        const manifest = `${JSON.stringify(profileManifest(agent, source, host), null, 2)}\n`;
        await mkdir(destination, { recursive: true });
        await writeFile(join(destination, "package.json"), manifest);
        if (manifestsOnly) continue;
        const stage = join(temporary, name);
        await mkdir(stage, { recursive: true });
        await writeFile(join(stage, "package.json"), manifest);
        await writeFile(join(stage, ".npmrc"), "");
        await writeFile(join(stage, ".global-npmrc"), "");
        // Lock-only accepts foreign OS/CPU packages; runtime ci never uses --force.
        await runNpm(
          [
            "install",
            "--package-lock-only",
            "--force",
            ...isolatedNpmArgs(stage, join(temporary, "npm-cache")),
          ],
          {
            cwd: stage,
            env: isolatedNpmEnvironment(env),
            timeout: 300_000,
          },
        );
        const validated = await releasedProfile(
          { agent, cwd: stage, profilesDirectory: temporary },
          source,
          host,
        );
        await writeFile(join(destination, "package-lock.json"), validated.lockBytes);
        console.log(`Generated ${name}/package-lock.json; review and commit before release.`);
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateAgentLocks(
    adapterProfilesDirectory(),
    process.env,
    process.argv.includes("--manifests-only"),
  );
}
