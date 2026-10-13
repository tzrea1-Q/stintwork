// SPDX-License-Identifier: Apache-2.0
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { en, type Catalog } from "./en";
import { zhCN } from "./zh-CN";

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
