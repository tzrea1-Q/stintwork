// SPDX-License-Identifier: Apache-2.0
import { useSyncExternalStore } from "react";
import { getMotion, getTheme, setMotion, setTheme, subscribeAppearance } from "./appearance";
import { useLanguage } from "./i18n/language";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "./ui/DropdownMenu";

export function AppearanceMenu() {
  const { t } = useLanguage();
  const theme = useSyncExternalStore(subscribeAppearance, getTheme);
  const motion = useSyncExternalStore(subscribeAppearance, getMotion);
  return (
    <>
      <DropdownMenuLabel className="px-2 py-1 text-xs text-muted-foreground">
        {t.topBar.appearance}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        aria-label={t.topBar.appearance}
        value={theme}
        onValueChange={(choice) => {
          if (choice === "system" || choice === "light" || choice === "dark") setTheme(choice);
        }}
      >
        {(["system", "light", "dark"] as const).map((choice) => (
          <DropdownMenuRadioItem key={choice} value={choice}>
            {t.topBar.themes[choice]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator className="my-1 border-t border-border" />
      <DropdownMenuLabel className="px-2 py-1 text-xs text-muted-foreground">
        {t.topBar.motion}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        aria-label={t.topBar.motion}
        value={motion}
        onValueChange={(choice) => {
          if (choice === "system" || choice === "full" || choice === "reduced") setMotion(choice);
        }}
      >
        {(["system", "full", "reduced"] as const).map((choice) => (
          <DropdownMenuRadioItem key={choice} value={choice}>
            {t.topBar.motions[choice]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
