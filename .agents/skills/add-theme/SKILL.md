---
name: add-theme
description: Steps to add a new theme (or a variant of an existing theme) to the extension.
---

# Add Theme

Use this skill to add a new theme to the extension. The architecture and naming rules are defined in `AGENTS.md` Section 5; This skill only lists the steps.

## 1. Register the Variants

Add one entry per variant to `contributes.themes` in `package.json` (the SSOT for which themes are built):

```jsonc
{ "label": "Isolux Soft Dark", "uiTheme": "vs-dark", "path": "./dist/isolux-soft-dark.json" },
{ "label": "Isolux Soft Light", "uiTheme": "vs", "path": "./dist/isolux-soft-light.json" }
```

The path's file name is `<id>-<variant>.json`, and the variant must match the `uiTheme` (`dark` ↔ `vs-dark`, `light` ↔ `vs`).

## 2. Add the Token Function

Add an exported function named after the theme ID in camelCase (`isolux-soft` → `isoluxSoft()`) to `theme/tokens.ts`:

1.  Start from a copy of an existing theme function, so it defines **the same token names** (the build lists missing ones).
2.  Change the shared `const`s first (neutrals, roles), then individual tokens.
3.  If the theme needs a new color family, add its base to `theme/palette.ts` (see `AGENTS.md` Section 6).

`theme/theme.jsonc` is shared by every theme – don't copy it.

## 3. Validate

Run the full validation suite (`AGENTS.md` Section 3) and fix every warning, especially contrast and distinctness warnings in both variants. Then preview the themes with the `build` skill.

## 4. Document

Add the theme to the README (name, short description, preview) – ask the user for the preview screenshots.
