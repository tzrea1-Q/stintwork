// SPDX-License-Identifier: Apache-2.0
import {
  type AgentProfile,
  agentUnavailableReason,
  builtInWorkflows,
  stageAgent,
  type StageId,
  type WorkflowDefinitions,
} from "@stintwork/core";
import { useEffect, useState } from "react";
import type { BoardWorkItem } from "./WorkItemCard";
import "./stage-agent-rail.css";

export function StageAgentRail({
  item,
  workflows = builtInWorkflows,
}: {
  item: BoardWorkItem;
  workflows?: WorkflowDefinitions;
}) {
  const workflow = workflows[item.workflow];
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [choices, setChoices] = useState<{
    source: BoardWorkItem["stages"];
    agents: Partial<Record<StageId, string>>;
  }>({ source: item.stages, agents: {} });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const request = new AbortController();
    setAgents([]);
    setError("");
    async function load() {
      try {
        const response = await fetch("/api/agents", { signal: request.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.reason ?? "Could not load registered agents.");
        if (!Array.isArray(result.agents)) throw new Error("Could not load registered agents.");
        if (!request.signal.aborted) setAgents(result.agents);
      } catch (cause) {
        if (!request.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Could not load registered agents.");
      }
    }
    void load();
    return () => request.abort();
  }, []);

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
      const result = await response.json();
      if (!response.ok) throw new Error(result.reason ?? "Could not save the stage agent.");
      setChoices((choices) => ({
        source: item.stages,
        agents: {
          ...(choices.source === item.stages ? choices.agents : {}),
          [stage]: result.agent,
        },
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the stage agent.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ol className="stage-rail" aria-label={`${workflow.name} workflow stages`}>
        {workflow.stages.map((stage) => {
          const chosen =
            (choices.source === item.stages ? choices.agents[stage.id] : undefined) ??
            stageAgent(item, stage.id, agents, workflows);
          return (
            <li key={stage.id} aria-current={stage.id === item.stage ? "step" : undefined}>
              <span>{stage.name}</span>
              {stage.id === item.stage && item.inferred && <small>Inferred</small>}
              <select
                aria-label={`${stage.name} agent`}
                value={chosen}
                disabled={saving || !!item.activeStint || !agents.length}
                onChange={(event) => void choose(stage.id, event.target.value)}
              >
                {!agents.some(({ id }) => id === chosen) && (
                  <option value={chosen} disabled>
                    {chosen} — {agents.length ? "Not registered" : "Reading registered agents…"}
                  </option>
                )}
                {agents.map((agent) => {
                  const reason = agentUnavailableReason(agent);
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
