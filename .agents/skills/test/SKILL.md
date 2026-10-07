---
name: test
description: Guidelines and commands for running and maintaining the build script test suite.
---

# Test

In accordance with the validation policy in `AGENTS.md` Section 3, use this skill to write, organize and run the tests of the build scripts.

## 1. Architecture

Tests use Node's built-in test runner (`node:test` with `node:assert/strict`) – no test dependencies. Node runs the TypeScript files directly (type stripping, Node `>=22.18`), just like the build. The tests live in `test/` and cover the pure modules of `scripts/`, which work without a VS Code installation:

| File                   | Covers                                                                          |
| ---------------------- | ------------------------------------------------------------------------------- |
| `test/color.test.ts`   | Color math (`scripts/utils/color.ts`): OKLCH, gamut, lightness, contrast, ΔE_OK |
| `test/palette.test.ts` | Palette and shade generation (`scripts/core/palette.ts`, `shades.ts`)           |
| `test/tokens.test.ts`  | Authoring helpers and token flattening (`scripts/core/tokens.ts`)               |
| `test/theme.test.ts`   | Theme compiler, contrast and distinctness checks                                |
| `test/jsonc.test.ts`   | The JSONC parser (`scripts/utils/jsonc.ts`)                                     |

## 2. Writing Tests

1.  **One File per Module Area:** Add tests to the file covering the module (see the table); Create a new `test/<area>.test.ts` for a new area and add it to the table above.
2.  **Same Code Style:** Test files follow the code style of `AGENTS.md` Section 7 (module header naming the covered files, `CONSTS` / `INTERNALS` / `MAIN` sections, JSDoc on helpers).
3.  **Small Fixtures:** Build small palettes and token trees inline (see `test/theme.test.ts`) instead of importing `theme/` – the tests must not break when the theme's colors are tuned.
4.  **Descriptive Names:** `describe()` the function, `it()` the behavior (e.g., `it('blends translucent foregrounds over their background')`).
5.  **Order-Independent Asserts:** `oxlint --fix` sorts object keys, so don't assert on key order unless the order is the tested behavior.
6.  **Regression Tests:** Every bug fix in `scripts/` must come with a test that reproduces the bug.

## 3. Running Tests

```bash
pnpm run test
```

To check the oldest supported Node version as well:

```bash
pnpm dlx node@22.18.0 --test "test/**/*.test.ts"
```
