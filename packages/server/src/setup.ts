// SPDX-License-Identifier: Apache-2.0
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describeAgents, type AgentRegistry } from "@stintwork/agents";
import {
  knownSkillLocation,
  loadWorkflows,
  planSetup,
  skillAvailability,
  type AgentSkillLocation,
  type RepoFiles,
  type SetupChange,
} from "@stintwork/core";
import type { Hono } from "hono";
import { applySetup, SetupWriteRefusal } from "./setup-writes.js";

export function listAgentSkills(
  root: string,
  home: string,
  location: AgentSkillLocation,
): string[] | null {
  if (!knownSkillLocation(location)) return null;
  const directory = join(location.base === "home" ? home : root, location.path);
  try {
    const paths: string[] = [];
    for (const name of readdirSync(directory)) {
      const path = location.kind === "skills" ? `${name}/SKILL.md` : name;
      try {
        if (statSync(join(directory, path)).isFile()) paths.push(path);
      } catch (error) {
        if (
          !(
            error &&
            typeof error === "object" &&
            "code" in error &&
            ["ENOENT", "ENOTDIR"].includes(String(error.code))
          )
        )
          return null;
      }
    }
    return paths;
  } catch (error) {
    return error && typeof error === "object" && "code" in error && error.code === "ENOENT"
      ? []
      : null;
  }
}

export function addSetupRoutes(
  app: Hono,
  root: string,
  files: RepoFiles,
  agents: AgentRegistry,
  refresh: () => void,
  home = homedir(),
) {
  function guide() {
    const loaded = loadWorkflows(files);
    const plan = planSetup(files);
    return {
      ...plan,
      warnings: [...plan.warnings, ...loaded.warnings],
      skills: skillAvailability(loaded.workflows, describeAgents(agents), (location) =>
        listAgentSkills(root, home, location),
      ),
    };
  }
  app.get("/api/setup", (context) => {
    context.header("Cache-Control", "no-store");
    return context.json(guide());
  });
  app.post("/api/setup", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json({ reason: "Origin must match the project server." }, 403);
    if (
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json({ reason: "A JSON setup selection is required." }, 400);
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ reason: "Invalid JSON." }, 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("confirmed" in body) ||
      body.confirmed !== true ||
      !("changes" in body) ||
      !Array.isArray(body.changes) ||
      !body.changes.length ||
      body.changes.some(
        (change) =>
          !change ||
          typeof change !== "object" ||
          typeof change.path !== "string" ||
          !(change.before === null || typeof change.before === "string") ||
          typeof change.content !== "string",
      )
    )
      return context.json({ reason: "Confirm a selection of proposed setup files." }, 400);
    try {
      const commit = await applySetup(root, files, body.changes as SetupChange[]);
      refresh();
      return context.json({ commit, ...guide() });
    } catch (error) {
      return context.json(
        { reason: error instanceof Error ? error.message : String(error) },
        error instanceof SetupWriteRefusal
          ? 409
          : error instanceof Error && error.message === "Select distinct proposed setup files."
            ? 400
            : 503,
      );
    }
  });
}
