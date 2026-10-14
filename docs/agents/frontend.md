# Frontend

ui-foundations 01 creates `src/ui/`, `packages/web/src/styles/tokens.css` and the e2e harness described here.

## Stack and source

Read `packages/web/package.json` for dependencies and scripts, ADR 0010 for the frontend decision, and `GLOSSARY.md` for product terms. Use React views built by Vite and styled with Tailwind. Keep wrapped primitives in `packages/web/src/ui/`, icons in lucide-react, the command palette in cmdk, and catalogs in `packages/web/src/i18n/`. Views read state and send actions through the existing layer (ADR 0006).

## Components

Use a `src/ui/` component for every menu, popover, dialog, sheet, tooltip and select. When one is missing, add it there in the same style: a Radix primitive, Tailwind utilities and class-variance-authority variants, with its own behaviour test. Use the shared `cn` helper to combine classes.

Let Radix handle overlay positioning, focus, Escape and outside-click dismissal. Put any feature-specific dismissal condition, such as a pending save, in the primitive's event hooks. Keep nested overlays dismissing only the topmost layer and returning focus to the right trigger.

### Choosing a container

Use Popover for glanceable information and single immediate actions. Use Dialog for multi-step tasks, forms and anything that writes files or commits. Use Sheet for browsing a work item or queue alongside the board. Use Tooltip only for labels.

## Tokens and styling

Take colours, radius, spacing, type scale and shadows from `packages/web/src/styles/tokens.css` through Tailwind theme classes. Put utilities in `className`. Keep feature CSS only for styling utilities cannot express, and record the reason beside the retained rule. Both `prefers-color-scheme` light and dark come from the tokens. Use the system font stack defined there.

## Visual language

- Match prototype variant B (tag `prototype-ui-v1`, see `AGENTS.md`): dense, quiet, Linear-like.
- Give each control type the same appearance everywhere through `src/ui/` variants, such as Button primary, secondary, ghost and danger. Keep feature styling on layout and content; control styling belongs to the shared variants.
- Put one primary action on each surface. Reserve the accent colour for the primary action, selection and focus.
- Render statuses through one shared Badge/status style with success, warning, danger and accent variants.
- Use spacing tokens in 4px steps and lucide-react icons at token-defined sizes. Give every icon-only button a tooltip matching its accessible name.
- Use the danger variant and a confirmation step for irreversible actions.
- Disclose secondary details in a drawer, popover or expandable section so the board stays scannable.

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
6. [ ] Ticket Comments record actual checks and the coordinator's browser review at 1440 and 390px in both languages before merging.
