// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { symlinkSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAgentRegistry, type AgentLauncher } from "@stintwork/agents";
import {
  createFakeAgentLauncher,
  fakeAgentProfiles,
  type FakeAgentStep,
} from "@stintwork/agents/testing";
import {
  permissionLevels,
  permissionPolicy,
  type Brief,
  type ProjectSnapshot,
  type Stint,
  type StintLogEntry,
} from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { createProjectServer } from "./index.js";

const fixtures: { parent: string; project: ReturnType<typeof createProjectServer> }[] = [];
afterEach(async () => {
  for (const { parent, project } of fixtures.splice(0).reverse()) {
    await project.stop();
    if (parent) await rm(parent, { recursive: true, force: true });
  }
});

async function fixture(profile: keyof typeof fakeAgentProfiles, launch: AgentLauncher) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-permission-level-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  for (const [path, text] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    ".gitignore": ".stintwork/local/\n",
    ".scratch/first/workflow.yaml": "workflow: feature\nstage: implement\n",
    ".scratch/first/spec.md": "# First",
    ".scratch/first/issues/01-first.md": "# First\nStatus: ready-for-agent\nBlocked by: none",
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync(
    "git",
    ["-c", "user.name=Tests", "-c", "user.email=tests@example.invalid", "commit", "-qm", "Fixture"],
    { cwd: root },
  );
  const project = createProjectServer(root, join(root, "web"), {
    agentRegistry: createAgentRegistry([{ ...fakeAgentProfiles[profile], launch }]),
  });
  fixtures.push({ parent, project });
  return { root, project };
}

function post(project: ReturnType<typeof createProjectServer>, path: string, body: unknown) {
  return project.app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function history(
  project: ReturnType<typeof createProjectServer>,
  id: string,
): Promise<Stint> {
  return (await (await project.app.request(`/api/stints/${id}`)).json()).stint;
}

test.each(["edit-freely", "ask"] as const)(
  "Claude %s logs safe-command decisions and queues manual requests",
  async (level) => {
    const offered = fakeAgentProfiles.claude.capabilities.permissionOptions ?? [];
    const allow = offered.find((option) => option.kind === "allow_once");
    expect(allow).toBeDefined();
    const cases: {
      command: string | string[];
      automatic: boolean;
      withoutCwd?: boolean;
      description?: string;
      kind?: "execute";
    }[] = [
      {
        command: 'pnpm vitest run packages/cli 2>&1 | grep -E "AssertionError|Expected" | head',
        description: "Show the failing assertion",
        withoutCwd: true,
        automatic: true,
      },
      {
        command: "pnpm format:check 2>&1 | head -30",
        description: "Show formatting errors",
        withoutCwd: true,
        kind: "execute",
        automatic: true,
      },
      { command: "cat .scratch/first/spec.md", automatic: true },
      { command: "git status && git diff | head -n 20", automatic: true },
      { command: "pnpm test", automatic: true },
      { command: ["pnpm", "exec", "vitest", "run"], automatic: true },
      { command: "cat inside-link/spec.md", automatic: true },
      { command: "cat ../outside", withoutCwd: true, automatic: false },
      { command: "cat file > ../outside", automatic: false },
      { command: "git status && curl https://example.invalid", automatic: false },
      { command: "cd ../outside && cat file", automatic: false },
      { command: "cat file | unknown", automatic: false },
      { command: "pnpm install", automatic: false },
      { command: "cat outside-link/spec.md", withoutCwd: true, automatic: false },
    ];
    const launch: AgentLauncher = (options) => {
      symlinkSync(join(options.cwd, ".scratch/first"), join(options.cwd, "inside-link"));
      symlinkSync(dirname(options.cwd), join(options.cwd, "outside-link"));
      return createFakeAgentLauncher(
        [
          ...cases.map(
            ({ command, withoutCwd, description, kind }, index): FakeAgentStep => ({
              type: "permission",
              toolCall: {
                toolCallId: `command-${index}`,
                kind,
                rawInput: {
                  ...(kind ? {} : { name: "Bash" }),
                  command,
                  description,
                  ...(withoutCwd ? {} : { cwd: options.cwd }),
                },
              },
              expectedOptionId: allow?.optionId,
            }),
          ),
          { type: "message", text: "All command answers reached Claude." },
        ],
        [],
        { profile: "claude" },
      )(options);
    };
    const { root, project } = await fixture("claude", launch);
    const response = await post(project, "/api/stints", {
      workItem: "first",
      ticket: 1,
      agent: "claude",
      permissionLevel: level,
    });
    expect(response.status).toBe(201);
    const { stint }: { stint: Stint } = await response.json();
    for (const [index, entry] of cases.entries()) {
      const automatic = level === "edit-freely" && entry.automatic;
      let requestId = "";
      await expect
        .poll(async () => {
          const request = (await history(project, stint.id)).events.find(
            (event) =>
              event.type === "permission_request" && event.toolCallId === `command-${index}`,
          );
          if (request?.type === "permission_request") {
            requestId = request.requestId;
            expect(request.automatic).toBe(automatic);
          }
          return !!requestId;
        })
        .toBe(true);
      const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
      const queued = snapshot.attentionItems.find(
        (item) => item.kind === "permission" && item.requestId === requestId,
      );
      if (automatic) expect(queued).toBeUndefined();
      else {
        expect(queued).toMatchObject({ kind: "permission", stintId: stint.id, options: offered });
        expect(
          (
            await post(project, `/api/stints/${stint.id}/permissions/${requestId}`, {
              optionId: allow?.optionId,
            })
          ).status,
        ).toBe(200);
      }
      await expect
        .poll(async () =>
          (await history(project, stint.id)).events.find(
            (event) => event.type === "permission" && event.requestId === requestId,
          ),
        )
        .toMatchObject({
          automatic,
          decision: { outcome: "selected", optionId: allow?.optionId, kind: "allow_once" },
        });
    }
    await expect.poll(async () => (await history(project, stint.id)).status).toBe("finished");
    const entries: StintLogEntry[] = (
      await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    for (const eventType of ["permission_request", "permission"]) {
      expect(
        entries.flatMap((entry) =>
          entry.type === "event" &&
          (entry.event.type === "permission_request" || entry.event.type === "permission") &&
          entry.event.type === eventType
            ? [entry.event.automatic]
            : [],
        ),
      ).toEqual(cases.map(({ automatic }) => level === "edit-freely" && automatic));
    }
  },
  30_000,
);

test("Claude auto-answers a no-cwd check chain with exit-status echoes at Edit freely", async () => {
  const { root, project } = await fixture(
    "claude",
    createFakeAgentLauncher(
      [
        {
          type: "permission",
          toolCall: {
            toolCallId: "check-chain",
            kind: "execute",
            rawInput: {
              command:
                'pnpm test; echo "exit=$?"; pnpm lint; echo "exit=$?"; pnpm build; echo "exit=$?"',
              description: "Check tests, lint and build",
            },
          },
          options: [{ optionId: "allow-once", name: "Allow", kind: "allow_once" }],
          expectedOptionId: "allow-once",
        },
      ],
      [],
      { profile: "claude" },
    ),
  );
  const response = await post(project, "/api/stints", {
    workItem: "first",
    ticket: 1,
    agent: "claude",
    permissionLevel: "edit-freely",
  });
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  await expect.poll(async () => (await history(project, stint.id)).status).toBe("finished");
  const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  expect(
    snapshot.attentionItems.filter(
      (item) => item.kind === "permission" && item.stintId === stint.id,
    ),
  ).toEqual([]);
  const entries: StintLogEntry[] = (
    await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(entries).toContainEqual(
    expect.objectContaining({
      type: "event",
      event: expect.objectContaining({
        type: "permission_request",
        toolCallId: "check-chain",
        automatic: true,
      }),
    }),
  );
  expect(entries).toContainEqual(
    expect.objectContaining({
      type: "event",
      event: expect.objectContaining({
        type: "permission",
        toolCallId: "check-chain",
        automatic: true,
        decision: { outcome: "selected", optionId: "allow-once", kind: "allow_once" },
      }),
    }),
  );
});

test.each(Object.keys(fakeAgentProfiles) as (keyof typeof fakeAgentProfiles)[])(
  "%s applies every level, forwards outside paths, exposes options, and persists automatic answers",
  async (profile) => {
    for (const level of permissionLevels) {
      const offered = fakeAgentProfiles[profile].capabilities.permissionOptions ?? [
        { optionId: "always", name: "Always", kind: "allow_always" as const },
        { optionId: "once", name: "Once", kind: "allow_once" as const },
        { optionId: "reject", name: "No", kind: "reject_once" as const },
      ];
      const allow = offered.find((option) => option.kind === "allow_once");
      expect(allow).toBeDefined();
      const launch: AgentLauncher = (options) => {
        const script: FakeAgentStep[] = [
          { type: "expect-mode", mode: permissionPolicy(fakeAgentProfiles[profile], level).mode },
          ...[
            { toolCallId: "edit", kind: "edit" as const, rawInput: { path: "file.txt" } },
            {
              toolCallId: "command",
              kind: "execute" as const,
              rawInput: { command: "printf text > file.txt", cwd: options.cwd },
            },
            {
              toolCallId: "outside-edit",
              kind: "edit" as const,
              rawInput: { path: join(options.cwd, "../outside.txt") },
            },
            {
              toolCallId: "outside-command",
              kind: "execute" as const,
              rawInput: { command: "wc file.txt", cwd: dirname(options.cwd) },
            },
          ].map(
            (toolCall): FakeAgentStep => ({
              type: "permission",
              toolCall,
              options: [...offered],
              expectedOptionId: allow?.optionId,
            }),
          ),
          { type: "message", text: "All four answers reached the agent." },
        ];
        return createFakeAgentLauncher(script, [], { profile })(options);
      };
      const { root, project } = await fixture(profile, launch);
      const response = await post(project, "/api/stints", {
        workItem: "first",
        ticket: 1,
        agent: profile,
        permissionLevel: level,
      });
      expect(response.status).toBe(201);
      const { stint }: { stint: Stint } = await response.json();
      expect(stint.brief.permissionLevel).toBe(level);
      const automatic = [level !== "ask", level === "autonomous", false, false];
      for (const [index, toolCallId] of [
        "edit",
        "command",
        "outside-edit",
        "outside-command",
      ].entries()) {
        let requestId = "";
        await expect
          .poll(async () => {
            const current = await history(project, stint.id);
            const request = current.events.find(
              (event) => event.type === "permission_request" && event.toolCallId === toolCallId,
            );
            if (request?.type === "permission_request") requestId = request.requestId;
            return !!requestId;
          })
          .toBe(true);
        if (!automatic[index]) {
          const snapshot: ProjectSnapshot = await (
            await project.app.request("/api/project")
          ).json();
          const item = snapshot.attentionItems.find(
            (item) => item.kind === "permission" && item.requestId === requestId,
          );
          expect(item).toMatchObject({ kind: "permission", options: offered, stintId: stint.id });
          expect(
            (
              await post(project, `/api/stints/${stint.id}/permissions/${requestId}`, {
                optionId: allow?.optionId,
              })
            ).status,
          ).toBe(200);
        }
        await expect
          .poll(async () =>
            (await history(project, stint.id)).events.find(
              (event) => event.type === "permission" && event.requestId === requestId,
            ),
          )
          .toMatchObject({
            automatic: automatic[index],
            decision: { outcome: "selected", optionId: allow?.optionId, kind: "allow_once" },
          });
      }
      await expect.poll(async () => (await history(project, stint.id)).status).toBe("finished");
      expect((await history(project, stint.id)).events).toContainEqual(
        expect.objectContaining({ type: "message", text: "All four answers reached the agent." }),
      );
      const log: StintLogEntry[] = (
        await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8")
      )
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(
        log
          .filter((entry) => entry.type === "event" && entry.event.type === "permission")
          .map(
            (entry) =>
              entry.type === "event" && entry.event.type === "permission" && entry.event.automatic,
          ),
      ).toEqual(automatic);
    }
  },
  30_000,
);

test("a project default is created only on change, preserved across reopen, and overridden per stint", async () => {
  const { root, project } = await fixture(
    "codex",
    createFakeAgentLauncher([{ type: "expect-mode", mode: "read-only" }]),
  );
  const endpoint = "/api/work-items/first/tickets/1/brief-preview";
  const preview: Brief = await (await project.app.request(endpoint)).json();
  expect(preview.permissionLevel).toBe("edit-freely");
  await expect(readFile(join(root, ".stintwork/config"), "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(
    (await post(project, "/api/project/permission-level", { permissionLevel: "autonomous" }))
      .status,
  ).toBe(200);
  expect((await (await project.app.request(endpoint)).json()).permissionLevel).toBe("autonomous");
  await writeFile(
    join(root, ".stintwork/config"),
    "other: retained\npermissionLevel: autonomous\n",
  );
  expect(
    (await post(project, "/api/project/permission-level", { permissionLevel: "edit-freely" }))
      .status,
  ).toBe(200);
  expect(await readFile(join(root, ".stintwork/config"), "utf8")).toContain("other: retained");
  const response = await post(project, "/api/stints", {
    workItem: "first",
    ticket: 1,
    permissionLevel: "ask",
  });
  expect(response.status).toBe(201);
  const { stint } = await response.json();
  expect(stint.brief.permissionLevel).toBe("ask");
  await expect.poll(async () => (await history(project, stint.id)).status).toBe("finished");
  await project.stop();
  const reopened = createProjectServer(root, join(root, "web"), {
    agentRegistry: createAgentRegistry([
      { ...fakeAgentProfiles.codex, launch: createFakeAgentLauncher([]) },
    ]),
  });
  fixtures.push({ parent: "", project: reopened });
  expect((await history(reopened, stint.id)).brief.permissionLevel).toBe("ask");
  expect((await (await reopened.app.request("/api/project")).json()).permissionLevel).toBe(
    "edit-freely",
  );
});

test("invalid defaults, malformed choices and symlinked configuration never change files or start a stint", async () => {
  const { root, project } = await fixture("codex", createFakeAgentLauncher([]));
  for (const permissionLevel of ["unknown", null, 1, {}]) {
    expect((await post(project, "/api/project/permission-level", { permissionLevel })).status).toBe(
      400,
    );
    expect(
      (await post(project, "/api/stints", { workItem: "first", ticket: 1, permissionLevel }))
        .status,
    ).toBe(400);
  }
  expect(
    (
      await project.app.request("/api/project/permission-level", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://untrusted.invalid" },
        body: '{"permissionLevel":"ask"}',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await project.app.request("/api/project/permission-level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    ).status,
  ).toBe(400);
  expect(
    (await project.app.request("/api/project/permission-level", { method: "POST", body: "{}" }))
      .status,
  ).toBe(400);
  await mkdir(join(root, ".stintwork"), { recursive: true });
  const config = join(root, ".stintwork/config");
  await writeFile(config, "permissionLevel: bypass\n");
  expect((await project.app.request("/api/work-items/first/tickets/1/brief-preview")).status).toBe(
    409,
  );
  expect((await post(project, "/api/stints", { workItem: "first", ticket: 1 })).status).toBe(409);
  expect(
    (await post(project, "/api/project/permission-level", { permissionLevel: "ask" })).status,
  ).toBe(503);
  expect(await readFile(config, "utf8")).toBe("permissionLevel: bypass\n");
  await rm(config);
  const outside = join(root, "outside-config");
  await writeFile(outside, "permissionLevel: autonomous\n");
  await symlink(outside, config);
  expect(
    (await post(project, "/api/project/permission-level", { permissionLevel: "ask" })).status,
  ).toBe(503);
  expect(await readFile(outside, "utf8")).toBe("permissionLevel: autonomous\n");
});
