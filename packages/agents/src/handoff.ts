import type { BriefHandoff } from "@stintwork/core";

export type AgentHandoff = Pick<BriefHandoff, "stoppedAt" | "unresolved" | "nextStep">;

export const handoffPrompt = `The stint's work turn has ended. Give a handoff for the next stint, including any uncommitted state. Do not continue implementation. Reply with exactly these three Markdown sections, in this order, and no surrounding text:
## Where I stopped
## Unresolved
## Suggested next
Write a nonempty account under each heading; use "None" when nothing is unresolved.`;

export function parseHandoff(text: string): AgentHandoff | null {
  const sections: { heading: string; lines: string[] }[] = [];
  let fence = "";
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    const heading = !fence && /^## (.+?)\s*$/.exec(line)?.[1];
    if (heading) sections.push({ heading, lines: [] });
    else if (sections.length) sections.at(-1)?.lines.push(line);
    else if (line.trim()) return null;
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = "";
    }
  }
  if (
    sections.map(({ heading }) => heading).join("|") !== "Where I stopped|Unresolved|Suggested next"
  )
    return null;
  const [stoppedAt, unresolved, nextStep] = sections.map(({ lines }) => lines.join("\n").trim());
  return stoppedAt && unresolved && nextStep ? { stoppedAt, unresolved, nextStep } : null;
}
