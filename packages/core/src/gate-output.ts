// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "./project.js";
import type { ReviewGateCondition } from "./review-evidence.js";
import type { WorkflowStage } from "./workflows.js";
import { coreText } from "./core-text.js";

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
    label: coreText({ code: "gate.manualApproval" }),
    ready: true,
    action: coreText({ code: "gate.approve" }),
  };
  if (stage.gate === "spec") {
    const warning = warnings.find(({ path }) => path === `${prefix}spec.md`);
    output = {
      id: "output",
      label: coreText({ code: item.github ? "gate.githubSpecOutput" : "gate.specOutput" }),
      ready: item.spec !== null && !warning,
      action: item.github
        ? coreText({ code: "gate.githubSpecRequired" })
        : coreText({
            code: "gate.writeSpec",
            params: { path: `${prefix}spec.md`, warning: warning?.message ?? "" },
          }),
    };
  } else if (stage.gate === "tickets") {
    const warning = warnings.find(({ path }) => path.startsWith(`${prefix}issues/`));
    const positions = new Map(item.tickets.map((ticket, index) => [ticket.number, index]));
    output = {
      id: "output",
      label: coreText({ code: item.github ? "gate.githubTicketsOutput" : "gate.ticketsOutput" }),
      ready:
        item.tickets.length > 0 &&
        (item.github
          ? item.tickets.every((ticket) => ticket.status !== "unknown" && !ticket.blocked)
          : !warning &&
            item.tickets.every((ticket, index) =>
              ticket.blockedBy.every((number) => (positions.get(number) ?? Infinity) < index),
            )),
      action: item.github
        ? coreText({ code: "gate.githubTicketsRequired" })
        : coreText({
            code: "gate.writeTickets",
            params: { path: `${prefix}issues/NN-<slug>.md`, warning: warning?.message ?? "" },
          }),
    };
  }
  const conditions: GateCondition[] = [output];
  if (stage.column === "clarify")
    conditions.push({
      id: "memory",
      label: coreText({ code: "gate.memoryDecided" }),
      ready: !item.memoryProposalError && item.memoryProposals?.length === 0,
      action:
        (item.memoryProposalError ? { text: item.memoryProposalError } : null) ??
        coreText({ code: "gate.decideMemory" }),
    });
  return conditions;
}
