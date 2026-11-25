// SPDX-License-Identifier: Apache-2.0
import { CheckCircle2, Circle, LockKeyhole } from "lucide-react";
import { m } from "motion/react";
import { TicketBriefPreview } from "../BriefPreview";
import { ticketStatus } from "../i18n/language";
import { Badge } from "../ui/Badge";
import { Markdown } from "../ui/Markdown";
import { spring } from "../ui/motion";
import { TabsContent } from "../ui/Tabs";

import { FilePath } from "./FilePath";
import type { DrawerState } from "./useDrawerState";
export function TicketsTab({ state }: { state: DrawerState }) {
  const {
    item,
    workflows,
    githubReadOnly,
    t,
    reduced,
    resolvedNow,
    missingShippedDetail,
    ticketNumber,
    nextTicket,
    hasTickets,
    ticketSelection,
    setTicketSelection,
    selected,
  } = state;
  return (
    <>
      {hasTickets && (
        <TabsContent
          value="tickets"
          className="drawer-content min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-4 sm:px-7"
        >
          <section id="drawer-tickets" aria-labelledby="drawer-tickets-title">
            <h3 id="drawer-tickets-title" className="sr-only">
              {t.stints.tickets}{" "}
              <span className="count min-w-5 rounded-sm bg-muted px-1 text-center text-xs text-muted-foreground">
                {item.tickets.length}
              </span>
            </h3>
            {item.tickets.length ? (
              <>
                <ol className="drawer-tickets">
                  {item.tickets.map((ticket) => {
                    const blocked = ticket.blocked && ticket.status !== "unknown";
                    const StatusIcon = ticket.resolved
                      ? CheckCircle2
                      : blocked
                        ? LockKeyhole
                        : Circle;
                    return (
                      <li key={ticket.path}>
                        <div className="drawer-ticket border-b border-border py-3">
                          <button
                            type="button"
                            className="flex w-full items-start gap-3 text-left"
                            aria-expanded={ticketSelection === ticket.number}
                            onClick={() =>
                              setTicketSelection(
                                ticketSelection === ticket.number ? undefined : ticket.number,
                              )
                            }
                          >
                            <m.span
                              data-ticket-check={ticket.path}
                              key={`${ticket.path}:${ticket.resolved}`}
                              initial={
                                resolvedNow.has(ticket.path)
                                  ? reduced
                                    ? { opacity: 0 }
                                    : { scale: 0.5, opacity: 0 }
                                  : false
                              }
                              animate={{ scale: 1, opacity: 1 }}
                              transition={spring.celebrate}
                              className="inline-flex shrink-0"
                            >
                              <StatusIcon
                                className={
                                  ticket.resolved
                                    ? "size-icon-sm shrink-0 text-success-foreground"
                                    : blocked
                                      ? "size-icon-sm shrink-0 text-attention-foreground"
                                      : "size-icon-sm shrink-0 text-muted-foreground"
                                }
                                aria-hidden="true"
                              />
                            </m.span>
                            <span className="ticket-title min-w-0 [overflow-wrap:anywhere] [&_strong]:text-sm [&_strong]:font-medium [&_small]:text-xs">
                              <strong>
                                {ticketNumber(ticket.number)} · {ticket.title}
                              </strong>{" "}
                              <small className="muted text-muted-foreground">
                                <Badge
                                  title={
                                    Object.hasOwn(t.stints.ticketStatuses, ticket.status)
                                      ? undefined
                                      : ticket.status
                                  }
                                  variant={
                                    ticket.resolved ? "success" : blocked ? "warning" : "secondary"
                                  }
                                >
                                  {ticketStatus(ticket.status, t, ticket.resolved)}
                                </Badge>
                                {!ticket.resolved &&
                                  ticket.status !== "unknown" &&
                                  ticket.blockedBy.length > 0 && (
                                    <>
                                      {" "}
                                      {t.stints.blockedBy}{" "}
                                      {ticket.blockedBy.map(ticketNumber).join(", ")}
                                    </>
                                  )}
                              </small>
                            </span>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {selected && (
                  <div>
                    <Markdown>{selected.body}</Markdown>
                    <FilePath path={selected.path} />
                    {!item.merged &&
                      !selected.resolved &&
                      !selected.blocked &&
                      selected !== nextTicket && (
                        <TicketBriefPreview
                          item={item}
                          ticket={selected}
                          workflows={workflows}
                          githubReadOnly={githubReadOnly}
                        />
                      )}
                  </div>
                )}
              </>
            ) : missingShippedDetail ? (
              <p className="muted text-muted-foreground">
                {t.board.githubStatus.detailUnavailable}
              </p>
            ) : (
              <p className="muted text-muted-foreground">{t.stints.noTickets}</p>
            )}
          </section>
        </TabsContent>
      )}
    </>
  );
}
