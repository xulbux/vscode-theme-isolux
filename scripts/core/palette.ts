/**
 * Palette – Builds the typed palette (`color.violet[400]`, …) from the definition in `theme/palette.ts`.
 *
 * Palette definition:
 * ```ts
 * export const color = definePalette({
 *   gray: { 50: '#FAFAFA', …, 950: '#000000' }, // Manual shade scale (every shade required).
 *   violet: '#AA94FF',                          // Base color → `violet[50]` … `violet[950]` (generated, `400` = base).
 * });
 * ```
 * - A hex color is a base color: the whole shade scale is generated from it (see `shades.ts`).
 * - An object is a manual shade scale and must define exactly the Tailwind `SHADES`.
 * - The palette is the only place for hex colors. Every color handed to the token definitions is a `ThemeColor`
 *   created here (or derived from one, see `tokens.ts`); The build rejects any other value.
 *
 * Problems are collected and thrown together as one error when the palette is defined (i.e., imported).
 */

import type { Palette, PaletteDefinition, Shade, ShadeScale, ThemeColor } from '../types/index.ts';
import { isOpaqueHexColor } from '../utils/color.ts';
import { isPlainObject } from '../utils/object.ts';
import { generateShades, TARGET_LIGHTNESS, validateBaseColor } from './shades.ts';

// ---------------------------------------- CONSTS ---------------------------------------

/**
 * Allowed shade steps (the Tailwind steps).
 * Restricting the shades keeps the palette small and prevents near-duplicate in-between colors.
 */
const SHADES: readonly Shade[] = [...TARGET_LIGHTNESS.keys()];

/** Every `ThemeColor` created by `createThemeColor` (to tell them apart from hand-written objects). */
const THEME_COLORS = new WeakSet<object>();

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a palette family name (lowercase letters and digits, starting with a letter). */
const FAMILY_NAME_RX = /^[a-z][a-z0-9]*$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Create a frozen color and register it, so `isThemeColor` accepts it. */
function registerColor(name: string, hex: string): ThemeColor {
  const color: ThemeColor = Object.freeze({ hex, name });
  THEME_COLORS.add(color);
  return color;
}

/** Build a shade scale from `#RRGGBB` hex colors by shade. */
function toScale(family: string, hexes: ReadonlyMap<Shade, string>): ShadeScale {
  return Object.freeze(
    Object.fromEntries(
      SHADES.map((shade) => [shade, registerColor(`${family}-${shade}`, hexes.get(shade) ?? '')])
    )
  ) as ShadeScale;
}

/**
 * Build the shade scale of a single palette family.
 * @returns The scale, or `undefined` if the definition is invalid (the problem is appended to `problems` then).
 */
function buildScale(family: string, value: unknown, problems: string[]): ShadeScale | undefined {
  if (typeof value === 'string') {
    if (!isOpaqueHexColor(value)) {
      problems.push(`"${family}": Expected an opaque "#RRGGBB" base color, got "${value}".`);
      return undefined;
    }
    const baseError = validateBaseColor(value);
    if (baseError !== undefined) {
      problems.push(`"${family}": ${baseError}`);
      return undefined;
    }
    return toScale(family, generateShades(value));
  }

  if (!isPlainObject(value)) {
    problems.push(`"${family}": Expected a base color or a shade scale.`);
    return undefined;
  }
  const keys = Object.keys(value);
  const invalid = keys.filter((key) => !SHADES.some((shade) => String(shade) === key));
  const missing = SHADES.filter((shade) => !(String(shade) in value));
  const nonHex = SHADES.filter(
    (shade) => String(shade) in value && !isOpaqueHexColor(value[shade])
  );
  if (invalid.length > 0 || missing.length > 0 || nonHex.length > 0) {
    problems.push(
      `"${family}": A manual shade scale must define every shade (${SHADES.join(', ')}) as an opaque "#RRGGBB" color – or use a single base color instead to generate all shades.${invalid.length > 0 ? ` Not allowed: ${invalid.join(', ')}.` : ''}${missing.length > 0 ? ` Missing: ${missing.join(', ')}.` : ''}${nonHex.length > 0 ? ` Invalid: ${nonHex.join(', ')}.` : ''}`
    );
    return undefined;
  }
  const hexes = new Map(SHADES.map((shade) => [shade, String(value[shade]).toUpperCase()]));
  return toScale(family, hexes);
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Create a `ThemeColor` (frozen, and registered so `isThemeColor` accepts it).
 *
 * @param name   Readable name for diagnostics (e.g., `violet-400`).
 * @param hex    The `#RRGGBB` or `#RRGGBBAA` hex color.
 */
export function createThemeColor(name: string, hex: string): ThemeColor {
  return registerColor(name, hex);
}

/** Check if a value is a `ThemeColor` created by the palette (or derived from one). */
export function isThemeColor(value: unknown): value is ThemeColor {
  return typeof value === 'object' && value !== null && THEME_COLORS.has(value);
}

/**
 * Define the palette: generate (or validate) the shade scale of every color family.
 * @throws {Error} If any family is invalid (listing every problem).
 */
export function definePalette<const T extends PaletteDefinition>(definition: T): Palette<T> {
  const problems: string[] = [];
  const palette: Record<string, ShadeScale> = {};

  for (const [family, value] of Object.entries(definition)) {
    if (FAMILY_NAME_RX.test(family)) {
      const scale = buildScale(family, value, problems);
      if (scale !== undefined) {
        palette[family] = scale;
      }
    } else {
      problems.push(
        `"${family}": Invalid family name – use lowercase letters and digits, starting with a letter.`
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid palette:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  }
  return Object.freeze(palette) as Palette<T>;
}
