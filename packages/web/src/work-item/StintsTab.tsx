// SPDX-License-Identifier: Apache-2.0

import { ChecksPanel } from "../ChecksPanel";
import { FindingCard, FindingsRail } from "../ReviewFindings";
import { StintHistory } from "../StintHistory";
import { TabsContent } from "../ui/Tabs";
import type { DrawerState } from "./useDrawerState";
export function StintsTab({ state }: { state: DrawerState }) {
  const { item, agents, t, shipPaused, archived } = state;
  return (
    <TabsContent
      value="stints"
      className="drawer-content min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-4 sm:px-7 [&_section+section]:mt-5"
    >
      <section aria-labelledby="drawer-stint-history-title">
        <h3 id="drawer-stint-history-title" className="sr-only">
          {t.stints.history}
        </h3>
        <StintHistory stints={item.stints} github={!!item.github} agents={agents} />
      </section>
      {item.merged && (
        <>
          <section aria-label={t.stints.reviewFindings}>
            <h3 className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold">
              {t.stints.reviewFindings}
            </h3>
            <FindingsRail {...archived} anchor={(finding) => `archived-${finding.id}`} />
            {archived.findings.map((finding) => (
              <FindingCard key={finding.id} finding={finding} anchor={`archived-${finding.id}`} />
            ))}
          </section>
          <section aria-label={t.stints.recordedChecks}>
            <h3 className="drawer-section-heading mb-3 flex items-center gap-2 text-base font-semibold">
              {t.stints.checks}
            </h3>
            <ChecksPanel item={item} shipPaused={shipPaused} />
          </section>
        </>
      )}
    </TabsContent>
  );
}
