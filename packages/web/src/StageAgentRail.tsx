// SPDX-License-Identifier: Apache-2.0
import {
  translateCoreText,
  readResponseJson,
  CoreTextError,
  useErrorText,
  useLanguage,
} from "./i18n/language";

import {
  type AgentProfile,
  agentUnavailable,
  builtInWorkflows,
  stageAgent,
  type StageId,
  type WorkflowDefinitions,
} from "@stintwork/core";
import { useEffect, useState } from "react";
import type { BoardWorkItem } from "./WorkItemCard";
import "./stage-agent-rail.css";

import { stageName, workflowName } from "./i18n/workflow-names";

export function StageAgentRail({
  item,
  workflows = builtInWorkflows,
}: {
  item: BoardWorkItem;
  workflows?: WorkflowDefinitions;
}) {
  const { t } = useLanguage();
  const workflow = workflows[item.workflow];
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [choices, setChoices] = useState<{
    source: BoardWorkItem["stages"];
    agents: Partial<Record<StageId, string>>;
  }>({ source: item.stages, agents: {} });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useErrorText({ loadAgentsFailed: t.stints.loadAgentsFailed });
  useEffect(() => {
    const request = new AbortController();
    setAgents([]);
    setError("");
    async function load() {
      try {
        const response = await fetch("/api/agents", { signal: request.signal, cache: "no-store" });
        const result = await readResponseJson(response);
        if (!response.ok) throw new CoreTextError(result, "");
        if (!Array.isArray(result.agents)) throw new Error();
        if (!request.signal.aborted) setAgents(result.agents);
      } catch (cause) {
        if (!request.signal.aborted)
          setError(cause instanceof Error && cause.message ? cause : { key: "loadAgentsFailed" });
      }
    }
    void load();
    return () => request.abort();
  }, [setError]);

  async function choose(stage: StageId, agent: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/work-items/${encodeURIComponent(item.slug)}/stages/${encodeURIComponent(stage)}/agent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent }),
        },
      );
      const result = await readResponseJson(response);
      if (!response.ok) throw new CoreTextError(result, t.stints.saveAgentFailed);
      setChoices((choices) => ({
        source: item.stages,
        agents: {
          ...(choices.source === item.stages ? choices.agents : {}),
          [stage]: result.agent,
        },
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause : t.stints.saveAgentFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ol className="stage-rail" aria-label={t.stints.workflowStages(workflowName(workflow, t))}>
        {workflow.stages.map((stage) => {
          const chosen =
            (choices.source === item.stages ? choices.agents[stage.id] : undefined) ??
            stageAgent(item, stage.id, agents, workflows);
          return (
            <li key={stage.id} aria-current={stage.id === item.stage ? "step" : undefined}>
              <span>{stageName(workflow, stage, t)}</span>
              {stage.id === item.stage && item.inferred && <small>{t.stints.inferred}</small>}
              <select
                aria-label={t.stints.stageAgent(stageName(workflow, stage, t))}
                value={chosen}
                disabled={saving || !!item.activeStint || !agents.length}
                onChange={(event) => void choose(stage.id, event.target.value)}
              >
                {!agents.some(({ id }) => id === chosen) && (
                  <option value={chosen} disabled>
                    {chosen} — {agents.length ? t.stints.notRegistered : t.stints.readingAgents}
                  </option>
                )}
                {agents.map((agent) => {
                  const unavailable = agentUnavailable(agent);
                  const reason = unavailable === null ? null : translateCoreText(unavailable, t);
                  return (
                    <option key={agent.id} value={agent.id} disabled={!!reason}>
                      {agent.displayName}
                      {reason ? ` — ${reason}` : ""}
                    </option>
                  );
                })}
              </select>
            </li>
          );
        })}
      </ol>
      {error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
    </>
  );
}
