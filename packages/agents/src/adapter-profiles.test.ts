// SPDX-License-Identifier: Apache-2.0
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { releasedProfile } from "./adapter-cache.js";
import { adapterHost, adapterProfilesDirectory } from "./adapter-profiles.js";

const profilesDirectory = adapterProfilesDirectory();
for (const agent of ["claude", "codex"] as const) {
  for (const profile of readdirSync(join(profilesDirectory, agent))) {
    const [source, os, arch, libc] = profile.split("-");
    if (source !== "installed" && source !== "bundled")
      throw new Error(`Unknown released profile: ${profile}`);
    test.skipIf(!existsSync(join(profilesDirectory, agent, profile, "package-lock.json")))(
      `released ${agent}/${profile} lock passes the runtime validator`,
      async () => {
        const host =
          source === "installed"
            ? adapterHost()
            : { ...adapterHost(), os, arch, libc: libc === "musl" ? "musl" : "glibc-2.31" };
        await releasedProfile({ agent, cwd: process.cwd(), profilesDirectory }, source, host);
      },
    );
  }
}
