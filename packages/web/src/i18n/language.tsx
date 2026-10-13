// SPDX-License-Identifier: Apache-2.0
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { en, type Catalog } from "./en";
import { zhCN } from "./zh-CN";
import { isCoreTextMessage } from "@stintwork/core";

export type Language = "en" | "zh-CN";
export const languageStorageKey = "stintwork.language";

function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(languageStorageKey);
    if (stored === "en" || stored === "zh-CN") return stored;
  } catch {}
  return navigator.languages.some((language) => language.split("-")[0].toLowerCase() === "zh")
    ? "zh-CN"
    : "en";
}

const LanguageContext = createContext<{
  t: Catalog;
  language: Language;
  setLanguage: (language: Language) => void;
}>({ t: en, language: "en", setLanguage: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState(detectLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  function setLanguage(choice: Language) {
    updateLanguage(choice);
    try {
      localStorage.setItem(languageStorageKey, choice);
    } catch {}
  }

  return (
    <LanguageContext.Provider value={{ t: language === "en" ? en : zhCN, language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function stintEventKind(kind: string, labels: Record<string, string>) {
  return Object.hasOwn(labels, kind) ? labels[kind] : kind;
}

export function ticketStatus(status: string, t: Catalog, gateResolved = false) {
  if (gateResolved) return t.stints.resolved;
  const labels = t.stints.ticketStatuses;
  return Object.hasOwn(labels, status) ? labels[status as keyof typeof labels] : status;
}

export function renderCoreText(message: unknown, english: string, t: Catalog): string {
  if (t === en || !isCoreTextMessage(message)) return english;
  const entry = t.coreText[message.code];
  return typeof entry === "string"
    ? entry
    : "params" in message
      ? Reflect.apply(entry, undefined, [message.params])
      : english;
}

export class CoreTextError extends Error {
  readonly reasonMessage: unknown;

  constructor(response: { reason?: unknown; reasonMessage?: unknown }, fallback: string) {
    super(typeof response.reason === "string" ? response.reason : fallback);
    this.reasonMessage = response.reasonMessage;
  }
}

export function useCoreTextError<Key extends string = never>(labels?: Record<Key, string>) {
  const { t } = useLanguage();
  const [failure, setFailure] = useState<string | Error | { key: Key }>("");
  const error =
    typeof failure === "string"
      ? failure
      : failure instanceof CoreTextError
        ? renderCoreText(failure.reasonMessage, failure.message, t)
        : failure instanceof Error
          ? failure.message
          : (labels?.[failure.key] ?? "");
  return [error, setFailure] as const;
}
