---
name: tune-colors
description: Workflow for changing palette, syntax or UI colors while keeping contrast, distinctness and both variants intact.
---

# Tune Colors

Use this skill when changing any color of a theme. The color rules themselves are defined in `AGENTS.md` Section 6; This skill describes the workflow.

## 1. Pick the Right Layer

| Goal                                         | Change                                                        |
| -------------------------------------------- | ------------------------------------------------------------- |
| A whole color family looks off (hue, chroma) | Its base in `theme/palette.ts` (all shades follow)            |
| One syntax or UI role should look different  | The token (or shared `const`) in `theme/tokens.ts`            |
| A VS Code element uses the wrong role        | The token name in `theme/theme.jsonc` (add a token if needed) |

Never put hex colors anywhere but `theme/palette.ts`.

## 2. Change a Palette Base

1.  Edit the base hex color; Stay within the allowed hues (see **Hue Range** in `AGENTS.md` Section 6).
2.  Run `pnpm run build` – if the base doesn't have the target lightness, the build fails and suggests a corrected hex with the same hue and chroma. Use the suggestion.

## 3. Change a Token

1.  Use a shade (`color.blue[300]`), a `mirror(…)` pair or a helper from `scripts/api.ts` (`lightness`, `alpha`, `onColor`).
2.  Tune the dark variant first; When only the light variant looks wrong, change only the light value of the pair.
3.  Colored text in light usually needs shade `600`–`700` to reach `4.5:1`.

## 4. Watch While Tuning

```bash
pnpm run watch
```

Rebuilds `dist/` on every change; With the Extension Development Host (`F5`) open, VS Code updates the colors live.

## 5. Fix the Warnings

The build checks every variant:

-   **Low contrast** – Use a lighter (dark) / darker (light) shade or a stronger `lightness` factor; Never lower the thresholds.
-   **Hard to tell apart** – Two colored syntax tokens are too close (`ΔE_OK`); Move one of them to another shade or family.
-   **Unused token** – Reference it in `theme/theme.jsonc` or remove it.

Finish with the full validation suite (`AGENTS.md` Section 3) and summarize the changed colors for the user, so they can judge the result.
