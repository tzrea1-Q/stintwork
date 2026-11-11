// SPDX-License-Identifier: Apache-2.0
import type { AttentionItem, ProjectSnapshot } from "@stintwork/core";
import { useEffect, useRef, useState } from "react";
import { type Catalog, en } from "./i18n/en";
import { type Language, useLanguage } from "./i18n/language";
import { stageName } from "./i18n/workflow-names";

const preferenceKey = "stintwork.attention-notifications";

export function attentionTitle(
  item: AttentionItem,
  t: Catalog,
  language: Language,
  agent = item.agent ?? "",
  stage = item.kind === "gate-ready" || item.kind === "approval-stale" ? item.stage : "",
) {
  if (item.kind === "approval-stale" && language === "en")
    return stage === item.stage ? item.title : t.needsYou.staleApprovalTitle(stage);
  if (language === "en") return item.title;
  switch (item.kind) {
    case "permission":
      return item.title === en.needsYou.permissionRequested
        ? t.needsYou.permissionRequested
        : t.needsYou.permissionRequest(item.title);
    case "handoff-unresolved":
      return t.needsYou.unresolvedHandoff;
    case "approval-stale":
      return t.needsYou.staleApprovalTitle(stage);
    case "gate-ready":
      return t.needsYou.stageReady(stage);
    case "login-required":
      return t.needsYou.loginTitle(agent);
    case "checkpoint-warning":
      return item.warnings.some((warning) => !warning.excluded)
        ? t.needsYou.riskyCommitted
        : t.needsYou.riskyExcluded;
    default:
      return item.title;
  }
}

export function attentionStageName(
  item: AttentionItem,
  snapshot: Pick<ProjectSnapshot, "workItems" | "workflows">,
  t: Catalog,
) {
  if (item.kind !== "gate-ready" && item.kind !== "approval-stale") return undefined;
  const workItem = snapshot.workItems.find(({ slug }) => slug === item.workItem);
  const workflow = workItem && snapshot.workflows[workItem.workflow];
  const stage = workflow?.stages.find(({ id }) => id === item.stage);
  return workflow && stage ? stageName(workflow, stage, t) : item.stage;
}

export function useAttentionAlerts(snapshot: ProjectSnapshot) {
  const { attentionItems: items, name: projectName, workItems, workflows } = snapshot;
  const { t, language } = useLanguage();
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(preferenceKey) === "enabled";
    } catch {
      return false;
    }
  });
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const seen = useRef<Set<string>>();
  const supported = typeof Notification !== "undefined";

  useEffect(() => {
    const original = document.title;
    return () => {
      document.title = original;
    };
  }, []);

  useEffect(() => {
    document.title = `${items.some((item) => item.kind === "permission") ? `${t.needsYou.pendingPermissions} · ` : ""}${t.needsYou.tabTitle(items.length, projectName)}`;
  }, [items, projectName, t]);

  useEffect(() => {
    const previous = seen.current;
    seen.current ??= new Set();
    for (const item of items) {
      if (
        previous &&
        !previous.has(item.id) &&
        enabled &&
        supported &&
        Notification.permission === "granted"
      ) {
        try {
          new Notification(t.needsYou.notificationTitle(projectName), {
            body: attentionTitle(
              item,
              t,
              language,
              undefined,
              attentionStageName(item, { workItems, workflows }, t),
            ),
            tag: item.id,
          });
        } catch {
          setError(t.needsYou.notificationsUnavailable);
        }
      }
      seen.current.add(item.id);
    }
  }, [items, enabled, supported, projectName, t, language, workItems, workflows]);

  async function toggle() {
    if (!supported || requesting) return;
    setError("");
    let next = false;
    if (!enabled) {
      setRequesting(true);
      try {
        next = (await Notification.requestPermission()) === "granted";
        if (!next) setError(t.needsYou.notificationsDenied);
      } catch {
        setError(t.needsYou.notificationsFailed);
      } finally {
        setRequesting(false);
      }
    }
    setEnabled(next);
    try {
      if (next) localStorage.setItem(preferenceKey, "enabled");
      else localStorage.removeItem(preferenceKey);
    } catch {
      setError(t.needsYou.preferenceFailed);
    }
  }

  return { enabled, supported, requesting, error, toggle };
}
