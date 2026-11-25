// SPDX-License-Identifier: Apache-2.0

import { Disclosure } from "../ui/Disclosure";
import { Markdown } from "../ui/Markdown";
import { TabsContent } from "../ui/Tabs";

import { FilePath } from "./FilePath";
import type { DrawerState } from "./useDrawerState";
export function SpecTab({ state }: { state: DrawerState }) {
  const { item, t, missingShippedDetail, headings, captureSpec, contents } = state;
  return (
    <TabsContent
      value="spec"
      className="drawer-content min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-4 sm:px-7"
    >
      <div ref={captureSpec} className="@container">
        <section
          id="drawer-spec"
          aria-labelledby="drawer-spec-title"
          className={
            headings.length
              ? "grid gap-4 @[960px]:grid-cols-[var(--detail-spec-columns)]"
              : undefined
          }
        >
          <h3 id="drawer-spec-title" className="sr-only">
            {t.stints.spec}
          </h3>
          {item.spec ? (
            <>
              {headings.length > 0 && (
                <>
                  <Disclosure
                    label={t.detailTabs.contents}
                    className="text-xs text-muted-foreground @[960px]:hidden"
                  >
                    <nav
                      aria-label={t.detailTabs.contents}
                      className="flex flex-col items-start [&>button]:!min-h-7"
                    >
                      {contents}
                    </nav>
                  </Disclosure>
                  <nav
                    aria-label={t.detailTabs.contents}
                    className="hidden min-w-0 flex-col items-start gap-1 text-xs text-muted-foreground @[960px]:sticky @[960px]:top-0 @[960px]:flex @[960px]:self-start"
                  >
                    {contents}
                  </nav>
                </>
              )}
              <div className="min-w-0 max-w-[72ch]">
                <FilePath path={item.spec.path} />
                <Markdown>{item.spec.text}</Markdown>
              </div>
            </>
          ) : missingShippedDetail ? (
            <p className="muted text-muted-foreground">{t.board.githubStatus.detailUnavailable}</p>
          ) : (
            <p className="muted text-muted-foreground">{t.stints.noSpec}</p>
          )}
        </section>
      </div>
    </TabsContent>
  );
}
