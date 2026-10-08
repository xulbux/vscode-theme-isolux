# Agent Guidelines for `theme-isolux`

When working on this repository, any AI agent or automated assistant must adhere strictly to the following rules to keep the themes consistent, readable and correct.

## 1. Package Manager

This project uses **pnpm** as its package manager. Always use `pnpm` (e.g., `pnpm i`, `pnpm run <script>`, `pnpm exec <tool>`, `pnpm dlx <tool>`). **Never** use `npm`, `npx`, or `yarn`.

## 2. Strict Typing

Everything must be strictly typed. Don't use `any` unless it's fundamentally impossible to type otherwise; Use `unknown` and narrow it instead. `@ts-ignore` is forbidden; Use `@ts-expect-error` with a descriptive reason if an error can't be avoided.

## 3. Validation & Testing

After making any changes, validate them with the full suite of type checks, linters, formatters, tests and the build:

```bash
pnpm run type-check; pnpm run lint; pnpm run fmt; pnpm run test; pnpm run build
```

Fix all problems and warnings that arise until the output is completely clean. Use the `test` skill for the test suite and the `build` skill for packaging and installing the extension locally.

## 4. Ask, Don't Assume

If you run into anything you're not sure about (ambiguous requirements, color decisions, architectural changes), **ask first**. Don't make assumptions about the desired look or behavior.

## 5. Theme Architecture

Theme sources live in `theme/` and are compiled into `dist/` by `scripts/build.ts`. **Never** edit files in `dist/` by hand. The sources are three layers, each only referencing the one above it:

1.  `theme/palette.ts` – The raw colors (`definePalette`). The **only** place for hex colors.
2.  `theme/tokens.ts` – One exported function per theme, named after the theme ID in camelCase (`isolux-pro` → `isoluxPro()`), returning its semantic tokens (`defineTheme`). Shared values are `const`s inside the function. Every theme must define the same token names.
3.  `theme/theme.jsonc` – The VS Code theme shared by every theme. Its color values may only be token names (e.g., `ui.foreground.muted`, `token.keyword`) or `transparent` – no raw hex colors, no adjustments.

-   **Themes from the Manifest (SSOT):** The themes and variants to build come from `contributes.themes` in `package.json`: `path` `./dist/<id>-<variant>.json` (`dark` / `light`, matching `uiTheme` `vs-dark` / `vs`) selects the token function and variant, and `label` becomes the theme's `name`. `author` and `maintainers` are copied from `package.json` and the `semanticClass` is `theme.<id>`. Never set `name`, `type`, `author`, `maintainers`, `semanticClass` or `palette` in the JSONC. Use the `add-theme` skill to add a theme.
-   **Color Keys:** The valid `colors` keys (and their descriptions) are read from the locally installed VS Code and its extensions on every build (`scripts/core/colorIds.ts`, cached in `node_modules/.cache/`). Unknown keys are flagged in the editor (via the generated schema) and as build warnings; Fix misspelled keys and remove keys that VS Code no longer knows. Never hard-code or snapshot color key lists.
-   **Token Names:** Token names are dot paths mirroring the TS object (`DEFAULT` stands for the group itself, multi-word keys are camelCase). Neutrals are named property first (`ui.background.*`, `ui.foreground.*`, `ui.border.*`); Components, roles and purposes are groups with slots (`ui.button.hover`, `ui.error.background`, `ui.added.line`). Name translucent colors after their purpose (`ui.selection`), never after their opacity. If the JSONC needs a color that no token provides, add a token instead of reusing an unrelated one; The build warns about unused tokens.
-   **Token Groups:** `colors` may only use `ui.*` tokens; Only keys that label categories (`CATEGORY_KEY_PREFIXES` in `scripts/core/scopes.ts`, e.g., `symbolIcon.*`, bracket colorization, `gitDecoration.*`, `charts.*`) may use `token.*` tokens as well (e.g., `symbolIcon.functionForeground` → `token.function`). `tokenColors` / `semanticTokenColors` may only use `token.*` tokens. The build enforces this.

## 6. Colors

Use the `tune-colors` skill when changing colors.

-   **Tailwind Reference:** Tailwind's palette (the `tailwindcss` dev dependency, imported from `tailwindcss/colors`) is the reference for how generated shades shift saturation and hue per hue (`scripts/core/shades.ts`). It's designed for Display P3, so its saturation is measured relative to P3 and applied relative to sRGB (proportional scaling, never clipping). Don't copy Tailwind colors into the repo.
-   **Hue Range:** The chromatic families span indigo → violet → purple → pink → red → orange (up to light orange), plus one specific green and one specific cyan. Avoid everything between indigo and cyan (blues, light blues) and between light orange and green (bright yellows, limes, bright greens). Teal is reserved for search matches, so they stand out; Don't use it for anything else.
-   **Palette Bases:** Palette color families are defined by a single base color (e.g., `violet: '#AA94FF'`), from which `scripts/core/shades.ts` generates all shades at build time (the base becomes shade `400`). Every base must have the same OKLCH lightness (`TARGET_LIGHTNESS` of shade `400`, enforced by the build – it suggests a corrected hex), so all families look equally bright. To change a family's hue or saturation, change its base instead of individual shades. Only define shades manually when a scale can't be generated (e.g., the neutral `gray` scale) – a manual scale must define every shade.
-   **Shade Steps:** Palette shades are restricted to the Tailwind steps (`50`, `100`, `200`, …, `900`, `950`). Don't add in-between shades; Reuse the closest existing shade instead.
-   **Token Values:** Token values are palette colors (`color.gray[950]`), either the same in every variant or a `[dark, light]` pair. Derive colors only with the helpers from `scripts/api.ts` (all variant-aware): `lightness(c, factor)` for subtle variants in between the shades (`0.5`–`1.5` × the perceived lightness – the toe-corrected OKLCH lightness `Lr` (`scripts/utils/color.ts`), so dark colors don't collapse to black), `alpha(c, opacity)` (one of the `OPACITY_STEPS`, as a fraction, e.g., `0.1`) and `onColor({ candidates, backgrounds })` for text on colored fills, so it adapts when the fill changes.
-   **Light Variants:** Light variants of color families mirror the dark shade around `500` (`mirror(color.red, 400)` → `[red[400], red[600]]`, a local helper in `theme/tokens.ts`); Roles whose text sits on their own tint (and colored text that needs `4.5:1`) use shade `700` in light. The gray scale isn't evenly spaced, so light grays are picked explicitly (in-between grays via `lightness(color.gray[50], …)`). Never change dark values when tuning the light variant.
-   **Contrast:** The build warns about low-contrast color pairs (`scripts/core/contrast.ts`), in every variant. Colored token colors must reach `4.5:1` on the editor background, while neutral (gray) ones may be dimmed down to `3:1`. Treat these warnings like errors and fix the colors, don't lower the thresholds. When adding new foreground/background keys that carry text, add the pair to `CONTRAST_PAIRS`.
-   **Distinctness:** The build warns about colored syntax tokens that are too similar to tell apart (`scripts/core/distinctness.ts`, `ΔE_OK` below `MIN_DISTANCE`), in every variant. Treat these warnings like errors as well and pick a more distinct shade or hue instead of lowering the threshold. Only pairs whose scopes never show up close to each other, or never sit directly next to each other and are told apart by their glyphs (e.g., constant names and numbers), may be listed in `UNRELATED_PAIRS` (with a reason). Identifiers (variables, properties, functions, types, …) look alike, so color is what tells them apart even when they don't touch.

## 7. Code Style

Match the existing code style exactly (it mirrors the author's `vscode-ext-color-tracr` extension):

-   **Plain Functions:** Write plain functions (`function` declarations) and module-level constants – no classes. Pass shared state as a `context`/`options` object as the last parameter.
-   **Module Headers:** Start every module (except type-only files) with a JSDoc header: `Title – Description` (capitalized after the en dash), or a short sentence, followed by a blank ` *` line and the details.
-   **Sections:** Group module contents with 90-character section dividers, title centered in uppercase (e.g., `// -------------------------------------- PUBLIC API -------------------------------------`). Use the sections `TYPES`, `CONSTS`, `REGEX PATTERNS`, `INTERNALS`, `PUBLIC API` and `MAIN` (in that order, as needed).
-   **Types:** Shared/exported types live in `scripts/types/` (one file per domain, re-exported from `scripts/types/index.ts`) and are imported with separate `import type { … }` statements, never inline `type` specifiers. Module-private types stay in the module's `TYPES` section. Use `interface` for object types.
-   **Regex Constants:** Name `RegExp` constants `<NAME>_RX` and document each with `/** Matches … */`. Don't add the `u` flag unless the pattern needs it.
-   **Documentation:** Document every exported function, constant and every interface property with JSDoc. Align `@param` descriptions 3 spaces after the longest parameter name (`@param name   Description`). Document units in the JSDoc instead of the name (e.g., `/** … (ms). */ const WATCH_DEBOUNCE = 100;`).
-   **Comments:** Comments are full sentences ending with a period. Join clauses with `; ` followed by a capital letter (e.g., `// Check cache; Skip if unchanged.`). Use `e.g.,` with a comma. Preserve existing comments that are unrelated to your change.
-   **Shared Helpers:** Put helpers used by more than one module into `scripts/utils/` instead of duplicating them.
-   **Variables:** Initialize `let` variables that may stay unset explicitly with `undefined` (`let x: T | undefined = undefined;`), and use `i += 1` instead of `i++`.
-   **Lint Order:** Define functions before using them (`no-use-before-define`), so builders used by constants go into `INTERNALS` above those constants.

## 8. Rule & Skill Authoring (Single Source of Truth)

To keep agent guidelines clean, maintainable and free of contradictions, adhere strictly to the Single Source of Truth (SSOT) principle:

-   **Define Once:** Every rule, standard or guideline must be defined in exactly ONE canonical location:
    -   **`AGENTS.md`:** Repository-wide core policies (architecture, colors, code style, validation).
    -   **Skills (`.agents/skills/<skill>/SKILL.md`):** Specialized workflows (`build` for packaging and installation; `test` for the test suite; `add-theme` for adding a theme; `tune-colors` for changing colors).
-   **Reference, Never Duplicate:** When a rule defined in one location also applies in another, don't duplicate or re-explain it. Instead, point directly to its canonical definition.
-   **Synchronize References:** If a canonical rule is updated or moved, verify that all references pointing to it are kept accurate.
