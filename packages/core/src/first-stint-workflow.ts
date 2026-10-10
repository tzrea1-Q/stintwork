import { parseDocument } from "yaml";
import type { StageId, WorkflowId } from "./workflows.js";

export function firstStintWorkflow(
  text: string | undefined,
  workflow: WorkflowId,
  stage: StageId,
): string {
  const document = parseDocument(text ?? "");
  if (document.errors.length || document.warnings.length)
    throw new Error("workflow.yaml must be valid YAML before starting a stint.");
  if (text !== undefined && document.getIn(["stages", stage, "agent"]) === "codex") return text;
  document.set("workflow", workflow);
  document.set("stage", stage);
  document.setIn(["stages", stage, "agent"], "codex");
  return document.toString();
}
