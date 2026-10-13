// SPDX-License-Identifier: Apache-2.0
import { useRef } from "react";
import { Button } from "../ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../ui/DropdownMenu";
import { useLanguage } from "./language";

export function LanguageMenu() {
  const { t, language, setLanguage } = useLanguage();
  const current = useRef<HTMLDivElement>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" aria-label={t.topBar.language}>
          <span lang={language}>{t.topBar.languages[language]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        aria-label={t.topBar.language}
        onFocus={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            current.current?.focus();
          }
        }}
      >
        <DropdownMenuRadioGroup
          value={language}
          onValueChange={(choice) => {
            if (choice === "en" || choice === "zh-CN") setLanguage(choice);
          }}
        >
          {(["en", "zh-CN"] as const).map((choice) => (
            <DropdownMenuRadioItem
              key={choice}
              value={choice}
              lang={choice}
              ref={choice === language ? current : undefined}
            >
              {t.topBar.languages[choice]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
