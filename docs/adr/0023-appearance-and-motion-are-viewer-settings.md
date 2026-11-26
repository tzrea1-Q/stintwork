<!-- SPDX-License-Identifier: Apache-2.0 -->
# Appearance and motion are viewer settings

Status: accepted 2026-11-26 at the maintainer's request.

The maintainer needs to inspect the interface in both colour schemes and motion levels without changing operating system settings. These are viewer preferences, not project state (ADR 0006).

## Decision

Settings offers Appearance (System, Light, Dark) and Motion (System, Full, Reduced). Both default to System and are stored per browser in localStorage. System follows the corresponding operating system preference live. The effective theme sets `.dark` on `<html>`; the effective motion sets `data-motion` there and controls both Motion and CSS. Reduced motion removes movement and scale while retaining fades and colour changes.

## Consequences

This partly supersedes ADR 0019's decision against a theme switch and ADR 0022's operating-system-only motion preference. Preferences remain local to the viewer and are not sent to the server. Inaccessible or invalid storage falls back to System.
