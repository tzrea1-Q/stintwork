// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPermissionLevel, updateProjectPermissionLevel } from "@stintwork/core";
import type { Hono } from "hono";

export function addProjectPermissionRoute(app: Hono, root: string, refresh: () => void) {
  app.post("/api/project/permission-level", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json({ reason: "Origin must match the project server." }, 403);
    if (
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json({ reason: "A JSON permission level is required." }, 400);
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ reason: "Invalid JSON." }, 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("permissionLevel" in body) ||
      !isPermissionLevel(body.permissionLevel)
    )
      return context.json({ reason: "Choose Ask, Edit freely or Autonomous." }, 400);
    const directory = join(root, ".stintwork");
    const path = join(directory, "config");
    const temporary = join(directory, `.config-${randomUUID()}`);
    try {
      const parent = lstatSync(directory, { throwIfNoEntry: false });
      if (parent && (!parent.isDirectory() || parent.isSymbolicLink()))
        throw new Error(".stintwork must be a real directory.");
      if (!parent) mkdirSync(directory);
      const stat = lstatSync(path, { throwIfNoEntry: false });
      if (stat && (!stat.isFile() || stat.isSymbolicLink()))
        throw new Error(".stintwork/config must be a regular file.");
      const text = updateProjectPermissionLevel(
        stat ? readFileSync(path, "utf8") : undefined,
        body.permissionLevel,
      );
      writeFileSync(temporary, text, { flag: "wx", mode: stat ? stat.mode & 0o777 : 0o600 });
      renameSync(temporary, path);
      refresh();
      return context.json({ permissionLevel: body.permissionLevel });
    } catch (error) {
      return context.json({ reason: error instanceof Error ? error.message : String(error) }, 503);
    } finally {
      rmSync(temporary, { force: true });
    }
  });
}
