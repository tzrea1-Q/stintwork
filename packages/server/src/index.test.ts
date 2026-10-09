import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createProjectServer } from "./index.js";

test("server serves the page and project health over HTTP", async () => {
  const webRoot = await mkdtemp(join(tmpdir(), "stintwork-web-"));
  await writeFile(join(webRoot, "index.html"), "<!doctype html><title>Stintwork</title>");
  await writeFile(join(webRoot, "app.js"), "console.log('Stintwork');");
  const server = createProjectServer(join(webRoot, "example-project"), webRoot);

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP address");
    }
    const url = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${url}/api/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, repo: "example-project" });
    const page = await fetch(url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<title>Stintwork</title>");
    const asset = await fetch(`${url}/app.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toContain("Stintwork");
    expect((await fetch(`${url}/api/missing`)).status).toBe(404);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await rm(webRoot, { recursive: true, force: true });
  }
});

test("server reports a missing web build clearly", () => {
  expect(() => createProjectServer("/example-project", "/missing-stintwork-web-build")).toThrow(
    "Run pnpm build",
  );
});
