// SPDX-License-Identifier: Apache-2.0

import {
  type AgentProfile,
  agentUnavailable,
  builtInWorkflows,
  type StageId,
  stageAgent,
  type WorkflowDefinitions,
} from "@stintwork/core";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CoreTextError,
  readResponseJson,
  translateCoreText,
  useErrorText,
  useLanguage,
} from "./i18n/language";
import { stageName, workflowName } from "./i18n/workflow-names";
import { PropertyRow } from "./ui/PropertyRow";
import { SelectField } from "./ui/SelectField";
import type { BoardWorkItem } from "./WorkItemCard";

export function StageAgentRail({
  item,
  workflows = builtInWorkflows,
  onAgentChange,
}: {
  item: BoardWorkItem;
  workflows?: WorkflowDefinitions;
  onAgentChange?: (agent: string) => void;
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
      if (stage === item.stage) onAgentChange?.(result.agent);
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

  const current = item.stage
    ? ((choices.source === item.stages ? choices.agents[item.stage] : undefined) ??
      stageAgent(item, item.stage, agents, workflows))
    : "";
  const currentName = agents.find((agent) => agent.id === current)?.displayName ?? current;

  return (
    <>
      <PropertyRow
        icon={Sparkles}
        label={t.drawerIdentity.stageAgent}
        value={
          <span>
            {currentName}
            {item.inferred && (
              <small className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                {t.stints.inferred}
              </small>
            )}
          </span>
        }
      />
      <details className="col-span-full">
        <summary className="cursor-pointer py-2 text-xs text-muted-foreground">
          {t.drawerIdentity.agentsByStage}
        </summary>
        <ol
          className="stage-rail [&_[role=group]]:items-center [&_[role=group]]:py-0"
          aria-label={t.stints.workflowStages(workflowName(workflow, t))}
        >
          {workflow.stages.map((stage) => {
            const chosen =
              (choices.source === item.stages ? choices.agents[stage.id] : undefined) ??
              stageAgent(item, stage.id, agents, workflows);
            return (
              <li key={stage.id} aria-current={stage.id === item.stage ? "step" : undefined}>
                <PropertyRow
                  icon={Sparkles}
                  label={
                    <>
                      {stageName(workflow, stage, t)}
                      {stage.id === item.stage && item.inferred && (
                        <small className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                          {t.stints.inferred}
                        </small>
                      )}
                    </>
                  }
                  value={
                    <SelectField
                      aria-label={t.stints.stageAgent(stageName(workflow, stage, t))}
                      className="h-10 text-xs"
                      value={chosen}
                      disabled={saving || !!item.activeStint || !agents.length}
                      onValueChange={(agent) => void choose(stage.id, agent)}
                      options={[
                        ...(!agents.some(({ id }) => id === chosen)
                          ? [
                              {
                                value: chosen,
                                disabled: true,
                                label: `${chosen} — ${agents.length ? t.stints.notRegistered : t.stints.readingAgents}`,
                              },
                            ]
                          : []),
                        ...agents.map((agent) => {
                          const unavailable = agentUnavailable(agent);
                          const reason =
                            unavailable === null ? null : translateCoreText(unavailable, t);
                          return {
                            value: agent.id,
                            disabled: !!reason,
                            label: `${agent.displayName}${agent.experimental ? ` (${t.stints.experimental})` : ""}${reason ? ` — ${reason}` : ""}`,
                          };
                        }),
                      ]}
                    />
                  }
                />
              </li>
            );
          })}
        </ol>
      </details>
      {error && (
        <p
          role="alert"
          className="warning shrink-0 px-4 py-3 text-sm text-attention-foreground sm:px-7"
        >
          {error}
        </p>
      )}
    </>
  );
}
