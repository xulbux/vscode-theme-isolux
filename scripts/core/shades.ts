/**
 * Shade generator – Derives a full Tailwind-like shade scale (`50` – `950`) from a single base color.
 *
 * The base color becomes shade `BASE_SHADE` (400) exactly. The other shades are placed in OKLCH:
 * - Lightness: every shade uses its `TARGET_LIGHTNESS`. Base colors must have the target lightness of
 *   `BASE_SHADE` as well (see `validateBaseColor`), so the same shade looks equally bright in every color family.
 * - Saturation and hue: Taken from Tailwind's own color scales (the `tailwindcss` dev dependency).
 *   For every Tailwind family, it's measured how each shade's relative saturation
 *   (its chroma relative to the most colorful color the gamut can show at its lightness and hue
 *   and hue differ from its `400` shade. A base color follows the profile of the Tailwind families closest to its hue
 *   (interpolated between the two neighbors), applied to its own relative saturation and hue.
 *   This way:
 *   - a more or less saturated base makes the whole scale more or less saturated,
 *   - each hue gets Tailwind's hand-tuned behavior
 *     (e.g., richer darker violets, calmer dark blues, ambers that turn warmer towards `950` instead of olive),
 *   - the shades never leave the sRGB gamut.
 *
 * Tailwind's (v4) palette is designed for the wide Display P3 gamut, so many of its colors can't be shown in sRGB.
 * Its saturation is therefore measured relative to P3 (`TAILWIND_GAMUT`), but applied relative to sRGB.
 * This scales P3 down to sRGB proportionally instead of clipping it, so the shape of every scale is kept.
 *
 * `400` is the base (instead of Tailwind's `500`), because it's the shade most color references use:
 * On a dark background, syntax and UI accent colors need to be as bright as `400`.
 */

import tailwindColors from 'tailwindcss/colors';
import type { Gamut, Oklch, Shade } from '../types/index.ts';
import { hexToOklch, maxChroma, oklchToHex, parseOklch } from '../utils/color.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** A chromatic Tailwind color family (e.g., `red`). */
type TailwindFamily = (typeof TAILWIND_FAMILIES)[number];

/** How a shade differs from the `BASE_SHADE` of its scale. */
interface ShadeProfile {
  /** Relative saturation, as a multiple of the base's relative saturation. */
  saturation: number;
  /** Hue difference to the base, in degrees. */
  hueShift: number;
}

/** The shade profiles of a Tailwind color family, located by the hue of its `BASE_SHADE`. */
interface FamilyProfile {
  /** OKLCH hue of the family's `BASE_SHADE`, in degrees. */
  hue: number;
  /** The profile of every shade, by shade. */
  shades: ReadonlyMap<number, ShadeProfile>;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** The shade that is set to the base color itself. */
const BASE_SHADE: Shade = 400;

/** Tailwind's chromatic color families, used as the reference (the neutral gray scales are left out). */
const TAILWIND_FAMILIES = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
] as const;

/** The gamut Tailwind's palette is designed for; Its saturation is measured relative to it. */
const TAILWIND_GAMUT: Gamut = 'p3';

/**
 * OKLCH lightness of every shade, shared by all generated color families.
 * Close to the average lightness of Tailwind's chromatic scales.
 */
export const TARGET_LIGHTNESS: ReadonlyMap<Shade, number> = new Map([
  [50, 0.97],
  [100, 0.93],
  [200, 0.88],
  [300, 0.81],
  [400, 0.73],
  [500, 0.66],
  [600, 0.59],
  [700, 0.52],
  [800, 0.45],
  [900, 0.38],
  [950, 0.29],
]);

/**
 * How far a base color's lightness may deviate from the target.
 * Slightly above the rounding error of 8-bit hex colors (≈ `0.0015`).
 */
const BASE_LIGHTNESS_TOLERANCE = 0.002;

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Get the `TARGET_LIGHTNESS` of a shade.
 * @throws {Error} If the shade isn't one of the Tailwind steps.
 */
function targetLightness(shade: Shade): number {
  const lightness = TARGET_LIGHTNESS.get(shade);
  if (lightness === undefined) {
    throw new Error(`Unknown shade "${shade}".`);
  }
  return lightness;
}

/**
 * Relative saturation of a color: Its chroma relative to the highest chroma `gamut` allows at its lightness and hue.
 *
 * @param l       OKLCH lightness.
 * @param c       OKLCH chroma.
 * @param h       OKLCH hue, in degrees.
 * @param gamut   The gamut to measure against (defaults to sRGB).
 */
function relativeSaturation(l: number, c: number, h: number, gamut: Gamut = 'srgb'): number {
  return Math.min(1, c / Math.max(maxChroma(l, h, gamut), Number.EPSILON));
}

/** Signed difference from hue `from` to hue `to`, in degrees (`-180` to `180`). */
function hueDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/** Normalize a hue angle to `0` – `360`. */
function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

/**
 * Get a shade of a Tailwind color family in OKLCH.
 * @throws {Error} If the shade is missing or isn't an `oklch()` color.
 */
function tailwindColor(family: TailwindFamily, shade: number): Oklch {
  const scale: Readonly<Record<string, string | undefined>> = tailwindColors[family];
  const value = scale[String(shade)];
  if (value === undefined) {
    throw new Error(
      `Tailwind color "${family}-${shade}" is missing – check the "tailwindcss" dev dependency.`
    );
  }
  return parseOklch(value);
}

/**
 * Measure the shade profiles of every Tailwind color family (relative to `TAILWIND_GAMUT`), sorted by hue.
 * @throws {Error} If a family is missing a shade.
 */
function buildFamilyProfiles(): FamilyProfile[] {
  return TAILWIND_FAMILIES.map((family) => {
    const base = tailwindColor(family, BASE_SHADE);
    const baseSaturation = relativeSaturation(base.l, base.c, base.h, TAILWIND_GAMUT);
    const shades = new Map(
      [...TARGET_LIGHTNESS.keys()].map((shade) => {
        const color = tailwindColor(family, shade);
        const profile: ShadeProfile = {
          hueShift: hueDelta(base.h, color.h),
          saturation:
            relativeSaturation(color.l, color.c, color.h, TAILWIND_GAMUT) / baseSaturation,
        };
        return [shade, profile] as const;
      })
    );
    return { hue: base.h, shades };
  }).toSorted((a, b) => a.hue - b.hue);
}

/** The measured Tailwind family profiles (see `getFamilyProfiles`); Built on first use. */
let familyProfiles: FamilyProfile[] | undefined = undefined;

/** Get the shade profiles of every Tailwind color family, sorted by hue (measured once, on first use). */
function getFamilyProfiles(): FamilyProfile[] {
  familyProfiles ??= buildFamilyProfiles();
  return familyProfiles;
}

/**
 * Get the shade profile for a hue, interpolated between the two Tailwind families closest to it.
 */
function profileForHue(hue: number, shade: number): ShadeProfile {
  const profiles = getFamilyProfiles();
  const upperIndex = profiles.findIndex((family) => family.hue > hue);
  const upper = profiles.at(upperIndex === -1 ? 0 : upperIndex);
  const lower = profiles.at(upperIndex === -1 ? -1 : upperIndex - 1);
  const lowerShade = lower?.shades.get(shade);
  const upperShade = upper?.shades.get(shade);
  if (lower === undefined || upper === undefined || !lowerShade || !upperShade) {
    return { hueShift: 0, saturation: 1 };
  }

  const span = normalizeHue(upper.hue - lower.hue) || 360;
  const t = normalizeHue(hue - lower.hue) / span;
  return {
    hueShift: lowerShade.hueShift + (upperShade.hueShift - lowerShade.hueShift) * t,
    saturation: lowerShade.saturation + (upperShade.saturation - lowerShade.saturation) * t,
  };
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Check whether a color can be used as a base color (it must have the target lightness of `BASE_SHADE`).
 * @returns An error message (suggesting a corrected base with the same hue and saturation), or `undefined` if the color is a valid base.
 */
export function validateBaseColor(hex: string): string | undefined {
  const { l, c, h } = hexToOklch(hex);
  const target = targetLightness(BASE_SHADE);
  if (Math.abs(l - target) <= BASE_LIGHTNESS_TOLERANCE) {
    return undefined;
  }
  const suggestion = oklchToHex({
    c: relativeSaturation(l, c, h) * maxChroma(target, h),
    h,
    l: target,
  });
  return `Base color "${hex}" is too ${l > target ? 'light' : 'dark'} (OKLCH lightness ${l.toFixed(3)}) – every base must have the lightness ${target} (±${BASE_LIGHTNESS_TOLERANCE}), so all color families look equally bright. Use "${suggestion}" instead (same hue and saturation).`;
}

/**
 * Generate all shades from a base color (see the module docs). Validate the base with `validateBaseColor` first.
 * @returns `#RRGGBB` hex colors by shade, from `50` to `950`.
 */
export function generateShades(baseHex: string): Map<Shade, string> {
  const base = hexToOklch(baseHex);
  const saturation = relativeSaturation(base.l, base.c, base.h);
  const shades = new Map<Shade, string>();

  for (const [shade, l] of TARGET_LIGHTNESS) {
    if (shade === BASE_SHADE) {
      shades.set(shade, baseHex.toUpperCase());
    } else {
      const profile = profileForHue(base.h, shade);
      const h = normalizeHue(base.h + profile.hueShift);
      const c = Math.min(1, saturation * profile.saturation) * maxChroma(l, h);
      shades.set(shade, oklchToHex({ c, h, l }));
    }
  }
  return shades;
}
