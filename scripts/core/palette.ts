/**
 * Palette – Flattens a theme's nested `palette` object and resolves color references against it.
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
 *   Aliases can scale the lightness (e.g., `"bg-hover": "ui-accent-bg%94"`), so derived colors follow their source.
 *
 * Color references (inside `colors`, `tokenColors` and `semanticTokenColors`):
 * - `violet-400`        – The palette color as-is
 * - `violet-400/20`     – The palette color at one of the allowed `OPACITY_STEPS` (in %)
 * - `violet-400%90`     – The palette color with its OKLCH lightness scaled to 90 % (`MIN_LIGHTNESS` – `MAX_LIGHTNESS`),
 *                         for subtle variants (e.g., hover colors) in between the shades
 * - `violet-400%90/20`  – Both (the lightness is scaled first)
 * - `transparent`       – Fully transparent
 *
 * Color pairs (only for the foreground keys of `CONTRAST_PAIRS` in `contrast.ts`):
 * - `gray-900|gray-50` – Whichever of the two references has the better contrast against the key's background
 */

import type { BuildIssue, ColorResolution, Palette } from '../types/index.ts';
import { scaleLightness } from '../utils/color.ts';
import { isPlainObject } from '../utils/object.ts';
import { findClosest } from '../utils/strings.ts';
import { generateShades, TARGET_LIGHTNESS, validateBaseColor } from './shades.ts';

// ---------------------------------------- CONSTS ---------------------------------------

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

/**
 * Lowest allowed lightness modifier (in % of the color's perceived lightness, see `scaleLightness`).
 * Lightness modifiers are meant for subtle variants; Bigger differences should use another shade.
 */
export const MIN_LIGHTNESS = 50;

/** Highest allowed lightness modifier (in % of the color's perceived lightness, see `scaleLightness`). */
export const MAX_LIGHTNESS = 150;

/** Keyword for a fully transparent color. */
export const TRANSPARENT = 'transparent';

/** Separates the two references of a color pair (e.g., `gray-900|gray-50`). */
export const COLOR_PAIR_SEPARATOR = '|';

/** Separates a palette color name from its lightness modifier (e.g., `violet-400%90`). */
export const LIGHTNESS_SEPARATOR = '%';

/**
 * Allowed numeric shade keys (the Tailwind steps).
 * Restricting the shades keeps the palette small and prevents near-duplicate in-between colors.
 */
export const SHADES: ReadonlySet<string> = new Set([...TARGET_LIGHTNESS.keys()].map(String));

const TRANSPARENT_HEX = '#00000000';

/** The lightness modifier that leaves a color unchanged (in %). */
const NEUTRAL_LIGHTNESS = 100;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches an opaque `#RRGGBB` hex color. */
const HEX_RX = /^#[0-9A-F]{6}$/i;

/** Matches any hex color notation (`#RGB`, `#RGBA`, `#RRGGBB` or `#RRGGBBAA`). */
const ANY_HEX_RX = /^#(?:[0-9A-F]{3,4}|[0-9A-F]{6}|[0-9A-F]{8})$/i;

/** Matches a single palette key (lowercase letters and digits, joined by dashes). */
const NAME_SEGMENT_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Matches a full palette color name (like a key, but starting with a letter). */
const NAME_RX = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Matches an alias value (`<name>` or `<name>%<lightness>`). */
const ALIAS_RX = /^(?<name>[a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?:%(?<lightness>\d+))?$/;

/** Matches a color reference (`<name>`, optionally followed by `%<lightness>` and / or `/<opacity>`). */
const REFERENCE_RX = /^(?<name>[a-z][a-z0-9-]*)(?:%(?<lightness>\d+))?(?:\/(?<opacity>\d+))?$/;

/** Matches a numeric key (a shade). */
const NUMERIC_RX = /^\d+$/;

// -------------------------------------- INTERNALS --------------------------------------

function unknownColorMessage(name: string, knownNames: Iterable<string>): string {
  const hint = findClosest(name, knownNames);
  return `Unknown palette color "${name}".${hint ? ` Did you mean "${hint}"?` : ''}`;
}

/**
 * Apply an optional lightness modifier (in %, see `MIN_LIGHTNESS` / `MAX_LIGHTNESS`) to an opaque color.
 * @returns The adjusted `#RRGGBB` color, or an error message if the modifier isn't allowed.
 */
function applyLightness(hex: string, lightness: string | undefined): ColorResolution {
  if (lightness === undefined) {
    return { hex, ok: true };
  }
  const percent = Number(lightness);
  if (percent === NEUTRAL_LIGHTNESS) {
    return {
      message: `Lightness "${LIGHTNESS_SEPARATOR}${lightness}" has no effect – remove it.`,
      ok: false,
    };
  }
  if (percent < MIN_LIGHTNESS || percent > MAX_LIGHTNESS) {
    return {
      message: `Lightness "${LIGHTNESS_SEPARATOR}${lightness}" is not allowed – use ${MIN_LIGHTNESS} to ${MAX_LIGHTNESS} (in % of the color's perceived lightness); For bigger differences, use another shade.`,
      ok: false,
    };
  }
  return { hex: scaleLightness(hex, percent / 100), ok: true };
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
  if (!keys.some((key) => NUMERIC_RX.test(key))) {
    return undefined;
  }
  const named = keys.filter((key) => !NUMERIC_RX.test(key));
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
    const isBaseColor = prefix === '' && typeof value === 'string' && HEX_RX.test(value);
    const baseError = isBaseColor ? validateBaseColor(value) : undefined;

    if (!NAME_SEGMENT_RX.test(key) || !NAME_RX.test(name)) {
      issues.push({
        message:
          'Invalid palette key – use lowercase letters, digits and dashes, starting with a letter.',
        path,
      });
    } else if (name === TRANSPARENT) {
      issues.push({ message: `"${TRANSPARENT}" is a reserved keyword.`, path });
    } else if (NUMERIC_RX.test(key) && !SHADES.has(key)) {
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
      // An invalid base still generates its shades, so references to the family
      // (and the generated schema) stay intact and only the base color itself is reported.
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

  const alias = ALIAS_RX.exec(value)?.groups;
  let result: ColorResolution = {
    message: `Expected an opaque "#RRGGBB" hex color or the name of another palette color (optionally with a lightness, e.g., "violet-500${LIGHTNESS_SEPARATOR}90"), got "${value}".`,
    ok: false,
  };
  if (HEX_RX.test(value)) {
    result = { hex: value.toUpperCase(), ok: true };
  } else if (alias?.name !== undefined) {
    result = resolveEntry(alias.name, entries, resolved, [...chain, name]);
    if (result.ok) {
      result = applyLightness(result.hex, alias.lightness);
    }
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

// -------------------------------------- PUBLIC API -------------------------------------

/** Check if a color value is a color pair (two references joined by `COLOR_PAIR_SEPARATOR`). */
export function isColorPair(value: unknown): value is string {
  return typeof value === 'string' && value.includes(COLOR_PAIR_SEPARATOR);
}

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
 * Get the palette color name of a color reference (e.g., `violet-400` for `violet-400%90/20`).
 * @returns The name, or `undefined` if `value` isn't a valid reference (or is `transparent`).
 */
export function referenceName(value: unknown): string | undefined {
  const name = typeof value === 'string' ? REFERENCE_RX.exec(value)?.groups?.name : undefined;
  return name === TRANSPARENT ? undefined : name;
}

/**
 * Resolve a color reference (`name`, `name%lightness`, `name/opacity`, `name%lightness/opacity` or `transparent`)
 * to a hex color.
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
  if (ANY_HEX_RX.test(value)) {
    return { message: describeRawHex(value, palette), ok: false };
  }

  const groups = REFERENCE_RX.exec(value)?.groups;
  const name = groups?.name;
  if (name === undefined) {
    return {
      message: `Invalid color reference "${value}" – expected "<name>", "<name>${LIGHTNESS_SEPARATOR}<lightness>", "<name>/<opacity>" (or both) or "${TRANSPARENT}".`,
      ok: false,
    };
  }
  if (name === TRANSPARENT) {
    return { message: `"${TRANSPARENT}" can't have a lightness or an opacity.`, ok: false };
  }

  const hex = palette.get(name);
  if (hex === undefined) {
    return { message: unknownColorMessage(name, palette.keys()), ok: false };
  }
  const adjusted = applyLightness(hex, groups?.lightness);
  if (!adjusted.ok || groups?.opacity === undefined) {
    return adjusted;
  }

  const alpha = OPACITY_STEPS.get(Number(groups.opacity));
  if (alpha === undefined) {
    return {
      message: `Opacity "/${groups.opacity}" is not allowed – use one of: ${[...OPACITY_STEPS.keys()].join(', ')}.`,
      ok: false,
    };
  }
  return { hex: `${adjusted.hex}${alpha}`, ok: true };
}
