import type { AgentStintOptions } from "@stintwork/agents";
import type { Hono } from "hono";

type PermissionHandler = NonNullable<AgentStintOptions["onPermission"]>;
type PermissionRequest = Parameters<PermissionHandler>[0];
type PermissionResponse = Awaited<ReturnType<PermissionHandler>>;

/** Requests wait for a developer answer, even without a connected UI, until the stint ends. */
export function addStintPermissionRoute(app: Hono) {
  const pending = new Map<
    string,
    {
      stintId: string;
      request: PermissionRequest;
      answer: (response: PermissionResponse) => void;
    }
  >();
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
    const permission = pending.get(requestId);
    if (!permission || permission.stintId !== context.req.param("stintId"))
      return context.json({ reason: "This permission request is no longer pending." }, 409);
    const optionId = body.optionId;
    if (!permission.request.options.some((option) => option.optionId === optionId))
      return context.json({ reason: "Choose an offered permission option." }, 400);
    pending.delete(requestId);
    permission.answer({ outcome: { outcome: "selected", optionId } });
    return context.json({ requestId, optionId });
  });
  return {
    wait(stintId: string, request: PermissionRequest): Promise<PermissionResponse> {
      return new Promise((answer) => pending.set(request.requestId, { stintId, request, answer }));
    },
    clearRequest(requestId: string) {
      const permission = pending.get(requestId);
      pending.delete(requestId);
      permission?.answer({ outcome: { outcome: "cancelled" } });
    },
    clear(stintId?: string) {
      for (const [requestId, permission] of pending)
        if (stintId === undefined || permission.stintId === stintId) {
          pending.delete(requestId);
          permission.answer({ outcome: { outcome: "cancelled" } });
        }
    },
  };
}
