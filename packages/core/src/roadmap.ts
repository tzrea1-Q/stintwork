// SPDX-License-Identifier: Apache-2.0
import type { Warning } from "./work-items.js";

export type Milestone = {
  id: string;
  name: string;
  status: "planned" | "active" | "shipped";
  target?: string;
  workItemSlugs: string[];
};

export function parseRoadmap(
  text: string,
  path = ".stintwork/roadmap.md",
): { milestones: Milestone[]; warnings: Warning[] } {
  const milestones: Milestone[] = [];
  const warnings: Warning[] = [];
  if (typeof text !== "string" || /[\p{Cc}\uFFFD]/u.test(text.replace(/[\t\r\n]/g, ""))) {
    return { milestones, warnings: [{ path, message: "Roadmap contains binary or invalid text" }] };
  }
  const sections = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split(/^## /m)
    .slice(1);
  const ids = new Set<string>();
  for (const section of sections) {
    const [heading, ...lines] = section.split("\n");
    const name = heading.trim();
    let invalid = false;
    const field = (key: string): string | undefined => {
      const values = lines.filter((line) => line.startsWith(`${key}:`));
      if (values.length > 1) {
        warnings.push({ path, message: `Milestone "${name}" has duplicate ${key} fields` });
        invalid = true;
      }
      return (
        values[0]
          ?.slice(key.length + 1)
          .replace(/[\t ]+#.*$/, "")
          .trim() || undefined
      );
    };
    const id = field("Id");
    const status = field("Status");
    const target = field("Target");
    if (!name || !id || (status !== "planned" && status !== "active" && status !== "shipped")) {
      warnings.push({
        path,
        message: `Milestone "${name}" needs a nonempty heading, Id and Status (planned, active or shipped)`,
      });
      continue;
    }
    if (invalid) continue;
    if (ids.has(id)) {
      warnings.push({
        path,
        message: `Duplicate milestone id "${id}"; keeping the first milestone`,
      });
      continue;
    }
    ids.add(id);
    const workItemSlugs: string[] = [];
    const slugs = new Set<string>();
    for (const line of lines) {
      const bullet = /^[-*+][\t ]+(.*)$/.exec(line);
      if (!bullet) continue;
      const slug = bullet[1].trim();
      if (slug && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(slug)) continue;
      if (!slug || slugs.has(slug)) {
        warnings.push({
          path,
          message: `Milestone "${id}" has an empty or duplicate work-item slug "${slug}"`,
        });
      } else {
        slugs.add(slug);
        workItemSlugs.push(slug);
      }
    }
    milestones.push({ id, name, status, ...(target ? { target } : {}), workItemSlugs });
  }
  return { milestones, warnings };
}

export function assignMilestones(
  items: { slug: string; declaredMilestone?: string }[],
  milestones: Milestone[],
): { assignments: Map<string, string | undefined>; warnings: Warning[] } {
  const assignments = new Map<string, string | undefined>(
    items.map((item) => [item.slug, undefined]),
  );
  const warnings: Warning[] = [];
  const ids = new Set(milestones.map((milestone) => milestone.id));
  for (const milestone of milestones) {
    for (const slug of milestone.workItemSlugs) {
      if (!assignments.has(slug)) {
        warnings.push({
          path: ".stintwork/roadmap.md",
          message: `Milestone "${milestone.id}" references unknown work-item slug "${slug}"`,
        });
      } else if (assignments.get(slug) !== undefined) {
        warnings.push({
          path: ".stintwork/roadmap.md",
          message: `Work item "${slug}" appears in multiple milestones; keeping the first assignment`,
        });
      } else {
        assignments.set(slug, milestone.id);
      }
    }
  }
  for (const item of items) {
    if (item.declaredMilestone === undefined) continue;
    assignments.set(item.slug, item.declaredMilestone);
    if (!ids.has(item.declaredMilestone)) {
      warnings.push({
        path: `.scratch/${item.slug}/workflow.yaml`,
        message: `Unknown declared milestone id "${item.declaredMilestone}"`,
      });
    }
  }
  return { assignments, warnings };
}
