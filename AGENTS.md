# Working on Stintwork

Stintwork is a local workbench for taking software work through guided workflows, handing it between coding agents in stints.

Read before any change:

- `GLOSSARY.md`: the product's vocabulary. Name types, files, UI copy and tickets with these terms.
- `docs/plan.md`: milestones, architecture and open questions. Work belongs to the current milestone.
- `docs/adr/`: decisions already made. Change one only through a new decision record that supersedes it.
- `docs/brief.md`: the product brief, for the why behind a feature.

## Agent skills

### Issue tracker

Local Markdown under `.scratch/`; Stintwork dogfoods this format. See `docs/agents/issue-tracker.md`.

Tests that read this repo's own `.scratch/` must assert only properties that stay true as the plan grows: tickets parse, there are no warnings, and tickets are in dependency order. Put exact statuses and ticket counts in fixtures.

### Domain docs

Single context: `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.

## Reference material

- `prototype/` (tag `prototype-ui-v1`): throwaway UI prototype with fake data. Variant B is the chosen Pipeline view. Treat it as a design reference to rebuild from, never as code to import.
- `spikes/acp-probe/`: probe of what each agent supports over ACP. Rerun it when adapter versions change.
- `docs/research/`: dated findings. Each file records what was true on its date.
