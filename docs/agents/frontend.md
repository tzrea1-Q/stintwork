# Frontend

ui-foundations 01 creates `src/ui/`, `packages/web/src/styles/tokens.css` and the e2e harness described here.

## Stack and source

Read `packages/web/package.json` for dependencies and scripts, ADR 0010, ADR 0019 and ADR 0022 for frontend decisions, and `GLOSSARY.md` for product terms. Use React views built by Vite and styled with Tailwind. Keep wrapped primitives in `packages/web/src/ui/`, icons in lucide-react, the command palette in cmdk, animation in Motion with the tokens in `src/ui/motion.ts`, and catalogs in `packages/web/src/i18n/`. Views read state and send actions through the existing layer (ADR 0006).

## Components

Use a `src/ui/` component for every menu, popover, dialog, sheet, tooltip and select. Use the shadcn/ui CLI with `packages/web/components.json`: `radix-nova`, the Radix variant of shadcn’s current default style, components in `packages/web/src/ui/` and the existing `cn` alias. CLI v4 rejected `new-york` together with a separate base key on 2026-11-10. Stay on React 18 and use the unified `radix-ui` package. Read official source with `pnpm dlx shadcn@4.23.0 view <name>` and adapt it into `src/ui/` with local `cn`, our tokens and no `next-themes`; use `add --dry-run` to inspect dependencies and re-run `view` and diff when reviewing updates. Do not use `add`: on 2026-11-10 registry items depended on the npm package `cn` and sonner also depended on `next-themes`. Add a behaviour test for each component. Use the shared `cn` helper to combine classes.

Let Radix handle overlay positioning, focus, Escape and outside-click dismissal. Put any feature-specific dismissal condition, such as a pending save, in the primitive's event hooks. Keep nested overlays dismissing only the topmost layer and returning focus to the right trigger.

### Choosing a container

Use Popover for glanceable information and single immediate actions. Use Dialog for multi-step tasks, forms and anything that writes files or commits. Use a resizable docked panel for a work item alongside the Pipeline board at 1024px and wider, with a full-screen mode below the top bar (ADR 0020); use Sheet below 1024px and for a queue. Use Tooltip only for labels.

## Tokens and styling

Take colours, radius, spacing, type scale and shadows from `packages/web/src/styles/tokens.css` through Tailwind theme classes. Use shadcn names: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `chart-1`–`chart-5`, their shadcn `-foreground` counterparts and `--radius`. Add `running`, `attention`, `blocked`, `success`, `stopped` and agent identity colours with soft variants. Use OKLCH values based on the prototype. Light and dark are designed separately. Set `.dark` on `<html>` from the viewer’s Appearance setting, which follows `prefers-color-scheme` under System (ADR 0023).

Bundle Geist and Geist Mono with `@fontsource-variable/*`, using the CJK system fallback stack. Do not load fonts remotely. Put utilities in `className`. Keep feature CSS only for styling utilities cannot express, and record the reason beside the retained rule.

## Visual language

- Match Variant D at tag `prototype-visual-v1` (see `AGENTS.md`), a design reference to rebuild from, never code to import.
- Use a grey canvas, white rounded cards with large radii and soft shadows. Give each control type a consistent `src/ui/` variant; feature styling belongs on layout and content.
- Put one near-black pill primary action on each surface. Reserve violet for selection and focus.
- Render statuses as shared soft-tinted chips with dots. Use 36px round tinted icon chips in list rows, property rows with icon, muted label and value, and segmented progress for counts.
- Use a 14px base and large tabular numerals for counts. Overview and Pipeline have no page header; dialogs keep their titles (ADR 0020). Use spacing tokens in 4px steps and lucide-react icons at token-defined sizes. Give every icon-only button a tooltip matching its accessible name.
- Use the danger variant and a confirmation step for irreversible actions. Toasts report action results; show Undo only when the action really can be reversed. None can today.
- Use a top bar with project and branch, centred Overview and Pipeline pill navigation, Jump to, Needs you and Settings; no sidebar. Overview is home and shows only existing snapshot data or its derivations. Omit unavailable cards. Pipeline has stage columns, with empty columns collapsed to rails, and a docked detail panel at 1024px and wider; below that detail uses a Sheet. Detail content uses tabs (Overview, Spec, Tickets, Stints) in every container.
- Keep existing roadmap editor, setup, customise, review, gate and brief preview entry points and behaviour. Disclose secondary details in a panel, popover or expandable section so the board stays scannable.

## Motion

Motion is expressive within a frequency gate (ADR 0022). Use Motion (`motion/react`, through `LazyMotion` and `m.*` components) and CSS transitions only. Animate UI is a reference for ideas; never install, import or copy its code.

**Tokens.** Every timing comes from `packages/web/src/ui/motion.ts`. CSS reads the same values as `--motion-*` custom properties in `tokens.css`, and a unit test keeps the two in sync. Never hand-type a duration, curve, spring or distance in feature code. A new role needs a new token, added here first.

| Token | Value | Role |
|---|---|---|
| `spring.press` | visualDuration 0.15, bounce 0.3 | Press feedback: scale 0.97 for controls, 0.985 for cards and rows |
| `spring.pop` | 0.25, bounce 0.25 | Popover, tooltip, menu and select content growing from the trigger |
| `spring.selection` | 0.3, bounce 0.2 | Tab, pill navigation and toggle group indicators gliding between items |
| `spring.surface` | 0.4, bounce 0.15 | Dialog content |
| `spring.layout` | 0.45, bounce 0.15 | Cards and containers moving or resizing: stage changes, rails, board reflow, full screen |
| `spring.arrive` | 0.5, bounce 0.3 | Items arriving: a new card, a stream message, the first-load stagger |
| `spring.celebrate` | 0.6, bounce 0.45 | Rare moments only: a check popping, a work item shipped |
| `spring.number` | 0.8, bounce 0 | Counts rolling and progress filling |
| `tween.color` | 150ms, `ease` | Hover and colour changes (CSS) |
| `tween.fade` | 200ms, ease-out `cubic-bezier(0.23, 1, 0.32, 1)` | Fades in place |
| `tween.menu` | 180ms, ease-soft `cubic-bezier(0.215, 0.61, 0.355, 1)` | Command palette and menus opened from the keyboard all day |
| `tween.overlay` | 300ms, ease-soft | Backdrops dimming and clearing |
| `tween.sheet` | 400ms, ease-soft | Sheets and the docked panel sliding against an edge |
| `tween.disclosure` | 300ms, ease-soft | Disclosure height |
| `tween.swap` | 180ms, ease-out | A label, icon or status chip swapping in place, through `blur.swap` |
| `tween.dismiss` | 180ms, ease-away `cubic-bezier(0.33, 0.17, 0.67, 0.5)` | Dialogs, sheets and toasts dismissed |
| `scale` | tooltip 0.8, popover and menu 0.9, dialog 0.92, palette 0.96, removed card 0.96 | Starting scales |
| `shift` | panel 6px, arrive 12px | Travel distances |
| `blur` | swap 2px, surface 6px | Blur that bridges a swap or an arrival |
| `stagger` | 35ms per item, at most 12 items and 300ms in total | Groups arriving together, in rare moments only |

**Frequency gate.**

| How often | Examples | Motion |
|---|---|---|
| All day | Press, tabs, pill navigation, toggle groups, menus, selects, tooltips, hover, Jump to | `press`, `selection`, `pop` or `tween.menu`. Settled within 250ms, no stagger, closing no slower than opening. A warm tooltip, shown within 500ms of the last, appears at once. |
| Occasional | Dialogs, sheets, the Needs you queue, the docked panel, full screen, disclosures, toasts | `surface`, `tween.sheet`, `tween.disclosure`, `tween.overlay` in; `tween.dismiss` out |
| Continuity | A card changing stage, rails expanding, the board reflowing beside the panel, counts and progress | `spring.layout` and `spring.number` |
| Rare moments | First board load, ticket resolved, gate approved, work item shipped, Needs you count rising | `arrive`, `celebrate` and `stagger`. This is where the expressive level shows. |

**Rules.**

- Animate `transform`, `opacity` and `filter`. Animate height only in disclosures. Never animate `width`, `top`, `left` or `margin`; use layout animation, which moves by transform.
- Anchored overlays grow from their trigger through Radix's `--radix-*-content-transform-origin`. Dialogs scale from the centre. Sheets and the docked panel slide from their edge.
- Exits are quicker than entrances and leave the way they came. Never use ease-in on something entering, or ease-in-out on an entrance.
- Press scales on pointer down and on Enter or Space. Hover never scales; it changes colour, background, border or shadow.
- Re-triggering retargets from the current value and never restarts. The keyboard animates like the pointer.
- Text never scales. Changing text and status chips fade and blur through `tween.swap`. Containers that resize use layout animation with `layout` on their children, so nothing stretches.
- A card's content is not a layout node of its own: the card only animates position, and toggling a child's layout off in the render that moves it leaves one frame of stale projection.
- Motion never blocks input or focus. Controls stay usable mid-animation, focus moves into a dialog at once, and switching tabs shows the new panel without waiting for the old one to leave.
- Live updates: when one snapshot changes more than 12 cards, or the document is hidden, skip continuity and jump to the result. Only running indicators loop. Loops pause off screen and when the document is hidden.
- Reduced motion: set `MotionConfig reducedMotion` from the viewer’s Motion setting (`user`, `always` or `never`) and use the effective `data-motion` attribute on `<html>` for CSS (ADR 0023). Under reduced motion, drop transform, travel, scale, blur and stagger, and keep fades, colour changes and spinners. CSS reduced-motion rules use `[data-motion="reduced"]`.
- Keep the Radix element as the animated element (`asChild` with `forceMount` under `AnimatePresence`), so `data-state`, focus and dismissal still work.

**Tests.** jsdom tests run with `MotionGlobalConfig.skipAnimations` set in `src/test-setup.ts`. Browser suites run with `reducedMotion: "reduce"` by default. `e2e/motion.spec.ts` runs with motion on and samples frames to check that:

- elements are mid-flight partway through and at rest afterwards;
- origins sit at the trigger;
- exits finish within their token;
- a quick double trigger ends in the right state;
- the page has no horizontal overflow during motion;
- under reduced motion, no transform runs while fades still play.

Before merging, the coordinator watches changed motion at normal speed and at 10% playback speed in Chrome DevTools.

## Layout and states

Check 1440, 1024, 768 and 390px; support a minimum width of 360px. Keep the page free of horizontal scroll at those widths. Wrap or collapse toolbars deliberately. Keep overlays within the viewport with a 16px gutter, and scroll their content when it exceeds the available height.

Let text containers fit English and Chinese without fixed widths tied to one language. Truncate long names deliberately and expose their full text in a title or tooltip. Keep long diff lines and code in their own scroll containers rather than widening the page.

Handle loading, empty, error and long content in each view. Keep recovery actions and essential controls visible in each state.

## Copy and accessibility

Put every visible UI string, including accessible labels and errors, in both the `en` and `zh-CN` catalogs. Use `GLOSSARY.md` terms. Render core and server text through the catalog's `coreText` entries and the existing i18n helpers. Keep developer-authored names and content intact.

Give every control an accessible name. Make every action work with the keyboard and keep focus visible.

## Tests and review

Keep behaviour tests in jsdom with Testing Library, following the adjacent tests. Cover keyboard use, focus return and dismissal as well as the feature's action.

Put layout tests in `packages/web/e2e/`. Use the harness from ticket 01: a fixture project, server start and a layout-check helper. Assert no horizontal page overflow, overlays within the 16px viewport gutter, and no accidentally clipped text. For deliberate truncation, check that the full text is available; exercise intentional scroll containers rather than excluding whole views from checks.

Run the browser cases at all four widths in both languages. Cover both colour schemes at 1440 and 390px when the change affects styling. Save screenshots as review artifacts; use layout assertions rather than pixel-by-pixel comparisons.

Ticket 01 defines the root command `pnpm test:e2e`, forwarded to the web package's script.

UI ticket acceptance criteria name the widths and languages checked. Before merging, the coordinator checks the changed screens in a real browser at 1440 and 390px in both languages and records the result.

## Done for a UI change

1. [ ] The change uses the shared components, tokens and catalog entries in this guide.
2. [ ] The changed surface passes every Visual language rule in screenshot and interaction review.
3. [ ] Behaviour tests pass for the changed actions, keyboard use and focus handling.
4. [ ] Browser cases pass at 1440, 1024, 768 and 390px in `en` and `zh-CN`, with the required colour-scheme cases and screenshots saved.
5. [ ] Loading, empty, error and long-content states pass the layout checks; deliberate truncation exposes the full text.
6. [ ] Changed motion uses the tokens and passes the Motion rules, including reduced motion.
7. [ ] Ticket Comments record actual checks and the coordinator's browser review at 1440 and 390px in both languages before merging.
