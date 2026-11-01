// SPDX-License-Identifier: Apache-2.0
import { indexProject, type ProjectSnapshot } from "@stintwork/core";
import type { ProjectFilesReader } from "./work-item-files.js";

export function resolveProjectSnapshot(
  project: ReturnType<ProjectFilesReader>,
  getSnapshot?: () => ProjectSnapshot,
) {
  const current = getSnapshot?.();
  return current?.setup.tracker === "github-issues"
    ? structuredClone(current)
    : indexProject(project.files, { name: "" });
}
