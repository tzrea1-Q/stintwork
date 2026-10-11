// SPDX-License-Identifier: Apache-2.0
import type { AttentionItem } from "@stintwork/core";
import { useEffect, useRef, useState } from "react";

const preferenceKey = "stintwork.attention-notifications";

export function useAttentionAlerts(items: AttentionItem[], projectName: string) {
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
    document.title = `${items.length ? `(${items.length}) ` : ""}${projectName} · Stintwork`;
  }, [items.length, projectName]);

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
          new Notification(`${projectName} · Needs you`, { body: item.title, tag: item.id });
        } catch {
          setError("Browser notifications are unavailable. The Needs-you queue remains available.");
        }
      }
      seen.current.add(item.id);
    }
  }, [items, enabled, supported, projectName]);

  async function toggle() {
    if (!supported || requesting) return;
    setError("");
    let next = false;
    if (!enabled) {
      setRequesting(true);
      try {
        next = (await Notification.requestPermission()) === "granted";
        if (!next)
          setError(
            "Browser notifications were not enabled. Check this site's browser permissions to try again.",
          );
      } catch {
        setError("Could not enable browser notifications.");
      } finally {
        setRequesting(false);
      }
    }
    setEnabled(next);
    try {
      if (next) localStorage.setItem(preferenceKey, "enabled");
      else localStorage.removeItem(preferenceKey);
    } catch {
      setError("Your notification preference could not be saved in this browser.");
    }
  }

  return { enabled, supported, requesting, error, toggle };
}
