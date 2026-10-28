// SPDX-License-Identifier: Apache-2.0

export type GithubEvidenceInput = {
  parentId: string;
  body: string;
  tickets: {
    id: string;
    body: string;
    state: string;
    stateReason: string | null;
    labels: string[];
    blockers: { id: string; state: string }[];
    commentRecords: { id: string; body: string }[];
  }[];
};

/** Version 1 uses JSON property order below and ordinal UTF-16 identity ordering. */
export function githubEvidenceJson(
  input: GithubEvidenceInput,
  includeTickets: boolean,
  triageLabels: readonly string[] = [],
): string {
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const roles = new Set(triageLabels.map((label) => label.toLowerCase()));
  return JSON.stringify({
    version: 1,
    parentId: input.parentId,
    body: input.body,
    ...(includeTickets
      ? {
          tickets: [...input.tickets]
            .sort((a, b) => compare(a.id, b.id))
            .map((ticket) => ({
              id: ticket.id,
              body: ticket.body,
              state: ticket.state,
              stateReason: ticket.stateReason,
              labels: ticket.labels
                .map((label) => label.toLowerCase())
                .filter((label) => roles.has(label))
                .sort(compare),
              blockers: [...ticket.blockers]
                .sort((a, b) => compare(a.id, b.id))
                .map(({ id, state }) => ({ id, state })),
              comments: [...ticket.commentRecords]
                .sort((a, b) => compare(a.id, b.id))
                .map(({ id, body }) => ({ id, body })),
            })),
        }
      : {}),
  });
}

export async function githubEvidenceDigest(
  input: GithubEvidenceInput,
  includeTickets: boolean,
  triageLabels: readonly string[] = [],
): Promise<string> {
  const bytes = new TextEncoder().encode(githubEvidenceJson(input, includeTickets, triageLabels));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
