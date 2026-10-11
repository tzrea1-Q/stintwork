# Stintwork

A local, open-source workbench for building software with coding agents. Open any repo, see what you're building and what's next, and take each piece of work through a guided workflow with whichever agent you choose (Claude Code or Codex; Grok Build support is experimental and not yet verified end to end), without re-explaining the project. Agents work in stints and hand over; the work continues.

**Status:** planning. There is no production code yet.

## What's here

| Path | What it is |
|---|---|
| [`docs/plan.md`](docs/plan.md) | Production plan: architecture, milestones M1–M5 to v0.1, risks, open questions |
| [`GLOSSARY.md`](GLOSSARY.md) | The product's vocabulary (work item, stage, stint, brief, handoff, checkpoint…) |
| [`docs/adr/`](docs/adr/) | Decision records |
| [`docs/brief.md`](docs/brief.md) | The v1 product brief: concepts, on-disk format, workflows, architecture, scope |
| [`docs/research/2026-10-09-spikes.md`](docs/research/2026-10-09-spikes.md) | Results of the ACP connection test and the brief/handoff test |
| [`prototype/`](prototype/) | Throwaway UI prototype: three variants (A Lists, B Pipeline, C Cockpit) over fake data. B was chosen as the primary view |
| [`spikes/acp-probe/`](spikes/acp-probe/) | ACP probe harness for checking what each agent supports |

## Run the prototype

```bash
cd prototype && pnpm install && pnpm dev
```

Open http://localhost:5199 and switch variants with ← / →.

## Run the ACP probe

```bash
cd spikes/acp-probe && pnpm install && node probe.mjs --agent codex --scenario all
```

Each agent needs its own CLI login (`claude auth login`, `codex login`, `grok login`).
