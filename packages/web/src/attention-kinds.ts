// SPDX-License-Identifier: Apache-2.0
import {
  Brain,
  History,
  KeyRound,
  ListChecks,
  MessageCircleQuestion,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

export const kinds = {
  permission: { label: "permission", icon: ShieldCheck, tone: "attention" },
  "login-required": { label: "loginRequired", icon: KeyRound, tone: "attention" },
  "gate-ready": { label: "gateReady", icon: ListChecks, tone: "running" },
  "handoff-unresolved": { label: "handoff", icon: MessageCircleQuestion, tone: "attention" },
  "memory-proposal": { label: "memoryProposal", icon: Brain, tone: "attention" },
  "checkpoint-warning": { label: "checkpoint", icon: TriangleAlert, tone: "attention" },
  "approval-stale": { label: "approvalStale", icon: History, tone: "attention" },
} as const;
