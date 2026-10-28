// SPDX-License-Identifier: Apache-2.0
import { Button } from "./ui/Button";
import {
  translateCoreText,
  readResponseJson,
  CoreTextError,
  useErrorText,
  ticketStatus,
  useLanguage,
} from "./i18n/language";

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
  const [error, setError] = useErrorText();
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const github = item.github;
  const reviewAvailable = !!github?.reviewDigest && !!github.reviewHead;
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
        github
          ? `/api/github/items/${github.number}/gates/${action}`
          : `/api/work-items/${encodeURIComponent(item.slug)}/gates/${encodeURIComponent(stage)}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            github
              ? { stage, reviewedDigest: github.reviewDigest, reviewedHead: github.reviewHead }
              : {},
          ),
        },
      );
      const result = await readResponseJson(response);
      if (!response.ok) {
        if (
          github &&
          ["detail-unavailable", "evidence-changed", "head-changed"].includes(result.code)
        )
          setRefreshNeeded(true);
        throw new CoreTextError(result, t.stints.changeGateFailed);
      }
      if (github) {
        setMessage(
          t.stints.githubApproval[result.approval as "current" | "stale" | "unknown"] ??
            t.stints.githubApproval.unknown,
        );
        setRefreshNeeded(true);
        return;
      }
      const next = stages.find(({ id }) => id === result.stage);
      const name = next ? stageName(workflows[item.workflow], next, t) : result.stage;
      setMessage(action === "approve" ? t.stints.gateApproved(name) : t.stints.gateReopened(name));
    } catch (cause) {
      setError(cause instanceof Error ? cause : t.stints.changeGateFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label={t.stints.gate(stageName(workflows[item.workflow], current, t))}
      className="handoff-card my-3 rounded-sm border border-border bg-surface-raised p-3 [overflow-wrap:anywhere] [&_h4]:font-semibold [&_dt]:font-semibold [&_dl>div]:mt-2 [&>p]:mt-2"
    >
      <h3 className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold">
        {t.stints.gate(stageName(workflows[item.workflow], current, t))}
      </h3>
      <p role="status">
        {gate.ready ? t.stints.readyToApprove : translateCoreText(gate.reason, t)}
      </p>
      {gate.conditions.length > 0 && (
        <ul aria-label={t.stints.gateConditions(stageName(workflows[item.workflow], current, t))}>
          {gate.conditions.map((condition) => (
            <li key={condition.id}>
              <strong>{translateCoreText(condition.label, t)}</strong> ·{" "}
              {condition.ready ? t.stints.ready : t.stints.blocked}
              <p>{condition.ready ? t.stints.noAction : translateCoreText(condition.action, t)}</p>
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
      {github && !reviewAvailable && <p>{t.stints.githubDetailRequired}</p>}
      {github &&
        stages
          .filter(({ id }) => item.stages[id]?.approved)
          .map((stage) => {
            const approval = item.stages[stage.id]?.approved;
            const state =
              approval && typeof approval === "object" && "remoteState" in approval
                ? approval.remoteState
                : "unknown";
            return (
              <p key={stage.id}>
                {stageName(workflows[item.workflow], stage, t)}:{" "}
                {
                  t.stints.githubApproval[
                    state === "current" || state === "stale" ? state : "unknown"
                  ]
                }
              </p>
            );
          })}
      {gate.nextStage && (
        <Button
          type="button"
          variant="primary"
          disabled={
            !gate.ready || saving || !!message || refreshNeeded || (!!github && !reviewAvailable)
          }
          onClick={() => void act(current.id, "approve")}
        >
          {t.stints.approve(stageName(workflows[item.workflow], current, t))}
        </Button>
      )}
      {earlier.map((stage) => (
        <Button
          key={stage.id}
          type="button"
          disabled={
            saving ||
            !!message ||
            !!item.activeStint ||
            (!!github && (!reviewAvailable || refreshNeeded))
          }
          onClick={() => void act(stage.id, "reopen")}
        >
          {t.stints.reopen(stageName(workflows[item.workflow], stage, t))}
        </Button>
      ))}
      {github && (refreshNeeded || !reviewAvailable) && (
        <Button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              const response = await fetch(`/api/github/items/${github.number}/refresh`, {
                method: "POST",
              });
              if (!response.ok)
                throw new CoreTextError(
                  await readResponseJson(response),
                  t.stints.changeGateFailed,
                );
              setRefreshNeeded(false);
              setMessage("");
              setError("");
            } catch (cause) {
              setError(cause instanceof Error ? cause : t.stints.changeGateFailed);
            } finally {
              setSaving(false);
            }
          }}
        >
          {t.stints.githubRefresh}
        </Button>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="warning text-warning">
          {error}
        </p>
      )}
    </section>
  );
}
