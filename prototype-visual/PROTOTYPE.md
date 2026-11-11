Throwaway prototype on branch prototype/visual-direction. Never merge into main.

Stage 1: standalone scaffold, shared design system and fake data, switcher, and Variant A Studio; B and C are reserved for later stages.

Run: `cd prototype-visual && pnpm install && pnpm dev` (build with `pnpm build`). State is in memory and resets on reload. The variant, theme and language are encoded in URL parameters.

## Findings

- `pnpm dlx shadcn@latest init -b radix -d -y` recognized Vite, Tailwind v4 and React 18.3.1. It generated a Radix configuration and completed after the local pnpm store was configured. Its generated CSS was replaced with the prototype's design tokens. No React 18 incompatibility was encountered in the build.
- `pnpm dlx shadcn@latest add button card badge sidebar sheet dialog dropdown-menu select tooltip command tabs progress separator avatar skeleton kbd item empty toggle-group scroll-area sonner collapsible popover -y` generated the requested components. The tooltip provider is installed in the app. No component source needed a manual React 18 fix.
- The environment's configured registry mirror and pnpm store initially interrupted installation. The standalone workspace uses a local store and npm registry configuration to keep installation self-contained.
- Browser access was unavailable during implementation, so visual appearance and interactive acceptance require a real-browser check.
