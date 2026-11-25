// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";
import { AnimatePresence } from "motion/react";
import { useLanguage } from "../i18n/language";
import { WorkItemCard } from "../WorkItemCard";
export function UnstagedLane({
  snapshot,
  filteredUnstaged,
  showWorkflow,
  openSlug,
  openWorkItem,
}: {
  snapshot: ProjectSnapshot;
  filteredUnstaged: ProjectSnapshot["workItems"];
  showWorkflow: boolean;
  openSlug: string | null;
  openWorkItem: (slug: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <>
      {filteredUnstaged.length > 0 && (
        <section
          className="unstaged mt-5"
          data-card-column="unstaged"
          aria-label={t.board.unstaged}
        >
          <h2 className="mb-3 text-xs muted text-muted-foreground">
            {t.board.unstagedCount(filteredUnstaged.length)}
          </h2>
          <div className="auxiliary-items grid gap-3">
            <AnimatePresence mode="popLayout">
              {filteredUnstaged.map((item, index) => (
                <WorkItemCard
                  showWorkflow={showWorkflow}
                  workflow={snapshot.workflows[item.workflow]}
                  key={item.slug}
                  item={item}
                  index={index}
                  agents={snapshot.agents}
                  selected={openSlug === item.slug}
                  attentionCount={
                    snapshot.attentionItems.filter((entry) => entry.workItem === item.slug).length
                  }
                  milestone={snapshot.milestones.find((entry) => entry.id === item.milestone)}
                  onOpen={openWorkItem}
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}
    </>
  );
}
