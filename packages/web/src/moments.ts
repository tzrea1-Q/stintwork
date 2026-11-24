// SPDX-License-Identifier: Apache-2.0
export const newlyArrived = (previous: ReadonlySet<string> | undefined, next: string[]) =>
  previous ? next.filter((id) => !previous.has(id)) : [];
export const rose = (previous: number | undefined, next: number) =>
  previous !== undefined && next > previous;
export const becameResolved = (previous: boolean | undefined, next: boolean) =>
  previous === false && next;

export const becameShipped = (previous: string | undefined, next: boolean) =>
  previous !== undefined && previous !== "shipped" && !previous.startsWith("ship:") && next;
