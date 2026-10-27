// SPDX-License-Identifier: Apache-2.0
import type { Stint, StintEvent } from "./stints.js";

export function pendingStintPermissions(stint: Stint) {
  const requests = new Map<
    string,
    Extract<StintEvent, { type: "permission_request" }> & { answering?: boolean }
  >();
  if (
    stint.status !== "running" ||
    ["suspending", "suspended", "fallback"].includes(stint.recovery?.state ?? "")
  )
    return [];
  for (const event of stint.events) {
    if (
      event.type === "permission_request" &&
      !event.automatic &&
      !(stint.recovery?.stopRequestedAt && event.binding === "reconnecting")
    )
      requests.set(event.logicalRequestId ?? event.requestId, event);
    if (event.type === "permission" && event.decision.outcome === "selected" && event.attemptId) {
      for (const [key, request] of requests)
        if (
          request.requestId === event.requestId &&
          request.attemptId === event.attemptId &&
          request.binding !== "reconnecting"
        )
          requests.set(key, { ...request, answering: true });
    }
    if (
      event.type === "permission_delivery" ||
      (event.type === "permission" &&
        (event.decision.outcome !== "selected" ||
          (!event.attemptId && stint.recovery?.state !== "resuming")))
    ) {
      for (const [key, request] of requests)
        if (
          request.requestId === event.requestId &&
          (event.attemptId === undefined || event.attemptId === (request.attemptId ?? "legacy"))
        )
          requests.delete(key);
    }
  }
  return [...requests.values()];
}
