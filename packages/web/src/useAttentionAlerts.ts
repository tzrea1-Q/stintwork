// SPDX-License-Identifier: Apache-2.0
import type { AttentionItem } from "@stintwork/core";
import { useEffect, useRef, useState } from "react";
import { en, type Catalog } from "./i18n/en";
import { useLanguage, type Language } from "./i18n/language";

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

export function useAttentionAlerts(items: AttentionItem[], projectName: string) {
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
    document.title = t.needsYou.tabTitle(items.length, projectName);
  }, [items.length, projectName, t]);

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
            body: attentionTitle(item, t, language),
            tag: item.id,
          });
        } catch {
          setError(t.needsYou.notificationsUnavailable);
        }
      }
      seen.current.add(item.id);
    }
  }, [items, enabled, supported, projectName, t, language]);

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
