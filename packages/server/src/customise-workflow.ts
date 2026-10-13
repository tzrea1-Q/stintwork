// SPDX-License-Identifier: Apache-2.0
import { coreTextWire, errorText, coreText, builtInWorkflowYaml } from "@stintwork/core";

import {
  checkWorkflowCustomisation,
  commitWorkflowCustomisation,
  WorkflowCustomisationRefusal,
} from "@stintwork/git";
import type { Hono } from "hono";

export function addWorkflowCustomisationRoutes(app: Hono, root: string, refresh: () => void) {
  for (const preview of [true, false]) {
    app.post(`/api/workflows/:id/customise${preview ? "/preview" : ""}`, async (context) => {
      const origin = context.req.header("origin");
      if (origin && origin !== new URL(context.req.url).origin)
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.originMismatch" }) }),
          403,
        );
      if (
        context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !==
        "application/json"
      )
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.jsonWorkflow" }) }),
          400,
        );
      try {
        const body: unknown = await context.req.json();
        if (!body || typeof body !== "object" || Array.isArray(body))
          return context.json(
            coreTextWire({ reason: coreText({ code: "server.jsonWorkflow" }) }),
            400,
          );
      } catch {
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.invalidJson" }) }),
          400,
        );
      }
      const id = context.req.param("id");
      if (!Object.hasOwn(builtInWorkflowYaml, id))
        return context.json(
          coreTextWire({ reason: coreText({ code: "workflow.chooseBuiltIn" }) }),
          400,
        );
      const yaml = builtInWorkflowYaml[id as keyof typeof builtInWorkflowYaml];
      try {
        if (preview)
          return context.json(
            coreTextWire({ id, path: checkWorkflowCustomisation(root, id), yaml }),
          );
        const result = await commitWorkflowCustomisation(root, id, yaml);
        refresh();
        return context.json(coreTextWire(result), 201);
      } catch (error) {
        return context.json(
          coreTextWire({ reason: errorText(error) }),
          error instanceof WorkflowCustomisationRefusal ? 409 : 503,
        );
      }
    });
  }
}
