// SPDX-License-Identifier: Apache-2.0
export function relativeTime(at: string, now: number, language: string): string {
  const seconds = (Date.parse(at) - now) / 1000;
  const magnitude = Math.abs(seconds);
  const [divisor, unit] =
    magnitude < 60
      ? [1, "second"]
      : magnitude < 3600
        ? [60, "minute"]
        : magnitude < 86400
          ? [3600, "hour"]
          : magnitude < 604800
            ? [86400, "day"]
            : magnitude < 4838400
              ? [604800, "week"]
              : magnitude < 31557600
                ? [2629800, "month"]
                : [31557600, "year"];
  return new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(
    Math.round(seconds / (divisor as number)),
    unit as Intl.RelativeTimeFormatUnit,
  );
}

export function fullTime(at: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(at),
  );
}
