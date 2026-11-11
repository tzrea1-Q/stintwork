// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLanguage } from "./i18n/language";
import { workflowName } from "./i18n/workflow-names";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/Select";

export function BoardWorkflowFilter({
  snapshot,
  items,
  openSlug,
  children,
}: {
  snapshot: ProjectSnapshot;
  items: ProjectSnapshot["workItems"];
  openSlug: string | null;
  children: (items: ProjectSnapshot["workItems"], picker: ReactNode) => ReactNode;
}) {
  const { t } = useLanguage();
  const [workflow, setWorkflow] = useState<string | null>(null);
  const previousSlug = useRef(openSlug);
  useEffect(() => {
    if (openSlug && openSlug !== previousSlug.current) {
      const item = snapshot.workItems.find((entry) => entry.slug === openSlug);
      if (item && workflow !== null && item.workflow !== workflow) setWorkflow(null);
    }
    previousSlug.current = openSlug;
  }, [openSlug, snapshot.workItems, workflow]);
  const available = Object.values(snapshot.workflows);
  const selected = available.some((entry) => entry.id === workflow) ? workflow : null;
  const picker = available.length > 0 && (
    <Select
      value={selected === null ? "all" : `workflow:${selected}`}
      onValueChange={(value) =>
        setWorkflow(value === "all" ? null : value.slice("workflow:".length))
      }
    >
      <SelectTrigger aria-label={t.pipelineBoard.workflow} className="max-w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t.pipelineBoard.allWorkflows}</SelectItem>
        {available.map((entry) => (
          <SelectItem key={entry.id} value={`workflow:${entry.id}`}>
            {workflowName(entry, t)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return children(
    items.filter((item) => selected === null || item.workflow === selected),
    picker,
  );
}
