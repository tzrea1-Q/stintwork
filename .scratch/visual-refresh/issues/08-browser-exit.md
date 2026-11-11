<!-- SPDX-License-Identifier: Apache-2.0 -->
# 08 — Browser suite and M14 exit

Status: ready-for-agent
Blocked by: 03, 04, 05, 06, 07

## What to build

Cover every screen and state in the browser suite, including Overview, Pipeline and detail, Needs you, command palette, brief preview and every dialog and overlay. Check long content, loading, empty and error states, intentional scroll containers, clipping and 16px overlay gutters. Save screenshots as review artifacts, not pixel comparisons. Fix findings and record actual checks in Comments.

The maintainer walks Overview, Pipeline with the detail panel, Needs you and every dialog at 1440, 768 and 390px in both languages and accepts the result before M14 exits.

Scope: Browser coverage, fixes required for acceptance, screenshots and maintainer exit evidence.

## Acceptance criteria

- [ ] The browser suite passes at 1440, 1024, 768 and 390px in `en` and `zh-CN` in both light and dark; minimum supported width is 360px.
- [ ] Comments record the maintainer acceptance walk at 1440, 768 and 390px in both languages and actual suite results.
- [ ] Browser checks for changed screens cover 1440, 1024, 768 and 390px in `en` and `zh-CN`, with light and dark at 1440 and 390px. Screenshots are review artifacts; layout supports at least 360px.
- [ ] Comments record actual behaviour and browser checks and coordinator review at 1440 and 390px in both languages before merging.
