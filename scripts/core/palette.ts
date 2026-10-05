/**
 * Palette – flattens a theme's nested `palette` object and resolves color references against it.
 *
 * Palette definition (inside the theme source):
 * ```jsonc
 * "palette": {
 *   "violet": "#AA94FF",                              // → `violet-50` … `violet-950` (generated, `violet-400` = base)
 *   "gray": { "50": "#FAFAFA", …, "950": "#000000" }, // → `gray-50` … `gray-950` (manual, all shades required)
 *   "ansi": { "magenta": "violet-400" },              // → `ansi-magenta` (alias of another color)
 *   "ui": { "accent": { "base": "violet-400" } }      // → `ui-accent-base` (UI role, see `scopes.ts`)
 * }
 * ```
 * - A top-level hex color is a base color: the whole shade scale is generated from it (see `shades.ts`).
 * - An object with numeric keys is a manual shade scale and must define every one of the Tailwind `SHADES`.
 * - Other objects are groups of named colors. Nested keys are joined with `-`.
 * - Values inside objects are either opaque `#RRGGBB` hex colors or the name of another palette color (an alias).
 *
 * Color references (inside `colors`, `tokenColors` and `semanticTokenColors`):
 * - `violet-400`     – the palette color as-is
 * - `violet-400/20`  – the palette color at one of the allowed `OPACITY_STEPS` (in %)
 * - `transparent`    – fully transparent
 */

import type { BuildIssue, ColorResolution, Palette } from '../types.ts';
import { findClosest } from '../utils/strings.ts';
import { generateShades, TARGET_LIGHTNESS, validateBaseColor } from './shades.ts';

// ---------------------------------------- CONSTS ----------------------------------------

/**
 * Allowed opacity steps (in %), mapped to their hex alpha byte.
 * Restricting the steps keeps transparency levels consistent across the whole theme.
 */
export const OPACITY_STEPS: ReadonlyMap<number, string> = new Map([
  [5, '0D'],
  [10, '1A'],
  [15, '26'],
  [20, '33'],
  [25, '40'],
  [30, '4D'],
  [40, '66'],
  [50, '80'],
  [60, '99'],
  [70, 'B3'],
  [80, 'CC'],
  [90, 'E6'],
  // Visually opaque, but technically still translucent, which makes VS Code
  // blend the color instead of treating it as a solid (overriding) color.
  [99, 'FE'],
]);

/** Keyword for a fully transparent color. */
export const TRANSPARENT = 'transparent';

/**
 * Allowed numeric shade keys (the Tailwind steps).
 * Restricting the shades keeps the palette small and prevents near-duplicate in-between colors.
 */
export const SHADES: ReadonlySet<string> = new Set([...TARGET_LIGHTNESS.keys()].map(String));

const TRANSPARENT_HEX = '#00000000';
const HEX_PATTERN = /^#[0-9A-F]{6}$/iu;
const ANY_HEX_PATTERN = /^#(?:[0-9A-F]{3,4}|[0-9A-F]{6}|[0-9A-F]{8})$/iu;
const NAME_SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const REFERENCE_PATTERN = /^(?<name>[a-z][a-z0-9-]*)(?:\/(?<opacity>\d+))?$/u;
const NUMERIC_PATTERN = /^\d+$/u;

// -------------------------------------- INTERNALS --------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unknownColorMessage(name: string, knownNames: Iterable<string>): string {
  const hint = findClosest(name, knownNames);
  return `Unknown palette color "${name}".${hint ? ` Did you mean "${hint}"?` : ''}`;
}

function addEntry(
  name: string,
  value: string,
  entries: Map<string, string>,
  issues: BuildIssue[]
): void {
  if (entries.has(name)) {
    issues.push({ message: `Duplicate palette color "${name}".`, path: `palette.${name}` });
  } else {
    entries.set(name, value);
  }
}

/**
 * Check that an object with numeric keys (a manual shade scale) defines every shade and nothing else.
 * @returns An error message, or `undefined` if the object isn't a shade scale or is complete.
 */
function validateShadeScale(node: Record<string, unknown>): string | undefined {
  const keys = Object.keys(node);
  if (!keys.some((key) => NUMERIC_PATTERN.test(key))) {
    return undefined;
  }
  const named = keys.filter((key) => !NUMERIC_PATTERN.test(key));
  if (named.length > 0) {
    return `A shade scale can't contain named colors (${named.map((key) => `"${key}"`).join(', ')}) – move them into a separate group.`;
  }
  const missing = [...SHADES].filter((shade) => !(shade in node));
  if (missing.length > 0) {
    return `A manual shade scale must define every shade (missing: ${missing.join(', ')}) – or use a single base color instead to generate all shades.`;
  }
  return undefined;
}

/**
 * Recursively walk the nested palette object and collect each entry's raw value (hex or alias) by its flat name.
 * Top-level hex colors are base colors, which are expanded into their generated shade scale.
 */
function collectEntries(
  node: Record<string, unknown>,
  prefix: string,
  entries: Map<string, string>,
  issues: BuildIssue[]
): void {
  for (const [key, value] of Object.entries(node)) {
    const name = prefix ? `${prefix}-${key}` : key;
    const path = `palette.${name}`;
    const scaleError = isPlainObject(value) ? validateShadeScale(value) : undefined;
    const isBaseColor = prefix === '' && typeof value === 'string' && HEX_PATTERN.test(value);
    const baseError = isBaseColor ? validateBaseColor(value) : undefined;

    if (!NAME_SEGMENT_PATTERN.test(key) || !NAME_PATTERN.test(name)) {
      issues.push({
        message:
          'Invalid palette key – use lowercase letters, digits and dashes, starting with a letter.',
        path,
      });
    } else if (name === TRANSPARENT) {
      issues.push({ message: `"${TRANSPARENT}" is a reserved keyword.`, path });
    } else if (NUMERIC_PATTERN.test(key) && !SHADES.has(key)) {
      issues.push({
        message: `Shade "${key}" is not allowed – use one of: ${[...SHADES].join(', ')}.`,
        path,
      });
    } else if (scaleError !== undefined) {
      issues.push({ message: scaleError, path });
    } else if (isPlainObject(value)) {
      collectEntries(value, name, entries, issues);
    } else if (typeof value !== 'string') {
      issues.push({
        message: 'Expected a base color, an alias, a shade scale or a group of named colors.',
        path,
      });
    } else if (isBaseColor) {
      // An invalid base still generates its shades, so references to the family (and the
      // generated schema) stay intact and only the base color itself is reported.
      if (baseError !== undefined) {
        issues.push({ message: baseError, path });
      }
      for (const [shade, hex] of generateShades(value)) {
        addEntry(`${name}-${shade}`, hex, entries, issues);
      }
    } else {
      addEntry(name, value, entries, issues);
    }
  }
}

/**
 * Resolve a raw palette entry to its hex color, following aliases (with cycle detection).
 * Results are memoized in `resolved`.
 */
function resolveEntry(
  name: string,
  entries: ReadonlyMap<string, string>,
  resolved: Map<string, string>,
  chain: readonly string[]
): ColorResolution {
  const known = resolved.get(name);
  if (known !== undefined) {
    return { hex: known, ok: true };
  }

  const value = entries.get(name);
  if (value === undefined) {
    return { message: unknownColorMessage(name, entries.keys()), ok: false };
  }
  if (chain.includes(name)) {
    return { message: `Circular alias: ${[...chain, name].join(' → ')}.`, ok: false };
  }

  let result: ColorResolution = {
    message: `Expected an opaque "#RRGGBB" hex color or the name of another palette color, got "${value}".`,
    ok: false,
  };
  if (HEX_PATTERN.test(value)) {
    result = { hex: value.toUpperCase(), ok: true };
  } else if (NAME_PATTERN.test(value)) {
    result = resolveEntry(value, entries, resolved, [...chain, name]);
  }

  if (result.ok) {
    resolved.set(name, result.hex);
  }
  return result;
}

/**
 * Build the error message for a raw hex value, pointing to the matching palette color(s), if any.
 */
function describeRawHex(value: string, palette: Palette): string {
  const base = value.length === 9 ? value.slice(0, 7).toUpperCase() : value.toUpperCase();
  const matches = [...palette].filter(([, hex]) => hex === base).map(([name]) => `"${name}"`);
  const hint = matches.length > 0 ? ` (matches ${matches.join(', ')})` : '';
  return `Raw hex color "${value}" is not allowed${hint} – add it to the palette and reference it by name.`;
}

// ---------------------------------------- PUBLIC ----------------------------------------

/**
 * Flatten a theme's nested `palette` object into a `name → #RRGGBB` map, resolving aliases.
 * Problems are appended to `issues`; invalid entries are left out of the result.
 */
export function flattenPalette(source: unknown, issues: BuildIssue[]): Palette {
  const palette = new Map<string, string>();

  if (!isPlainObject(source)) {
    issues.push({ message: 'Expected an object.', path: 'palette' });
    return palette;
  }

  const entries = new Map<string, string>();
  const resolved = new Map<string, string>();
  collectEntries(source, '', entries, issues);

  // Iterating `entries` (instead of reading `resolved`) keeps the palette in definition order.
  for (const name of entries.keys()) {
    const result = resolveEntry(name, entries, resolved, []);
    if (result.ok) {
      palette.set(name, result.hex);
    } else {
      issues.push({ message: result.message, path: `palette.${name}` });
    }
  }

  return palette;
}

/**
 * Resolve a color reference (`name`, `name/opacity` or `transparent`) to a hex color.
 * @returns `#RRGGBB` for opaque references, `#RRGGBBAA` for references with an opacity step.
 */
export function resolveColorReference(value: unknown, palette: Palette): ColorResolution {
  if (typeof value !== 'string') {
    return {
      message: `Expected a palette color reference, got ${JSON.stringify(value)}.`,
      ok: false,
    };
  }
  if (value === TRANSPARENT) {
    return { hex: TRANSPARENT_HEX, ok: true };
  }
  if (ANY_HEX_PATTERN.test(value)) {
    return { message: describeRawHex(value, palette), ok: false };
  }

  const match = REFERENCE_PATTERN.exec(value);
  const name = match?.groups?.name;
  const opacity = match?.groups?.opacity;
  if (name === undefined) {
    return {
      message: `Invalid color reference "${value}" – expected "<name>", "<name>/<opacity>" or "${TRANSPARENT}".`,
      ok: false,
    };
  }
  if (name === TRANSPARENT) {
    return { message: `"${TRANSPARENT}" can't have an opacity.`, ok: false };
  }

  const hex = palette.get(name);
  if (hex === undefined) {
    return { message: unknownColorMessage(name, palette.keys()), ok: false };
  }
  if (opacity === undefined) {
    return { hex, ok: true };
  }

  const alpha = OPACITY_STEPS.get(Number(opacity));
  if (alpha === undefined) {
    return {
      message: `Opacity "/${opacity}" is not allowed – use one of: ${[...OPACITY_STEPS.keys()].join(', ')}.`,
      ok: false,
    };
  }
  return { hex: `${hex}${alpha}`, ok: true };
}
