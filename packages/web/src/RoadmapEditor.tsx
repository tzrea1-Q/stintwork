// SPDX-License-Identifier: Apache-2.0

import type { Milestone, ProjectSnapshot, RoadmapChange } from "@stintwork/core";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { en } from "./i18n/en";
import { CoreTextError, readResponseJson, useErrorText, useLanguage } from "./i18n/language";
import { workItemDone } from "./overview-data";
import { Button } from "./ui/Button";
import { Eyebrow } from "./ui/Card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/Dialog";
import { Progress } from "./ui/Progress";
import { SelectField } from "./ui/SelectField";
import { StatusChip } from "./ui/StatusChip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";

export function RoadmapEditor({ snapshot }: { snapshot: ProjectSnapshot }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {t.planning.roadmap.title}
      </Button>
      {open && (
        <RoadmapSheet
          snapshot={snapshot}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function RoadmapSheet({ snapshot, onClose }: { snapshot: ProjectSnapshot; onClose: () => void }) {
  const { t } = useLanguage();
  const selectId = useId();
  const [milestones, setMilestones] = useState(snapshot.milestones);
  const [name, setName] = useState("");
  const [workItem, setWorkItem] = useState(snapshot.workItems[0]?.slug ?? "");
  const [destination, setDestination] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useErrorText();
  const [message, setMessage] = useState("");
  useEffect(() => {
    setMilestones(snapshot.milestones);
  }, [snapshot.milestones]);

  async function save(change: RoadmapChange) {
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const result = await readResponseJson(response);
      if (!response.ok) throw new CoreTextError(result, en.planning.roadmap.errors.save);
      setMilestones(result.milestones);
      if (change.kind === "add") setName("");
      setMessage(result.commit ? "committed" : "unchanged");
      toast.success(t.actionToast.roadmapSaved);
    } catch (cause) {
      toast.error(t.actionToast.failed);
      setError(cause instanceof Error ? cause : en.planning.roadmap.errors.save);
    } finally {
      setSaving(false);
    }
  }

  function reorder(index: number, offset: number) {
    const ids = milestones.map(({ id }) => id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    void save({ kind: "reorder", ids });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        className="roadmap-editor w-3xl [&_fieldset]:mt-5 [&_fieldset]:min-w-0 [&_form]:mb-3 [&_form]:flex [&_form]:flex-wrap [&_form]:items-end [&_form]:gap-3 [&_label]:grid [&_label]:min-w-0 [&_label]:flex-1 [&_label]:basis-48 [&_label]:gap-1 [&_label]:text-sm [&_input]:w-full [&_input]:rounded-sm [&_input]:border [&_input]:border-border [&_input]:bg-card [&_input]:p-2 [&_button]:max-w-full [&_button]:h-auto [&_button]:min-h-8 [&_button]:whitespace-normal [&_button]:py-1"
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <DialogTitle className="text-xl font-medium">{t.planning.roadmap.title}</DialogTitle>
          <Button disabled={saving} onClick={onClose}>
            {t.planning.roadmap.close}
          </Button>
        </header>
        <DialogDescription className="text-muted-foreground">
          {t.planning.roadmap.description}
        </DialogDescription>
        {error && (
          <p role="alert" className="warning text-attention-foreground">
            {Object.entries(en.planning.roadmap.errors).reduce(
              (message, [key, original]) =>
                message === original
                  ? t.planning.roadmap.errors[key as keyof typeof en.planning.roadmap.errors]
                  : message,
              error,
            )}
          </p>
        )}
        {message && <p role="status">{t.planning.roadmap[message as "committed" | "unchanged"]}</p>}
        <fieldset disabled={saving}>
          <legend>
            <Eyebrow>{t.planning.roadmap.milestones}</Eyebrow>
          </legend>
          <TooltipProvider>
            {milestones.map((milestone, index) => (
              <MilestoneFields
                key={milestone.id}
                milestone={milestone}
                workItems={snapshot.workItems}
                first={index === 0}
                last={index === milestones.length - 1}
                onSave={save}
                onReorder={(offset) => reorder(index, offset)}
              />
            ))}
          </TooltipProvider>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save({ kind: "add", name });
            }}
          >
            <label>
              {t.planning.roadmap.newName}
              <input required value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <Button variant="primary" type="submit" disabled={!name.trim()}>
              {t.planning.roadmap.add}
            </Button>
          </form>
        </fieldset>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save({ kind: "move", workItem, milestone: destination || null });
          }}
        >
          <fieldset disabled={saving || !snapshot.workItems.length}>
            <legend>{t.planning.roadmap.moveHeading}</legend>
            <label htmlFor={`${selectId}-workItem`}>
              {t.planning.roadmap.workItem}
              <SelectField
                id={`${selectId}-workItem`}
                aria-label={t.planning.roadmap.workItem}
                value={workItem}
                onValueChange={setWorkItem}
                disabled={saving || !snapshot.workItems.length}
                options={snapshot.workItems.map((item) => ({
                  value: item.slug,
                  label: item.title,
                }))}
              />
            </label>
            <label htmlFor={`${selectId}-destination`}>
              {t.planning.roadmap.destination}
              <SelectField
                id={`${selectId}-destination`}
                aria-label={t.planning.roadmap.destination}
                value={destination}
                onValueChange={setDestination}
                disabled={saving || !snapshot.workItems.length}
                options={[
                  { value: "", label: t.planning.roadmap.noMilestone },
                  ...milestones.map((milestone) => ({
                    value: milestone.id,
                    label: milestone.name,
                  })),
                ]}
              />
            </label>
            <Button type="submit">{t.planning.roadmap.move}</Button>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MilestoneFields({
  milestone,
  workItems,
  first,
  last,
  onSave,
  onReorder,
}: {
  milestone: Milestone;
  workItems: ProjectSnapshot["workItems"];
  first: boolean;
  last: boolean;
  onSave: (change: RoadmapChange) => Promise<void>;
  onReorder: (offset: number) => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(milestone.name);
  const selectId = useId();
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(milestone.status);
  const [target, setTarget] = useState(milestone.target ?? "");
  const total = milestone.workItemSlugs.length;
  const done = workItems.filter(
    (item) => milestone.workItemSlugs.includes(item.slug) && workItemDone(item),
  ).length;
  useEffect(() => {
    setName(milestone.name);
    setStatus(milestone.status);
    setTarget(milestone.target ?? "");
  }, [milestone.name, milestone.status, milestone.target]);
  return (
    <section className="roadmap-milestone border-b border-border" aria-label={milestone.name}>
      <div className="flex min-w-0 items-center gap-1 py-0.5">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronDown
            aria-hidden="true"
            className={`size-icon-sm shrink-0 ${expanded ? "rotate-180" : ""}`}
          />
          <span
            className="min-w-0 flex-1 truncate font-semibold"
            data-truncate
            title={milestone.name}
          >
            {milestone.name}
          </span>
          <small
            className="hidden max-w-24 truncate text-muted-foreground sm:inline"
            data-truncate
            title={milestone.id}
          >
            {milestone.id}
          </small>
          <StatusChip
            status={
              milestone.status === "shipped"
                ? "success"
                : milestone.status === "active"
                  ? "running"
                  : "stopped"
            }
          >
            {t.planning.roadmap[milestone.status]}
          </StatusChip>
          {milestone.target && (
            <time className="shrink-0 text-xs text-muted-foreground" dateTime={milestone.target}>
              {milestone.target}
            </time>
          )}
        </button>
        {total > 0 && (
          <div className="flex shrink-0 items-center gap-1">
            <Progress
              value={done}
              max={total}
              aria-label={milestone.name}
              className="w-10 sm:w-16 [&_[data-slot=progress-indicator]]:bg-running"
            />
            <span className="text-xs tabular-nums text-muted-foreground">
              {done}/{total}
            </span>
          </div>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.planning.roadmap.up(milestone.name)}
              disabled={first}
              onClick={() => onReorder(-1)}
            >
              <ChevronUp aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t.planning.roadmap.up(milestone.name)}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.planning.roadmap.down(milestone.name)}
              disabled={last}
              onClick={() => onReorder(1)}
            >
              <ChevronDown aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t.planning.roadmap.down(milestone.name)}</TooltipContent>
        </Tooltip>
      </div>
      {expanded && (
        <div className="px-2 pb-2">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onSave({ kind: "rename", id: milestone.id, name });
            }}
          >
            <label>
              {t.planning.roadmap.name(milestone.name)}
              <input required value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <Button type="submit" disabled={!name.trim() || name === milestone.name}>
              {t.planning.roadmap.rename(milestone.name)}
            </Button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onSave({ kind: "update", id: milestone.id, status });
            }}
          >
            <label htmlFor={`${selectId}-status`}>
              {t.planning.roadmap.status(milestone.name)}
              <SelectField
                id={`${selectId}-status`}
                aria-label={t.planning.roadmap.status(milestone.name)}
                value={status}
                onValueChange={(value) => setStatus(value as Milestone["status"])}
                options={(["planned", "active", "shipped"] as const).map((value) => ({
                  value,
                  label: t.planning.roadmap[value],
                }))}
              />
            </label>
            <Button type="submit" disabled={status === milestone.status}>
              {t.planning.roadmap.setStatus(milestone.name)}
            </Button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onSave({ kind: "update", id: milestone.id, target: target || null });
            }}
          >
            <label>
              {t.planning.roadmap.target(milestone.name)}
              <input
                type="date"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
            </label>
            <Button type="submit" disabled={target === (milestone.target ?? "")}>
              {t.planning.roadmap.setTarget(milestone.name)}
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}
