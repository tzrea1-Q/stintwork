// SPDX-License-Identifier: Apache-2.0
import {
  coreTextWire,
  errorText,
  coreText,
  CoreTextError,
  hasUnresolvedHandoff,
  indexStints,
  type StintLogEntry,
} from "@stintwork/core";

import { appendFileSync } from "node:fs";
import { join } from "node:path";

import type { Hono } from "hono";
import type { ProjectFilesReader } from "./work-item-files.js";
import { saveWorkItemReview } from "./review-writes.js";
import { resolveProjectSnapshot } from "./project-snapshot.js";
import type { ProjectSnapshot } from "@stintwork/core";
import { ensureLocalIgnore } from "./stint-repo-writes.js";

export function addHandoffAnswerRoute(
  app: Hono,
  root: string,
  readProjectFiles: ProjectFilesReader,
  refresh: () => void,
  isActive: (slug: string) => boolean,
  writing: Set<string>,
  getSnapshot: () => ProjectSnapshot,
) {
  app.post("/api/stints/:stintId/resolve-handoff", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.originMismatch" }) }),
        403,
      );
    const project = readProjectFiles();
    const snapshot = resolveProjectSnapshot(project, getSnapshot);
    const item = snapshot.workItems.find((entry) =>
      entry.stints.some((stint) => stint.id === context.req.param("stintId")),
    );
    if (!item)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.stintNotFound" }) }),
        404,
      );
    const stint = item.stints.find((entry) => entry.id === context.req.param("stintId"));
    if (!stint)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.stintNotFound" }) }),
        404,
      );
    const previous = item.reviewDecisions?.find(
      (entry) => entry.kind === "handoff-unresolved" && entry.id === stint.id,
    );
    if (previous) return context.json(coreTextWire({ decision: previous }));
    if (
      stint.status === "running" ||
      !stint.handoff ||
      !hasUnresolvedHandoff(stint.handoff.unresolved)
    )
      return context.json(
        coreTextWire({ reason: coreText({ code: "handoff.noneUnresolved" }) }),
        409,
      );
    if (item.activeStint || isActive(item.slug) || writing.has(item.slug))
      return context.json(coreTextWire({ reason: coreText({ code: "memory.activeWrite" }) }), 409);
    if (snapshot.warnings.some(({ path }) => path === `.scratch/${item.slug}/review.yaml`))
      return context.json(
        coreTextWire({ reason: coreText({ code: "memory.validReviewRequired" }) }),
        409,
      );
    const worktree = project.worktreePaths.get(item.slug);
    if (!worktree)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.worktreeUnavailable" }) }),
        409,
      );
    writing.add(item.slug);
    try {
      const decision = {
        id: stint.id,
        kind: "handoff-unresolved" as const,
        status: "resolved" as const,
        reason: "",
        by: "Developer",
        at: new Date().toISOString(),
      };
      const commit = await saveWorkItemReview(worktree, item.slug, decision);
      refresh();
      return context.json(coreTextWire({ decision, commit }));
    } catch (error) {
      refresh();
      return context.json(coreTextWire({ reason: errorText(error, true) }), 409);
    } finally {
      writing.delete(item.slug);
    }
  });
  app.post("/api/stints/:stintId/handoff-answer", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.originMismatch" }) }),
        403,
      );
    if (
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json(coreTextWire({ reason: coreText({ code: "server.jsonHandoff" }) }), 400);
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json(coreTextWire({ reason: coreText({ code: "server.invalidJson" }) }), 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("note" in body) ||
      (body.note !== null && (typeof body.note !== "string" || !body.note.trim()))
    )
      return context.json(coreTextWire({ reason: coreText({ code: "handoff.writeNote" }) }), 400);
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
        if (indexed.warnings.length) throw new CoreTextError({ code: "stint.invalidLog" });
        if (
          stint.status === "running" ||
          !stint.handoff ||
          !hasUnresolvedHandoff(stint.handoff.unresolved)
        )
          return context.json(
            coreTextWire({ reason: coreText({ code: "handoff.noneUnresolved" }) }),
            409,
          );
        if (stint.handoffAnswer) {
          if (stint.handoffAnswer.note !== note)
            return context.json(
              coreTextWire({ reason: coreText({ code: "handoff.alreadyAnswered" }) }),
              409,
            );
          refresh();
          return context.json(coreTextWire({ stintId: stint.id, answer: stint.handoffAnswer }));
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
        return context.json(coreTextWire({ stintId: stint.id, answer: { at: entry.at, note } }));
      }
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.stintNotFound" }) }),
        404,
      );
    } catch (error) {
      return context.json(coreTextWire({ reason: errorText(error) }), 503);
    }
  });
}
