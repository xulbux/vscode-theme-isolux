/**
 * Theme compiler – Turns a theme source (with a `palette` and color references)
 * into a plain VS Code color theme (with hex colors only).
 *
 * Color references are resolved in:
 * - `colors.*`
 * - `tokenColors[].settings.foreground` / `.background`
 * - `semanticTokenColors.*` (string values, or `.foreground` of style objects; VS Code doesn't support a background there)
 *
 * Each reference is also checked against its color scope (UI vs. syntax, see `scopes.ts`).
 * Color pairs (`gray-900|gray-50`) are resolved last, once all other `colors` are hex colors, to the reference
 * with the better contrast against the key's background (see `pickBestContrast`).
 * Sources without a `palette` are passed through unchanged, so themes can be migrated one at a time.
 */

import type { BuildIssue, ColorScope, CompiledTheme, Palette } from '../types/index.ts';
import { isPlainObject } from '../utils/object.ts';
import { colorKeyPath, forEachTokenColor } from '../utils/theme.ts';
import { CONTRAST_FOREGROUND_KEYS, pickBestContrast } from './contrast.ts';
import {
  COLOR_PAIR_SEPARATOR,
  flattenPalette,
  isColorPair,
  referenceName,
  resolveColorReference,
  TRANSPARENT,
} from './palette.ts';
import { hasScopes, isAllowedInScope, scopeOfColorKey, scopeViolationMessage } from './scopes.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** State shared while resolving the color references of a single theme. */
interface ResolveContext {
  /** The flattened palette the references are resolved against. */
  palette: Palette;
  /** Whether scope restrictions apply to the palette (see `hasScopes`). */
  scoped: boolean;
  /** Number of color references that were resolved to hex colors. */
  resolvedCount: number;
  /** Every problem found while resolving. */
  issues: BuildIssue[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** The `$schema` written into every compiled theme. */
const VSCODE_THEME_SCHEMA = 'vscode://schemas/color-theme';

/** Number of references in a color pair. */
const COLOR_PAIR_SIZE = 2;

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Resolve a single color reference to its hex color, checking that it may be used in `scope`.
 *
 * @param value     The color reference.
 * @param path      JSON path to the color reference (for issues).
 * @param scope     The color scope the reference is used in.
 * @param context   The resolve state, which collects the issues.
 * @returns The hex color, or `undefined` if the reference is invalid (an issue was added then).
 */
function resolveHex(
  value: unknown,
  path: string,
  scope: ColorScope,
  context: ResolveContext
): string | undefined {
  const result = resolveColorReference(value, context.palette);
  if (!result.ok) {
    context.issues.push({ message: result.message, path });
    return undefined;
  }

  const name = referenceName(value);
  if (context.scoped && name !== undefined && !isAllowedInScope(name, scope)) {
    context.issues.push({ message: scopeViolationMessage(name, scope), path });
    return undefined;
  }
  return result.hex;
}

/**
 * Resolve `target[key]` in place, checking that the referenced color may be used in `scope`.
 *
 * @param target    The object holding the color reference.
 * @param key       The property of `target` that holds the color reference.
 * @param path      JSON path to the color reference (for issues).
 * @param scope     The color scope the reference is used in.
 * @param context   The resolve state, which counts successes and collects issues.
 */
function resolveReference(
  target: Record<string, unknown>,
  key: string,
  path: string,
  scope: ColorScope,
  context: ResolveContext
): void {
  const value = target[key];
  if (isColorPair(value)) {
    context.issues.push({
      message:
        'Color pairs are only supported for the foreground keys of `CONTRAST_PAIRS` (in `scripts/core/contrast.ts`).',
      path,
    });
    return;
  }

  const hex = resolveHex(value, path, scope, context);
  if (hex !== undefined) {
    target[key] = hex;
    context.resolvedCount += 1;
  }
}

/**
 * Resolve the color pair in `colors[key]` in place, to the reference with the better contrast.
 * Must run after all other `colors` are resolved, so the backgrounds are hex colors.
 *
 * @param colors    The `colors` object holding the color pair.
 * @param key       The `colors` key that holds the color pair (a foreground in `CONTRAST_PAIRS`).
 * @param context   The resolve state, which counts successes and collects issues.
 */
function resolveColorPair(
  colors: Record<string, unknown>,
  key: string,
  context: ResolveContext
): void {
  const path = colorKeyPath(key);
  const references = String(colors[key]).split(COLOR_PAIR_SEPARATOR);
  if (references.length !== COLOR_PAIR_SIZE) {
    context.issues.push({
      message: `A color pair must consist of exactly ${COLOR_PAIR_SIZE} colors ("<color>${COLOR_PAIR_SEPARATOR}<color>").`,
      path,
    });
    return;
  }
  if (references.includes(TRANSPARENT)) {
    context.issues.push({ message: `"${TRANSPARENT}" can't be part of a color pair.`, path });
    return;
  }

  const hexes = references
    .map((reference) => resolveHex(reference, path, scopeOfColorKey(key), context))
    .filter((hex) => hex !== undefined);
  if (hexes.length !== COLOR_PAIR_SIZE) {
    return;
  }

  const best = pickBestContrast(key, hexes, colors);
  if (best === undefined) {
    context.issues.push({
      message:
        "No background to compare the color pair against – none of the backgrounds this key is paired with in `CONTRAST_PAIRS` is set (backgrounds can't be color pairs themselves).",
      path,
    });
    return;
  }
  colors[key] = hexes[best];
  context.resolvedCount += 1;
}

/**
 * Resolve every color reference in `colors` in place (color pairs last, see `resolveColorPair`).
 */
function resolveColors(colors: unknown, context: ResolveContext): void {
  if (colors === undefined) {
    return;
  }
  if (!isPlainObject(colors)) {
    context.issues.push({ message: 'Expected an object.', path: 'colors' });
    return;
  }

  // Color pairs are resolved last; They're picked by the contrast against already resolved backgrounds.
  const pairKeys: string[] = [];
  for (const key of Object.keys(colors)) {
    if (isColorPair(colors[key]) && CONTRAST_FOREGROUND_KEYS.has(key)) {
      pairKeys.push(key);
    } else {
      resolveReference(colors, key, colorKeyPath(key), scopeOfColorKey(key), context);
    }
  }
  for (const key of pairKeys) {
    resolveColorPair(colors, key, context);
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

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
      scoped: false,
      theme: {},
    };
  }

  const { palette: paletteSource, ...rest } = structuredClone(source);
  // Listed first so `$schema` is always the first key, then set again in case the source has its own.
  const theme: Record<string, unknown> = { $schema: VSCODE_THEME_SCHEMA, ...rest };
  theme.$schema = VSCODE_THEME_SCHEMA;

  if (paletteSource === undefined) {
    return { issues: [], palette: undefined, resolvedCount: 0, scoped: false, theme };
  }

  const paletteIssues: BuildIssue[] = [];
  const palette = flattenPalette(paletteSource, paletteIssues);
  const context: ResolveContext = {
    issues: [],
    palette,
    resolvedCount: 0,
    scoped: hasScopes(palette),
  };

  resolveColors(theme.colors, context);
  forEachTokenColor(theme, (target, key, path) => {
    resolveReference(target, key, path, 'syntax', context);
  });

  return {
    issues: [...paletteIssues, ...context.issues],
    palette,
    resolvedCount: context.resolvedCount,
    scoped: context.scoped,
    theme,
  };
}
