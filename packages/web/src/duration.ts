// SPDX-License-Identifier: Apache-2.0
import type { Catalog } from "./i18n/en";

export function formatDuration(minutes: number, t: Catalog): string {
  const whole = Math.max(0, Math.floor(minutes));
  if (whole < 1) return t.duration.lessThanMinute;
  if (whole >= 1440) {
    const days = Math.floor(whole / 1440);
    return `${days} ${days === 1 ? t.duration.day : t.duration.days}`;
  }
  if (whole >= 60) {
    const remainder = whole % 60;
    return `${Math.floor(whole / 60)} ${t.duration.hour}${remainder ? ` ${remainder} ${t.duration.minute}` : ""}`;
  }
  return `${whole} ${t.duration.minute}`;
}
