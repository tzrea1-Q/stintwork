// SPDX-License-Identifier: Apache-2.0
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { fakeGh } from "./fake-gh.js";

test("a killed lock holder does not block the next invocation", async () => {
  const root = mkdtempSync(join(tmpdir(), "fake-gh-"));
  const marker = join(root, "held");
  const gh = await fakeGh(
    root,
    `fs.writeFileSync(${JSON.stringify(marker)}, ''); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000);`,
  );
  await gh.script({ "api test": [{ stdout: "first" }, { stdout: "second" }] });
  const holder = spawn(join(root, "gh"), ["api", "test"]);
  const exited = once(holder, "exit");
  try {
    const deadline = Date.now() + 5000;
    while (!existsSync(marker) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(existsSync(marker)).toBe(true);
    holder.kill("SIGKILL");
    await exited;
    // A single reply avoids pausing the second process in beforePublish.
    await gh.script({ "api test": { stdout: "recovered" } });
    const result = await promisify(execFile)(join(root, "gh"), ["api", "test"], {
      timeout: 5000,
    });
    expect(result.stdout).toBe("recovered");
  } finally {
    holder.kill("SIGKILL");
    await exited;
    rmSync(root, { recursive: true, force: true });
  }
});
