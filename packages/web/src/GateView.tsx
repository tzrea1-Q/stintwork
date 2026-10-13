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
import { ticketStatus, useLanguage } from "./i18n/language";
import { stageName } from "./i18n/workflow-names";

export function GateView({
  item,
  warnings = [],
  workflows = builtInWorkflows,
}: {
  item: BoardWorkItem;
  warnings?: Warning[];
  workflows?: WorkflowDefinitions;
}) {
  const { t } = useLanguage();
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
      if (!response.ok) throw new Error(result.reason ?? t.stints.changeGateFailed);
      const next = stages.find(({ id }) => id === result.stage);
      const name = next ? stageName(workflows[item.workflow], next, t) : result.stage;
      setMessage(action === "approve" ? t.stints.gateApproved(name) : t.stints.gateReopened(name));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.stints.changeGateFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label={t.stints.gate(stageName(workflows[item.workflow], current, t))}
      className="handoff-card"
    >
      <h3 className="drawer-section-heading">
        {t.stints.gate(stageName(workflows[item.workflow], current, t))}
      </h3>
      <p role="status">{gate.ready ? t.stints.readyToApprove : gate.reason}</p>
      {gate.conditions.length > 0 && (
        <ul aria-label={t.stints.gateConditions(stageName(workflows[item.workflow], current, t))}>
          {gate.conditions.map((condition) => (
            <li key={condition.id}>
              <strong>{condition.label}</strong> ·{" "}
              {condition.ready ? t.stints.ready : t.stints.blocked}
              <p>{condition.ready ? t.stints.noAction : condition.action}</p>
            </li>
          ))}
        </ul>
      )}
      <p>
        {item.tickets.filter(({ resolved }) => resolved).length}/{item.tickets.length}
        {t.stints.ticketsResolved}
      </p>
      <ul>
        {item.tickets.map((ticket) => (
          <li key={ticket.path}>
            {ticket.number} · {ticket.title} · {ticketStatus(ticket.status, t, ticket.resolved)}
          </li>
        ))}
      </ul>
      <p>
        {t.stints.lastCheckpoint} {checkpoint ? <code>{checkpoint}</code> : t.stints.noneRecorded}
      </p>
      <h4>{t.stints.lastHandoff}</h4>
      {lastHandoff ? <HandoffCard stint={lastHandoff} /> : <p>{t.stints.noHandoffRecorded}</p>}
      <h4>{t.stints.openWarnings}</h4>
      {warnings.length ? (
        <ul>
          {warnings.map(({ path, message }) => (
            <li key={`${path}:${message}`}>
              <code>{path}</code> {message}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t.stints.noWarnings}</p>
      )}
      {gate.nextStage && (
        <button
          type="button"
          className="top-button"
          disabled={!gate.ready || saving || !!message}
          onClick={() => void act(current.id, "approve")}
        >
          {t.stints.approve(stageName(workflows[item.workflow], current, t))}
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
          {t.stints.reopen(stageName(workflows[item.workflow], stage, t))}
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
