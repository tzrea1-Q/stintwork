// SPDX-License-Identifier: Apache-2.0
import { type Milestone, parseRoadmap } from "./roadmap.js";

export type RoadmapChange =
  | { kind: "add"; name: string }
  | { kind: "rename"; id: string; name: string }
  | { kind: "reorder"; ids: string[] }
  | { kind: "update"; id: string; status?: Milestone["status"]; target?: string | null }
  | { kind: "move"; workItem: string; milestone: string | null };

function singleLine(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || /[\p{Cc}\u2028\u2029\uFFFD]/u.test(value))
    throw new Error(`${label} must be nonempty, single-line text.`);
  return value.trim();
}

export function serializeRoadmap(text: string, milestones: readonly Milestone[]): string {
  const original = parseRoadmap(text);
  if (original.warnings.length) throw new Error("Fix roadmap warnings before editing it.");
  if (original.milestones.some(({ id }) => !milestones.some((entry) => entry.id === id)))
    throw new Error("Removing milestones would discard hand-written text.");
  const newline = /\r\n|\r|\n/.exec(text)?.[0] ?? "\n";
  const lines = text.replace(/^\uFEFF/, "").split(/(?<=\n)|(?<=\r)(?!\n)/);
  const preamble: string[] = [];
  const sections: string[][] = [];
  for (const line of lines) {
    if (/^(?:\uFEFF)?## /.test(line)) sections.push([]);
    (sections.at(-1) ?? preamble).push(line);
  }
  const source = new Map(original.milestones.map((entry, index) => [entry.id, sections[index]]));
  const output = milestones.map((milestone) => {
    const previous = original.milestones.find(({ id }) => id === milestone.id);
    const section = source.get(milestone.id);
    if (!previous || !section)
      return `## ${milestone.name}${newline}Id: ${milestone.id}${newline}Status: ${milestone.status}${newline}${milestone.target ? `Target: ${milestone.target}${newline}` : ""}${milestone.workItemSlugs.length ? newline + milestone.workItemSlugs.map((slug) => `- ${slug}${newline}`).join("") : ""}`;
    let slugIndex = 0;
    const edited = section.flatMap((line, index) => {
      const ending = /(?:\r\n|\r|\n)$/.exec(line)?.[0] ?? "";
      if (index === 0)
        return previous.name === milestone.name
          ? [line]
          : [`${line.startsWith("\uFEFF") ? "\uFEFF" : ""}## ${milestone.name}${ending}`];
      const field = /^(Id|Status|Target):/.exec(line)?.[1] as
        | "Id"
        | "Status"
        | "Target"
        | undefined;
      if (field) {
        const key = { Id: "id", Status: "status", Target: "target" }[field] as
          | "id"
          | "status"
          | "target";
        if (previous[key] === milestone[key]) return [line];
        const comment = /[\t ]+#[^\r\n]*/.exec(line)?.[0] ?? "";
        return milestone[key] === undefined
          ? comment
            ? [`${comment.trimStart()}${ending}`]
            : []
          : [`${field}: ${milestone[key]}${comment}${ending}`];
      }
      const bullet = /^([-*+][\t ]+)([a-zA-Z0-9][a-zA-Z0-9._-]*)[\t ]*(?:\r\n|\r|\n)?$/.exec(line);
      if (!bullet) return [line];
      const slug = milestone.workItemSlugs[slugIndex++];
      return slug === undefined ? [] : [slug === bullet[2] ? line : `${bullet[1]}${slug}${ending}`];
    });
    if (milestone.target !== undefined && !section.some((line) => /^Target:/.test(line))) {
      const position = edited.map((line) => /^(Id|Status):/.test(line)).lastIndexOf(true) + 1;
      if (position && !/[\r\n]$/.test(edited[position - 1])) edited[position - 1] += newline;
      edited.splice(position, 0, `Target: ${milestone.target}${newline}`);
    }
    if (slugIndex < milestone.workItemSlugs.length) {
      let position =
        edited
          .map((line) => /^[-*+][\t ]+[a-zA-Z0-9][a-zA-Z0-9._-]*[\t ]*(?:\r\n|\r|\n)?$/.test(line))
          .lastIndexOf(true) + 1;
      const newList = !position;
      if (!position)
        position = edited.map((line) => /^(Id|Status|Target):/.test(line)).lastIndexOf(true) + 1;
      if (position && !/[\r\n]$/.test(edited[position - 1])) edited[position - 1] += newline;
      edited.splice(
        position,
        0,
        ...(newList ? [newline] : []),
        ...milestone.workItemSlugs.slice(slugIndex).map((slug) => `- ${slug}${newline}`),
      );
    }
    return edited.join("");
  });
  let result = preamble.join("");
  for (const [index, section] of output.entries()) {
    if (result && !source.has(milestones[index].id))
      result = result.replace(/(?:\r\n|\r|\n)+$/, "") + newline + newline;
    else if (result && !/[\r\n]$/.test(result)) result += newline;
    result += section;
  }
  if (text.startsWith("\uFEFF")) result = `\uFEFF${result}`;
  const parsed = parseRoadmap(result);
  if (
    parsed.warnings.length ||
    parsed.milestones.length !== milestones.length ||
    parsed.milestones.some((entry, index) => {
      const expected = milestones[index];
      return (
        entry.id !== expected.id ||
        entry.name !== expected.name ||
        entry.status !== expected.status ||
        entry.target !== expected.target ||
        JSON.stringify(entry.workItemSlugs) !== JSON.stringify(expected.workItemSlugs)
      );
    })
  )
    throw new Error("The edited roadmap is invalid.");
  return result;
}

export function editRoadmap(text: string, change: unknown) {
  if (!change || typeof change !== "object" || Array.isArray(change) || !("kind" in change))
    throw new Error("A roadmap action is required.");
  const parsed = parseRoadmap(text);
  if (parsed.warnings.length) throw new Error("Fix roadmap warnings before editing it.");
  let milestones = parsed.milestones;
  let message: string;
  switch (change.kind) {
    case "add": {
      const name = singleLine("name" in change ? change.name : undefined, "Milestone name");
      const base =
        name
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, "-")
          .slice(0, 48)
          .replace(/^-|-$/g, "") || "milestone";
      let id = base;
      let suffix = 2;
      while (milestones.some((entry) => entry.id === id)) id = `${base}-${suffix++}`;
      milestones.push({ id, name, status: "planned", workItemSlugs: [] });
      message = `Add milestone ${id}`;
      break;
    }
    case "rename":
    case "update": {
      const milestone = milestones.find((entry) => "id" in change && entry.id === change.id);
      if (!milestone) throw new Error("Milestone not found.");
      if (change.kind === "rename") {
        milestone.name = singleLine("name" in change ? change.name : undefined, "Milestone name");
        message = `Rename milestone ${milestone.id} to ${milestone.name}`;
      } else {
        if (!("status" in change) && !("target" in change))
          throw new Error("Choose a status or target date.");
        if ("status" in change) {
          if (
            change.status !== "planned" &&
            change.status !== "active" &&
            change.status !== "shipped"
          )
            throw new Error("Choose planned, active or shipped.");
          milestone.status = change.status;
        }
        if ("target" in change) {
          const target = change.target;
          if (
            target !== null &&
            (typeof target !== "string" ||
              !/^\d{4}-\d{2}-\d{2}$/.test(target) ||
              !Number.isFinite(Date.parse(target)) ||
              new Date(target).toISOString().slice(0, 10) !== target)
          )
            throw new Error("Target must be a valid YYYY-MM-DD date or null.");
          if (target === null) delete milestone.target;
          else milestone.target = target;
        }
        message = `Set milestone ${milestone.id}${"status" in change ? ` status to ${milestone.status}` : ""}${"target" in change ? ` target to ${milestone.target ?? "none"}` : ""}`;
      }
      break;
    }
    case "reorder": {
      if (
        !("ids" in change) ||
        !Array.isArray(change.ids) ||
        change.ids.length !== milestones.length ||
        new Set(change.ids).size !== milestones.length ||
        change.ids.some((id) => !milestones.some((entry) => entry.id === id))
      )
        throw new Error("Provide every milestone id exactly once.");
      milestones = change.ids.map((id) => {
        const milestone = milestones.find((entry) => entry.id === id);
        if (!milestone) throw new Error("Milestone not found.");
        return milestone;
      });
      message = "Reorder milestones";
      break;
    }
    case "move": {
      const slug = singleLine("workItem" in change ? change.workItem : undefined, "Work item slug");
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(slug)) throw new Error("Invalid work item slug.");
      if (
        !("milestone" in change) ||
        (change.milestone !== null && !milestones.some(({ id }) => id === change.milestone))
      )
        throw new Error("Milestone not found.");
      for (const milestone of milestones) {
        if (milestone.id !== change.milestone)
          milestone.workItemSlugs = milestone.workItemSlugs.filter((entry) => entry !== slug);
        else if (!milestone.workItemSlugs.includes(slug)) milestone.workItemSlugs.push(slug);
      }
      message = `Move work item ${slug} to ${change.milestone ?? "no milestone"}`;
      break;
    }
    default:
      throw new Error("Unknown roadmap action.");
  }
  return {
    text: serializeRoadmap(text, milestones),
    milestones,
    message: `Update roadmap: ${message}`,
  };
}
