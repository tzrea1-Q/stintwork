// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "./project.js";
import type { ReviewGateCondition } from "./review-evidence.js";
import type { WorkflowStage } from "./workflows.js";
import { coreTextMessage } from "./core-text.js";

export type GateCondition = Omit<ReviewGateCondition, "id"> & {
  id: ReviewGateCondition["id"] | "output";
};

export function outputGateConditions(
  item: ProjectSnapshot["workItems"][number],
  stage: WorkflowStage,
): GateCondition[] {
  const prefix = `.scratch/${item.slug}/`;
  const warnings = item.outputWarnings ?? [];
  let output: GateCondition = {
    id: "output",
    label: "Developer approval; no file output required",
    ready: true,
    action: "Review the stage and approve when satisfied.",
  };
  if (stage.gate === "spec") {
    const warning = warnings.find(({ path }) => path === `${prefix}spec.md`);
    output = {
      id: "output",
      label: "spec.md exists and parses",
      ready: item.spec !== null && !warning,
      action: `Write or edit ${prefix}spec.md with a nonempty # heading.${warning ? ` ${warning.message}` : ""}`,
      actionMessage: {
        code: "gate.writeSpec",
        params: { path: `${prefix}spec.md`, warning: warning?.message ?? "" },
      },
    };
  } else if (stage.gate === "tickets") {
    const warning = warnings.find(({ path }) => path.startsWith(`${prefix}issues/`));
    const positions = new Map(item.tickets.map((ticket, index) => [ticket.number, index]));
    output = {
      id: "output",
      label: "At least one ticket, no ticket warnings, valid dependency order",
      ready:
        item.tickets.length > 0 &&
        !warning &&
        item.tickets.every((ticket, index) =>
          ticket.blockedBy.every((number) => (positions.get(number) ?? Infinity) < index),
        ),
      action: `Write or fix ${prefix}issues/NN-<slug>.md tickets with Status and Blocked by lines and valid dependencies.${warning ? ` ${warning.message}` : ""}`,
      actionMessage: {
        code: "gate.writeTickets",
        params: { path: `${prefix}issues/NN-<slug>.md`, warning: warning?.message ?? "" },
      },
    };
  }
  const conditions: GateCondition[] = [output];
  if (stage.column === "clarify")
    conditions.push({
      id: "memory",
      label: "No open memory proposals",
      ready: !item.memoryProposalError && item.memoryProposals?.length === 0,
      action:
        item.memoryProposalError ?? "Accept or reject every open memory proposal in Needs you.",
    });
  return conditions.map((condition) => {
    const labelMessage = coreTextMessage(condition.label);
    const actionMessage = condition.actionMessage ?? coreTextMessage(condition.action);
    return {
      ...condition,
      ...(labelMessage ? { labelMessage } : {}),
      ...(actionMessage ? { actionMessage } : {}),
    };
  });
}
