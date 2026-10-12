// SPDX-License-Identifier: Apache-2.0
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { hasUnresolvedHandoff, indexStints, type StintLogEntry } from "@stintwork/core";
import type { Hono } from "hono";
import type { ProjectFilesReader } from "./work-item-files.js";
import { ensureLocalIgnore } from "./stint-repo-writes.js";

export function addHandoffAnswerRoute(
  app: Hono,
  root: string,
  readProjectFiles: ProjectFilesReader,
  refresh: () => void,
) {
  app.post("/api/stints/:stintId/handoff-answer", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json({ reason: "Origin must match the project server." }, 403);
    if (
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json({ reason: "A JSON handoff answer is required." }, 400);
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ reason: "Invalid JSON." }, 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("note" in body) ||
      (body.note !== null && (typeof body.note !== "string" || !body.note.trim()))
    )
      return context.json({ reason: "Write a developer note, or use null to dismiss." }, 400);
    const note = typeof body.note === "string" ? body.note.trim() : null;
    try {
      const files = readProjectFiles().files;
      for (const path of files
        .list(".stintwork/local/stints/")
        .filter((path) => path.endsWith(".jsonl"))) {
        const text = files.read(path);
        if (text === undefined) continue;
        const indexed = indexStints({ list: () => [path], read: () => text });
        const stint = indexed.stints[0];
        if (stint?.id !== context.req.param("stintId")) continue;
        if (indexed.warnings.length) throw new Error("The stint log has invalid entries.");
        if (
          stint.status === "running" ||
          !stint.handoff ||
          !hasUnresolvedHandoff(stint.handoff.unresolved)
        )
          return context.json({ reason: "This stint has no unresolved handoff." }, 409);
        if (stint.handoffAnswer) {
          if (stint.handoffAnswer.note !== note)
            return context.json({ reason: "This handoff was already answered." }, 409);
          refresh();
          return context.json({ stintId: stint.id, answer: stint.handoffAnswer });
        }
        const entry: StintLogEntry = {
          type: "handoff_answered",
          at: new Date().toISOString(),
          note,
        };
        ensureLocalIgnore(root);
        appendFileSync(
          join(root, path),
          `${text.endsWith("\n") ? "" : "\n"}${JSON.stringify(entry)}\n`,
        );
        refresh();
        return context.json({ stintId: stint.id, answer: { at: entry.at, note } });
      }
      return context.json({ reason: "Stint not found." }, 404);
    } catch (error) {
      return context.json({ reason: error instanceof Error ? error.message : String(error) }, 503);
    }
  });
}
