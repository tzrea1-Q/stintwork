import type { AgentStintOptions } from "@stintwork/agents";
import type { Hono } from "hono";

type PermissionHandler = NonNullable<AgentStintOptions["onPermission"]>;
type PermissionRequest = Parameters<PermissionHandler>[0];
type PermissionResponse = Awaited<ReturnType<PermissionHandler>>;

class PermissionAnswerError extends Error {
  readonly status = 409;
}

/** Requests wait for a developer answer, even without a connected UI, until the stint ends. */
export function addStintPermissionRoute(app: Hono) {
  const pending = new Map<
    string,
    {
      stintId: string;
      request: PermissionRequest;
      answer: (response: PermissionResponse) => void;
      answering: boolean;
      completion: Promise<void>;
      cancel: (error: Error) => void;
    }
  >();
  const unavailable = new Map<string, string>();
  const endedStints = new Set<string>();
  let closed = false;
  const key = (stintId: string, requestId: string) => `${stintId}/${requestId}`;
  app.post("/api/stints/:stintId/permissions/:requestId", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json({ reason: "Origin must match the project server." }, 403);
    if (
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json({ reason: "A JSON permission answer is required." }, 400);
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ reason: "Invalid JSON." }, 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("optionId" in body) ||
      typeof body.optionId !== "string"
    )
      return context.json({ reason: "Choose an offered permission option." }, 400);
    const requestId = context.req.param("requestId");
    const stintId = context.req.param("stintId");
    const requestKey = key(stintId, requestId);
    const permission = pending.get(requestKey);
    if (!permission)
      return context.json(
        {
          reason:
            unavailable.get(requestKey) ??
            (closed || endedStints.has(stintId)
              ? "This permission request's stint has ended."
              : "This permission request is no longer pending."),
        },
        409,
      );
    if (permission.answering)
      return context.json({ reason: "This permission request is already being answered." }, 409);
    const optionId = body.optionId;
    if (!permission.request.options.some((option) => option.optionId === optionId))
      return context.json({ reason: "Choose an offered permission option." }, 400);
    permission.answering = true;
    permission.answer({ outcome: { outcome: "selected", optionId } });
    try {
      await permission.completion;
    } catch (error) {
      return context.json(
        { reason: error instanceof Error ? error.message : String(error) },
        error instanceof PermissionAnswerError ? error.status : 503,
      );
    }
    return context.json({ requestId, optionId });
  });
  return {
    wait(stintId: string, request: PermissionRequest): Promise<PermissionResponse> {
      if (closed || endedStints.has(stintId))
        return Promise.resolve({ outcome: { outcome: "cancelled" } });
      const requestKey = key(stintId, request.requestId);
      if (pending.has(requestKey) || unavailable.has(requestKey))
        throw new Error("This permission request was already registered.");
      if (!request.forwarded)
        throw new Error("The agent did not provide a permission delivery receipt.");
      return new Promise((answer) => {
        let cancel: (error: Error) => void = () => {};
        const cancelled = new Promise<never>((_resolve, reject) => {
          cancel = reject;
        });
        const completion = Promise.race([request.forwarded, cancelled]);
        pending.set(requestKey, { stintId, request, answer, answering: false, completion, cancel });
        void completion.then(
          () => {
            pending.delete(requestKey);
            if (!unavailable.has(requestKey))
              unavailable.set(requestKey, "This permission request was already answered.");
          },
          (error: unknown) => {
            pending.delete(requestKey);
            if (!unavailable.has(requestKey))
              unavailable.set(
                requestKey,
                `This permission request could not be forwarded: ${error instanceof Error ? error.message : String(error)}`,
              );
            answer({ outcome: { outcome: "cancelled" } });
          },
        );
      });
    },
    clear(stintId?: string, ending = true) {
      if (stintId === undefined) closed = true;
      else if (ending) endedStints.add(stintId);
      for (const [requestKey, permission] of pending)
        if (stintId === undefined || permission.stintId === stintId) {
          pending.delete(requestKey);
          const reason = "This permission request's stint has ended.";
          unavailable.set(requestKey, reason);
          permission.cancel(new PermissionAnswerError(reason));
          permission.answer({ outcome: { outcome: "cancelled" } });
        }
    },
  };
}
