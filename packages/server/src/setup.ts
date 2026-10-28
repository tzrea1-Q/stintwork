// SPDX-License-Identifier: Apache-2.0
import {
  coreTextWire,
  errorText,
  coreText,
  CoreTextError,
  knownSkillLocation,
  loadWorkflows,
  planSetup,
  skillAvailability,
  type AgentSkillLocation,
  type RepoFiles,
  type SetupChange,
} from "@stintwork/core";

import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describeAgents, type AgentRegistry } from "@stintwork/agents";

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
  github?: () => { repository: string; repositoryId: string; error?: string } | undefined,
) {
  function guide() {
    const loaded = loadWorkflows(files);
    const plan = planSetup(files);
    const remote = plan.tracker === "github-issues" ? github?.() : undefined;
    if (remote?.repositoryId && !remote.error)
      plan.checks[0] = { id: "tracker", ready: true, status: "ready" };
    return {
      ...(remote
        ? {
            github: {
              repository: remote.repository,
              repositoryId: remote.repositoryId,
              ...(remote.error ? { error: remote.error } : {}),
            },
          }
        : {}),
      ...plan,
      warnings: [...plan.warnings, ...loaded.warnings],
      skills: skillAvailability(loaded.workflows, describeAgents(agents), (location) =>
        listAgentSkills(root, home, location),
      ),
    };
  }
  app.get("/api/setup", (context) => {
    context.header("Cache-Control", "no-store");
    return context.json(coreTextWire(guide()));
  });
  app.post("/api/setup", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.originMismatch" }) }),
        403,
      );
    if (
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json(coreTextWire({ reason: coreText({ code: "server.jsonSetup" }) }), 400);
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json(coreTextWire({ reason: coreText({ code: "server.invalidJson" }) }), 400);
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
      return context.json(coreTextWire({ reason: coreText({ code: "setup.confirmFiles" }) }), 400);
    try {
      const commit = await applySetup(root, files, body.changes as SetupChange[]);
      refresh();
      return context.json(coreTextWire({ commit, ...guide() }));
    } catch (error) {
      return context.json(
        coreTextWire({ reason: errorText(error) }),
        error instanceof SetupWriteRefusal
          ? 409
          : error instanceof Error &&
              error instanceof CoreTextError &&
              error.coreText.code === "setup.distinctFiles"
            ? 400
            : 503,
      );
    }
  });
}
