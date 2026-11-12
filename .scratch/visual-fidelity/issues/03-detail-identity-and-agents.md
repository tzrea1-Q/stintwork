<!-- SPDX-License-Identifier: Apache-2.0 -->
# 03 — Detail identity and agents by stage

Status: ready-for-agent
Blocked by: 01

## What to build

Rebuild the work item detail header as Variant D's identity block: a tinted panel with the 18px title, milestone, workflow and branch chip.

In the property list, show the current stage's agent as one "Agent for this stage" row. Move the per-stage agent selects into a collapsed "Agents by stage" disclosure. Keep every behaviour: inferred markers, disabled states, saving, errors and keyboard access.

Keep the docked panel at 1024px and wider and the Sheet below it. Keep the gate, handoff, stint history and the bounded footer.

Scope: `WorkItemDrawer`, `StageAgentRail` and their tests.

## Acceptance criteria

- [ ] The identity block and property rows match D; the first screen of the panel at 1440x900 shows identity, properties and the gate without scrolling past agent selects.
- [ ] Changing any stage's agent still works from the disclosure, with existing tests passing and a test for the collapsed default.
- [ ] The browser suite passes at 1440, 1024, 768, 390 and 360px in `en` and `zh-CN`, with light and dark at 1440 and 390px.
- [ ] Comments include side-by-side screenshots with Variant D at 1440 and 390px in both languages, on the rich fixture and on this repository's data, and the coordinator's review against D.
