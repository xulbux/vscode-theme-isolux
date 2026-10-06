# Project Rules

-   This project uses **pnpm** as its package manager. Always use `pnpm` (e.g., `pnpm i`, `pnpm run <script>`, `pnpm exec <tool>`, `pnpm dlx <tool>`). Never use `npm`, `npx`, or `yarn`.
-   After making code changes, ALWAYS run `pnpm run type-check; pnpm run lint; pnpm run fmt; pnpm run build` to validate the codebase.
-   Fix all problems and warnings that arise from the validation suite until the output is clean.
-   Theme sources live in `theme/` and are compiled into `dist/` by `scripts/build.ts`. Never edit files in `dist/` by hand.
-   The valid `colors` keys (and their descriptions) are read from the locally installed VS Code and its extensions on every build (`scripts/core/colorIds.ts`). Unknown keys are flagged in the editor (via the generated schema) and as build warnings; Fix misspelled keys and remove keys that VS Code no longer knows. Never hard-code or snapshot color key lists.
-   Tailwind's palette (the `tailwindcss` dev dependency, imported from `tailwindcss/colors`) is the reference for how generated shades shift saturation and hue per hue (`scripts/core/shades.ts`). It's designed for Display P3, so its saturation is measured relative to P3 and applied relative to sRGB (proportional scaling, never clipping). Don't copy Tailwind colors into the repo.
-   In themes that define a `palette`, every color value must be a palette reference (`<name>`, `<name>/<opacity>`, `<name>%<lightness>`, or `transparent`). Never add raw hex colors outside of the `palette` object.
-   Palette shades are restricted to the Tailwind steps (`50`, `100`, `200`, …, `900`, `950`). Don't add in-between shades; reuse the closest existing shade instead.
-   For subtle variants in between the shades (e.g., hover / active states), use a lightness modifier (`<name>%<lightness>`, `50`–`150` % of the color's perceived lightness – the toe-corrected OKLCH lightness `Lr` (`scripts/utils/color.ts`), so dark colors don't collapse to black, combinable with an opacity: `<name>%<lightness>/<opacity>`). Prefer defining derived colors as palette roles that reference their source (e.g., `"bg-hover": "ui-accent-bg%94"`), so they follow it when it changes.
-   Palette color families are defined by a single base color (e.g., `"violet": "#AA94FF"`), from which `scripts/core/shades.ts` generates all shades at build time (the base becomes shade `400`). Every base must have the same OKLCH lightness (`TARGET_LIGHTNESS` of shade `400`, enforced by the build – it suggests a corrected hex), so all families look equally bright. To change a family's hue or saturation, change its base instead of individual shades. Only define shades manually when a scale can't be generated (e.g., the neutral `gray` scale) – a manual scale must define every shade.
-   The build warns about low-contrast color pairs (`scripts/core/contrast.ts`). Treat these warnings like errors and fix the colors, don't lower the thresholds. When adding new foreground/background keys that carry text, add the pair to `CONTRAST_PAIRS`.
-   Foreground keys in `CONTRAST_PAIRS` may use a color pair (`<color>|<color>`, exactly 2 colors, no `transparent`); the build picks the one with the better contrast against the key's background(s). Use pairs (e.g., `gray-900|gray-50`) for text on colored (non-gray) fills, so the text adapts when the fill color changes. Other keys must use a single color.
-   In themes whose palette defines a `ui` group, `colors` may only use UI roles (`ui-<role>-<slot>`), `gray-*`, `ansi-*` and `transparent`. Only keys that label categories (`CATEGORY_KEY_PREFIXES` in `scripts/core/scopes.ts`, e.g. `symbolIcon.*`, bracket colorization, `gitDecoration.*`, `charts.*`) may use base colors directly. Token colors must never use `ui-*`. The build enforces this. If no existing role fits a new UI color, add a role or slot to `palette.ui` instead of using a base color.

## Code Style

Match the existing code style exactly (it mirrors the author's `vscode-ext-color-tracr` extension):

-   Write plain functions (`function` declarations) and module-level constants – no classes. Pass shared state as a `context`/`options` object as the last parameter.
-   Start every module (except type-only files) with a JSDoc header: `Title – Description` (capitalized after the en dash), or a short sentence, followed by a blank ` *` line and the details.
-   Group module contents with 90-character section dividers, title centered in uppercase (e.g., `// -------------------------------------- PUBLIC API -------------------------------------`). Use the sections `TYPES`, `CONSTS`, `REGEX PATTERNS`, `INTERNALS`, `PUBLIC API` and `MAIN` (in that order, as needed).
-   Shared/exported types live in `scripts/types/` (one file per domain, re-exported from `scripts/types/index.ts`) and are imported with separate `import type { … }` statements, never inline `type` specifiers. Module-private types stay in the module's `TYPES` section. Use `interface` for object types.
-   Name `RegExp` constants `<NAME>_RX` and document each with `/** Matches … */`. Don't add the `u` flag unless the pattern needs it.
-   Document every exported function, constant and every interface property with JSDoc. Align `@param` descriptions 3 spaces after the longest parameter name (`@param name   Description`).
-   Document units in the JSDoc instead of the name (e.g., `/** … (ms). */ const WATCH_DEBOUNCE = 100;`).
-   Comments are full sentences ending with a period. Join clauses with `; ` followed by a capital letter (e.g., `// Check cache; Skip if unchanged.`). Use `e.g.,` with a comma.
-   Put helpers used by more than one module into `scripts/utils/` instead of duplicating them.
-   Initialize `let` variables that may stay unset explicitly with `undefined` (`let x: T | undefined = undefined;`), and use `i += 1` instead of `i++`.
