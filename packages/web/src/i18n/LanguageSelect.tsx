// SPDX-License-Identifier: Apache-2.0
import { useLanguage } from "./language";

export function LanguageSelect({ size, onChange }: { size?: number; onChange?: () => void }) {
  const { t, language, setLanguage } = useLanguage();
  return (
    <label className="milestone-filter">
      {t.topBar.language}
      <select
        aria-label={t.topBar.language}
        value={language}
        size={size}
        onChange={(event) => {
          const choice = event.target.value;
          if (choice !== "en" && choice !== "zh-CN") return;
          setLanguage(choice);
          onChange?.();
        }}
      >
        <option value="en" lang="en">
          English
        </option>
        <option value="zh-CN" lang="zh-CN">
          简体中文
        </option>
      </select>
    </label>
  );
}
