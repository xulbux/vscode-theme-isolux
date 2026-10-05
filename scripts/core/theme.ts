/**
 * Theme compiler – turns a theme source (with a `palette` and color references)
 * into a plain VS Code color theme (with hex colors only).
 *
 * Color references are resolved in:
 * - `colors.*`
 * - `tokenColors[].settings.foreground` / `.background`
 * - `semanticTokenColors.*` (string values, or `.foreground` / `.background` of style objects)
 *
 * Each reference is also checked against its color scope (UI vs. syntax, see `scopes.ts`).
 * Sources without a `palette` are passed through unchanged, so themes can be migrated one at a time.
 */

import type { BuildIssue, CompiledTheme, Palette } from '../types.ts';
import { flattenPalette, resolveColorReference, TRANSPARENT } from './palette.ts';
import {
  type ColorScope,
  hasScopes,
  isAllowedInScope,
  scopeOfColorKey,
  scopeViolationMessage,
} from './scopes.ts';

// ---------------------------------------- CONSTS ----------------------------------------

/** The `$schema` written into every compiled theme. */
export const VSCODE_THEME_SCHEMA = 'vscode://schemas/color-theme';

/** Color properties inside `tokenColors[].settings` and `semanticTokenColors` style objects. */
const STYLE_COLOR_KEYS = ['foreground', 'background'] as const;

// -------------------------------------- INTERNALS --------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Resolves color references in place, counting successes and collecting issues. */
class ReferenceResolver {
  public resolvedCount = 0;
  public readonly issues: BuildIssue[] = [];
  readonly #palette: Palette;
  readonly #scoped: boolean;

  public constructor(palette: Palette) {
    this.#palette = palette;
    this.#scoped = hasScopes(palette);
  }

  /** Resolve `target[key]` in place, checking that the referenced color may be used in `scope`. */
  public resolve(
    target: Record<string, unknown>,
    key: string,
    path: string,
    scope: ColorScope
  ): void {
    const value = target[key];
    const result = resolveColorReference(value, this.#palette);
    if (!result.ok) {
      this.issues.push({ message: result.message, path });
      return;
    }

    const name = typeof value === 'string' ? value.split('/')[0] : undefined;
    if (
      this.#scoped &&
      name !== undefined &&
      name !== TRANSPARENT &&
      !isAllowedInScope(name, scope)
    ) {
      this.issues.push({ message: scopeViolationMessage(name, scope), path });
      return;
    }

    target[key] = result.hex;
    this.resolvedCount += 1;
  }

  /** Resolve the `foreground` / `background` properties of a style object in place. */
  public resolveStyle(style: Record<string, unknown>, path: string, scope: ColorScope): void {
    for (const key of STYLE_COLOR_KEYS) {
      if (key in style) {
        this.resolve(style, key, `${path}.${key}`, scope);
      }
    }
  }
}

function resolveColors(colors: unknown, resolver: ReferenceResolver): void {
  if (colors === undefined) {
    return;
  }
  if (!isPlainObject(colors)) {
    resolver.issues.push({ message: 'Expected an object.', path: 'colors' });
    return;
  }
  for (const key of Object.keys(colors)) {
    resolver.resolve(colors, key, `colors[${JSON.stringify(key)}]`, scopeOfColorKey(key));
  }
}

function resolveTokenColors(tokenColors: unknown, resolver: ReferenceResolver): void {
  // A string value is a path to an external TextMate theme, which isn't processed.
  if (!Array.isArray(tokenColors)) {
    return;
  }
  for (const [index, rule] of tokenColors.entries()) {
    if (isPlainObject(rule) && isPlainObject(rule.settings)) {
      resolver.resolveStyle(rule.settings, `tokenColors[${index}].settings`, 'syntax');
    }
  }
}

function resolveSemanticTokenColors(
  semanticTokenColors: unknown,
  resolver: ReferenceResolver
): void {
  if (!isPlainObject(semanticTokenColors)) {
    return;
  }
  for (const [selector, value] of Object.entries(semanticTokenColors)) {
    const path = `semanticTokenColors[${JSON.stringify(selector)}]`;
    if (isPlainObject(value)) {
      resolver.resolveStyle(value, path, 'syntax');
    } else {
      resolver.resolve(semanticTokenColors, selector, path, 'syntax');
    }
  }
}

// ---------------------------------------- PUBLIC ----------------------------------------

/**
 * Compile a parsed theme source into a VS Code color theme.
 * The source object is not modified.
 */
export function compileTheme(source: unknown): CompiledTheme {
  if (!isPlainObject(source)) {
    return {
      issues: [{ message: 'Expected the theme to be a JSON object.', path: '(root)' }],
      palette: undefined,
      resolvedCount: 0,
      theme: {},
    };
  }

  const { palette: paletteSource, ...rest } = structuredClone(source);
  // Listed first so `$schema` is always the first key, then set again in case the source has its own.
  const theme: Record<string, unknown> = { $schema: VSCODE_THEME_SCHEMA, ...rest };
  theme.$schema = VSCODE_THEME_SCHEMA;

  if (paletteSource === undefined) {
    return { issues: [], palette: undefined, resolvedCount: 0, theme };
  }

  const paletteIssues: BuildIssue[] = [];
  const palette = flattenPalette(paletteSource, paletteIssues);
  const resolver = new ReferenceResolver(palette);

  resolveColors(theme.colors, resolver);
  resolveTokenColors(theme.tokenColors, resolver);
  resolveSemanticTokenColors(theme.semanticTokenColors, resolver);

  return {
    issues: [...paletteIssues, ...resolver.issues],
    palette,
    resolvedCount: resolver.resolvedCount,
    theme,
  };
}
