// SPDX-License-Identifier: Apache-2.0

import {
  type AgentProfile,
  builtInWorkflows,
  type Milestone,
  type Warning,
  type WorkflowDefinitions,
} from "@stintwork/core";
import type { BoardWorkItem } from "./WorkItemCard";
import { DrawerContainer } from "./work-item/DrawerContainer";
import { useDrawerState } from "./work-item/useDrawerState";
export function WorkItemDrawer({
  item,
  initialUrlOpen = false,
  mainHead,
  localTracker = true,
  milestone,
  onClose,
  agents = [],
  warnings = [],
  workflows = builtInWorkflows,
  onCustomiseWorkflow,
  githubReadOnly = false,
  githubRetryAt,
  pendingPermissions = false,
  attentionCount = 0,
  onOpenNeedsYou,
  full = false,
  onFullChange,
}: {
  full?: boolean;
  onFullChange?: (full: boolean) => void;
  item: BoardWorkItem;
  initialUrlOpen?: boolean;
  mainHead?: string;
  localTracker?: boolean;
  pendingPermissions?: boolean;
  attentionCount?: number;
  onOpenNeedsYou?: () => void;
  githubReadOnly?: boolean;
  githubRetryAt?: string;
  milestone?: Milestone;
  onClose: () => void;
  agents?: AgentProfile[];
  warnings?: Warning[];
  workflows?: WorkflowDefinitions;
  onCustomiseWorkflow?: (id: string) => void;
}) {
  return (
    <DrawerContainer
      state={useDrawerState({
        item,
        initialUrlOpen,
        mainHead,
        localTracker,
        milestone,
        onClose,
        agents,
        warnings,
        workflows,
        onCustomiseWorkflow,
        githubReadOnly,
        githubRetryAt,
        pendingPermissions,
        attentionCount,
        onOpenNeedsYou,
        full,
        onFullChange,
      })}
    />
  );
}
