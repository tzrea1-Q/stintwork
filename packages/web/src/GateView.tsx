// SPDX-License-Identifier: Apache-2.0
import {
  builtInWorkflows,
  gateReadiness,
  type WorkflowDefinitions,
  type StageId,
  type Warning,
} from "@stintwork/core";
import { useState } from "react";
import { HandoffCard } from "./HandoffCard";
import type { BoardWorkItem } from "./WorkItemCard";

export function GateView({
  item,
  warnings = [],
  workflows = builtInWorkflows,
}: {
  item: BoardWorkItem;
  warnings?: Warning[];
  workflows?: WorkflowDefinitions;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const gate = gateReadiness(item, workflows);
  const stages = workflows[item.workflow].stages;
  const position = stages.findIndex(({ id }) => id === item.stage);
  const current = stages[position];
  if (!current) return null;
  const checkpoint = item.stints.find(({ checkpointCommit }) => checkpointCommit)?.checkpointCommit;
  const lastHandoff = item.stints.find(({ handoff }) => handoff);
  const earlier = stages.slice(0, position).filter(({ id }) => item.stages[id]?.approved);

  async function act(stage: StageId, action: "approve" | "reopen") {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        `/api/work-items/${encodeURIComponent(item.slug)}/gates/${encodeURIComponent(stage)}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.reason ?? "Could not change the gate.");
      const name = stages.find(({ id }) => id === result.stage)?.name ?? result.stage;
      setMessage(
        action === "approve" ? `Gate approved. Stage advances to ${name}.` : `${name} reopened.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change the gate.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label={`${current.name} gate`} className="handoff-card">
      <h3 className="drawer-section-heading">{current.name} gate</h3>
      <p role="status">{gate.ready ? "Ready to approve" : gate.reason}</p>
      {gate.conditions.length > 0 && (
        <ul aria-label={`${current.name} gate conditions`}>
          {gate.conditions.map((condition) => (
            <li key={condition.id}>
              <strong>{condition.label}</strong> · {condition.ready ? "Ready" : "Blocked"}
              <p>{condition.ready ? "No action needed." : condition.action}</p>
            </li>
          ))}
        </ul>
      )}
      <p>
        {item.tickets.filter(({ resolved }) => resolved).length}/{item.tickets.length} tickets
        resolved
      </p>
      <ul>
        {item.tickets.map((ticket) => (
          <li key={ticket.path}>
            {ticket.number} · {ticket.title} · {ticket.resolved ? "Resolved" : ticket.status}
          </li>
        ))}
      </ul>
      <p>Last checkpoint: {checkpoint ? <code>{checkpoint}</code> : "None recorded."}</p>
      <h4>Last handoff</h4>
      {lastHandoff ? <HandoffCard stint={lastHandoff} /> : <p>No handoff recorded.</p>}
      <h4>Open warnings</h4>
      {warnings.length ? (
        <ul>
          {warnings.map(({ path, message }) => (
            <li key={`${path}:${message}`}>
              <code>{path}</code> {message}
            </li>
          ))}
        </ul>
      ) : (
        <p>No open warnings.</p>
      )}
      {gate.nextStage && (
        <button
          type="button"
          className="top-button"
          disabled={!gate.ready || saving || !!message}
          onClick={() => void act(current.id, "approve")}
        >
          Approve {current.name}
        </button>
      )}
      {earlier.map((stage) => (
        <button
          key={stage.id}
          type="button"
          className="top-button"
          disabled={saving || !!message || !!item.activeStint}
          onClick={() => void act(stage.id, "reopen")}
        >
          Reopen {stage.name}
        </button>
      ))}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
    </section>
  );
}
