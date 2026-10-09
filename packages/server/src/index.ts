import { accessSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAdaptorServer } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Health } from "@stintwork/core";
import { Hono } from "hono";

export function createProjectServer(
  repoRoot: string,
  webRoot = fileURLToPath(new URL("../../web/dist/", import.meta.url)),
) {
  try {
    accessSync(join(webRoot, "index.html"));
  } catch (cause) {
    throw new Error("Built web app not found. Run pnpm build before starting Stintwork.", {
      cause,
    });
  }

  const app = new Hono();
  const health: Health = { ok: true, repo: basename(repoRoot) };
  app.get("/api/health", (context) => context.json(health));
  app.use("/*", serveStatic({ root: webRoot }));

  return createAdaptorServer({ fetch: app.fetch });
}
