// SPDX-License-Identifier: Apache-2.0
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "../ui/DropdownMenu";
import { useLanguage } from "./language";

export function LanguageMenu() {
  const { t, language, setLanguage } = useLanguage();
  return (
    <>
      <DropdownMenuLabel className="px-2 py-1 text-xs text-muted">
        {t.topBar.language}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        aria-label={t.topBar.language}
        value={language}
        onValueChange={(choice) => {
          if (choice === "en" || choice === "zh-CN") setLanguage(choice);
        }}
      >
        {(["en", "zh-CN"] as const).map((choice) => (
          <DropdownMenuRadioItem key={choice} value={choice} lang={choice}>
            {t.topBar.languages[choice]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
