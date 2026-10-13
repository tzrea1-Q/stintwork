// SPDX-License-Identifier: Apache-2.0
import {
  coreTextWire,
  errorText,
  coreText,
  CoreTextError,
  isPermissionLevel,
  updateProjectPermissionLevel,
} from "@stintwork/core";

import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Hono } from "hono";

export function addProjectPermissionRoute(app: Hono, root: string, refresh: () => void) {
  app.post("/api/project/permission-level", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.originMismatch" }) }),
        403,
      );
    if (
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.jsonPermissionLevel" }) }),
        400,
      );
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json(coreTextWire({ reason: coreText({ code: "server.invalidJson" }) }), 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("permissionLevel" in body) ||
      !isPermissionLevel(body.permissionLevel)
    )
      return context.json(
        coreTextWire({ reason: coreText({ code: "permission.chooseLevel" }) }),
        400,
      );
    const directory = join(root, ".stintwork");
    const path = join(directory, "config");
    const temporary = join(directory, `.config-${randomUUID()}`);
    try {
      const parent = lstatSync(directory, { throwIfNoEntry: false });
      if (parent && (!parent.isDirectory() || parent.isSymbolicLink()))
        throw new CoreTextError({ code: "server.projectDirectory" });
      if (!parent) mkdirSync(directory);
      const stat = lstatSync(path, { throwIfNoEntry: false });
      if (stat && (!stat.isFile() || stat.isSymbolicLink()))
        throw new CoreTextError({ code: "server.configRegular" });
      const text = updateProjectPermissionLevel(
        stat ? readFileSync(path, "utf8") : undefined,
        body.permissionLevel,
      );
      writeFileSync(temporary, text, { flag: "wx", mode: stat ? stat.mode & 0o777 : 0o600 });
      renameSync(temporary, path);
      refresh();
      return context.json(coreTextWire({ permissionLevel: body.permissionLevel }));
    } catch (error) {
      return context.json(coreTextWire({ reason: errorText(error) }), 503);
    } finally {
      rmSync(temporary, { force: true });
    }
  });
}
