// SPDX-License-Identifier: Apache-2.0
import type { Milestone, ProjectSnapshot, RoadmapChange } from "@stintwork/core";
import { useEffect, useId, useRef, useState } from "react";
import "./roadmap-editor.css";
import { en } from "./i18n/en";
import { useLanguage } from "./i18n/language";

export function RoadmapEditor({ snapshot }: { snapshot: ProjectSnapshot }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        type="button"
        className="top-button"
        ref={trigger}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {t.planning.roadmap.title}
      </button>
      {open && (
        <RoadmapSheet
          snapshot={snapshot}
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      )}
    </>
  );
}

function RoadmapSheet({ snapshot, onClose }: { snapshot: ProjectSnapshot; onClose: () => void }) {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [milestones, setMilestones] = useState(snapshot.milestones);
  const [name, setName] = useState("");
  const [workItem, setWorkItem] = useState(snapshot.workItems[0]?.slug ?? "");
  const [destination, setDestination] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    setMilestones(snapshot.milestones);
  }, [snapshot.milestones]);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => element?.close();
  }, []);

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
      const result = await response.json();
      if (!response.ok) throw new Error(result.reason ?? en.planning.roadmap.errors.save);
      setMilestones(result.milestones);
      if (change.kind === "add") setName("");
      setMessage(result.commit ? "committed" : "unchanged");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : en.planning.roadmap.errors.save);
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
    <dialog
      className="roadmap-editor"
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <header>
        <h2 id={titleId}>{t.planning.roadmap.title}</h2>
        <button type="button" className="top-button" disabled={saving} onClick={onClose}>
          {t.planning.roadmap.close}
        </button>
      </header>
      <p className="muted">{t.planning.roadmap.description}</p>
      {error && (
        <p role="alert" className="warning">
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
        <legend>{t.planning.roadmap.milestones}</legend>
        {milestones.map((milestone, index) => (
          <MilestoneFields
            key={`${milestone.id}:${milestone.name}:${milestone.status}:${milestone.target ?? ""}`}
            milestone={milestone}
            first={index === 0}
            last={index === milestones.length - 1}
            onSave={save}
            onReorder={(offset) => reorder(index, offset)}
          />
        ))}
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
          <button className="top-button" type="submit" disabled={!name.trim()}>
            {t.planning.roadmap.add}
          </button>
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
          <label>
            {t.planning.roadmap.workItem}
            <select value={workItem} onChange={(event) => setWorkItem(event.target.value)}>
              {snapshot.workItems.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.planning.roadmap.destination}
            <select value={destination} onChange={(event) => setDestination(event.target.value)}>
              <option value="">{t.planning.roadmap.noMilestone}</option>
              {milestones.map((milestone) => (
                <option key={milestone.id} value={milestone.id}>
                  {milestone.name}
                </option>
              ))}
            </select>
          </label>
          <button className="top-button" type="submit">
            {t.planning.roadmap.move}
          </button>
        </fieldset>
      </form>
    </dialog>
  );
}

function MilestoneFields({
  milestone,
  first,
  last,
  onSave,
  onReorder,
}: {
  milestone: Milestone;
  first: boolean;
  last: boolean;
  onSave: (change: RoadmapChange) => Promise<void>;
  onReorder: (offset: number) => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(milestone.name);
  const [status, setStatus] = useState(milestone.status);
  const [target, setTarget] = useState(milestone.target ?? "");
  return (
    <section className="roadmap-milestone" aria-label={milestone.name}>
      <h3>
        {milestone.name} <small className="muted">{milestone.id}</small>
      </h3>
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
        <button
          className="top-button"
          type="submit"
          disabled={!name.trim() || name === milestone.name}
        >
          {t.planning.roadmap.rename(milestone.name)}
        </button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ kind: "update", id: milestone.id, status });
        }}
      >
        <label>
          {t.planning.roadmap.status(milestone.name)}
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as Milestone["status"])}
          >
            <option value="planned">{t.planning.roadmap.planned}</option>
            <option value="active">{t.planning.roadmap.active}</option>
            <option value="shipped">{t.planning.roadmap.shipped}</option>
          </select>
        </label>
        <button className="top-button" type="submit" disabled={status === milestone.status}>
          {t.planning.roadmap.setStatus(milestone.name)}
        </button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ kind: "update", id: milestone.id, target: target || null });
        }}
      >
        <label>
          {t.planning.roadmap.target(milestone.name)}
          <input type="date" value={target} onChange={(event) => setTarget(event.target.value)} />
        </label>
        <button className="top-button" type="submit" disabled={target === (milestone.target ?? "")}>
          {t.planning.roadmap.setTarget(milestone.name)}
        </button>
      </form>
      <div className="roadmap-order">
        <button className="top-button" type="button" disabled={first} onClick={() => onReorder(-1)}>
          {t.planning.roadmap.up(milestone.name)}
        </button>
        <button className="top-button" type="button" disabled={last} onClick={() => onReorder(1)}>
          {t.planning.roadmap.down(milestone.name)}
        </button>
      </div>
    </section>
  );
}
