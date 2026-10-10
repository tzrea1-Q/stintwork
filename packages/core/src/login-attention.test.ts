import { expect, test } from "vitest";
import type { AgentProfile } from "./agents.js";
import { deriveAttentionItems } from "./attention.js";
import { indexProject } from "./project.js";
import { createMemoryRepoFiles } from "./work-items.js";

const profile: AgentProfile = {
  id: "claude",
  displayName: "Claude Code",
  installationHint: "Install Claude Code",
  capabilities: {
    modes: ["default"],
    defaultMode: "default",
    additionalDirectories: true,
    permissionOptions: [],
    declineEndsTurn: false,
    authenticationRequired: {
      message: "Authentication required",
      loginCommand: "claude auth login",
    },
    configOptions: [],
  },
  availability: {
    available: false,
    kind: "login-required",
    checkedAt: "2026-10-09T10:00:00Z",
    reason: "Sign in with claude auth login.",
  },
};

test.each([
  profile,
  {
    ...profile,
    id: "other-agent",
    displayName: "Other Agent",
    capabilities: {
      ...profile.capabilities,
      authenticationRequired: { message: "Authentication required", loginCommand: "other login" },
    },
    availability: {
      ...profile.availability,
      available: false,
      reason: "Sign in with other login.",
    },
  },
])(
  "$id login attention is agent-wide, stable across snapshot rebuilds, and disappears after login",
  (profile) => {
    const snapshot = indexProject(createMemoryRepoFiles({}), {
      name: "Project",
      agents: [profile],
    });
    expect(snapshot.attentionItems).toEqual([
      {
        kind: "login-required",
        id: `login-required:${JSON.stringify(profile.id)}`,
        agent: profile.id,
        workItem: null,
        ticket: null,
        stintId: null,
        title: `${profile.displayName} needs a login`,
        details: profile.availability?.reason,
        raisedAt: "2026-10-09T10:00:00Z",
        loginCommand: profile.capabilities.authenticationRequired.loginCommand,
      },
    ]);
    expect(deriveAttentionItems(snapshot)).toEqual(snapshot.attentionItems);
    expect(
      deriveAttentionItems({
        ...snapshot,
        agents: [{ ...profile, availability: { available: true } }],
      }),
    ).toEqual([]);
    const later = deriveAttentionItems({
      ...snapshot,
      agents: [
        {
          ...profile,
          availability: {
            available: false,
            kind: "login-required",
            checkedAt: "2026-10-09T11:00:00Z",
          },
        },
      ],
    });
    expect(later[0].id).toBe(snapshot.attentionItems[0].id);
  },
);

test.each([
  undefined,
  { available: true },
  { available: false, kind: "missing-executable" as const },
  { available: false, kind: "check-failed" as const },
])("only a confirmed missing login produces login attention: %j", (availability) => {
  expect(deriveAttentionItems({ workItems: [], agents: [{ ...profile, availability }] })).toEqual(
    [],
  );
});
