<!-- SPDX-License-Identifier: Apache-2.0 -->
# Work surfaces drop page titles, and work item detail can go full screen

Status: accepted 2026-11-23 by the maintainer.

On 2026-11-23 the maintainer reviewed the M15 build on this repository's real data at 1440px. The Overview and Pipeline page headers (breadcrumb, 39px title, count, subtitle and connection status) took about 140px and repeated the top bar's pill navigation. The 432px detail panel showed a 4,850px single column holding the gate, the full spec, every ticket body and stint history.

## Decision

Overview and Pipeline have no page header. The top bar's pill navigation names the current view. Pipeline's work counts and connection status join the board toolbar; Overview's connection status sits at the top right of its first card row. Page title rules for these two views are removed. Dialogs and other surfaces keep their titles.

Work item detail stays a docked panel beside the Pipeline board at 1024px and wider, with a Sheet below. The docked panel opens at about 560px, can be resized by pointer and keyboard, and remembers its width per viewer. It can also expand to fill the area below the top bar and collapse back. Detail content is organised in tabs (Overview, Spec, Tickets, Stints) instead of one long column, in every container.

Stage columns without work items collapse to narrow rails that still show the icon, name and count.

This supersedes only the page title rule and the docked-only detail rule of [ADR 0019](0019-the-web-ui-adopts-shadcn-ui-and-a-new-visual-language.md). Its components, tokens, colours, dark scheme, top bar, Overview content and testing rules still hold. Variant D remains the visual reference wherever this record does not differ.
