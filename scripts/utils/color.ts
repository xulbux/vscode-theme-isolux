/**
 * Color math – Conversions between sRGB hex and OKLCH, gamut mapping and WCAG contrast.
 *
 * OKLCH (https://bottosson.github.io/posts/oklab/) is a perceptual color space:
 * - `l` – Perceived lightness (`0` = black, `1` = white)
 * - `c` – Chroma (colorfulness, `0` = gray)
 * - `h` – Hue angle in degrees
 * Equal steps in `l` look like equal steps in brightness, regardless of the hue.
 *
 * Gamut checks support sRGB (what themes can show) and Display P3 (the wider gamut of e.g., Tailwind v4's palette).
 */

import type { Gamut, Oklch } from '../types/index.ts';

// ---------------------------------------- TYPES ----------------------------------------

type Rgb = [r: number, g: number, b: number];

// ---------------------------------------- CONSTS ---------------------------------------

/** Tolerance for rounding errors when checking whether a linear RGB channel is within `[0, 1]`. */
const GAMUT_EPSILON = 1e-4;

/** Number of bisection steps when searching the maximum in-gamut chroma (precision ≈ `0.4 / 2^24`). */
const CHROMA_SEARCH_STEPS = 24;

/** Upper bound for the chroma search; No sRGB or Display P3 color has a higher chroma. */
const MAX_SEARCH_CHROMA = 0.4;

/** Linear sRGB → linear Display P3 (both use the D65 white point). */
const SRGB_TO_P3: readonly Rgb[] = [
  [0.8224621209, 0.177537994, 0],
  [0.0331941989, 0.9668058011, 0],
  [0.0170826307, 0.0723974407, 0.9105199286],
];

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a `#RRGGBB` or `#RRGGBBAA` hex color. */
const HEX_RX = /^#(?<rgb>[0-9A-F]{6})(?<alpha>[0-9A-F]{2})?$/i;

/** Matches a CSS `oklch()` color with a percentage lightness (e.g., `oklch(70.4% 0.191 22.216)`). */
const OKLCH_RX =
  /^oklch\(\s*(?<l>\d+(?:\.\d+)?)%\s+(?<c>\d+(?:\.\d+)?)\s+(?<h>\d+(?:\.\d+)?|none)\s*\)$/i;

// -------------------------------------- INTERNALS --------------------------------------

function parseHex(hex: string): { rgb: Rgb; alpha: number } {
  const match = HEX_RX.exec(hex);
  const rgb = match?.groups?.rgb;
  if (rgb === undefined) {
    throw new Error(`Invalid hex color "${hex}" – expected "#RRGGBB" or "#RRGGBBAA".`);
  }
  const alpha = match?.groups?.alpha;
  return {
    alpha: alpha === undefined ? 1 : Number.parseInt(alpha, 16) / 255,
    rgb: [0, 2, 4].map((offset) => Number.parseInt(rgb.slice(offset, offset + 2), 16)) as Rgb,
  };
}

function toHexByte(channel: number): string {
  return Math.round(Math.min(1, Math.max(0, channel)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

/** sRGB gamma-encoded channel (`0`–`1`) → linear light. */
function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Linear light → sRGB gamma-encoded channel (`0`–`1`). */
function fromLinear(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/** OKLCH → linear sRGB (channels may be outside `[0, 1]` for out-of-gamut colors). */
function oklchToLinearRgb({ l, c, h }: Oklch): Rgb {
  const hue = (h * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);

  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ] as const;

  return [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ];
}

/** Linear sRGB → linear Display P3. */
function linearSrgbToP3(rgb: Rgb): Rgb {
  return SRGB_TO_P3.map((row) => row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]) as Rgb;
}

/** Check if a linear sRGB color (channels may be outside `[0, 1]`) lies within `gamut`. */
function isInGamut(rgb: Rgb, gamut: Gamut): boolean {
  const channels = gamut === 'p3' ? linearSrgbToP3(rgb) : rgb;
  return channels.every((channel) => channel >= -GAMUT_EPSILON && channel <= 1 + GAMUT_EPSILON);
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Check if a value is a `#RRGGBB` or `#RRGGBBAA` hex color. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RX.test(value);
}

/**
 * Convert an opaque `#RRGGBB` hex color to OKLCH (the alpha channel of `#RRGGBBAA` is ignored).
 */
export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = parseHex(hex).rgb.map((channel) => toLinear(channel / 255)) as Rgb;

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(bb, a) * 180) / Math.PI;

  return { c: Math.hypot(a, bb), h: hue < 0 ? hue + 360 : hue, l: lightness };
}

/**
 * Parse a CSS `oklch()` color with a percentage lightness (e.g., `oklch(70.4% 0.191 22.216)`).
 * A `none` hue (achromatic colors) is read as `0`.
 * @throws {Error} If the value isn't such an `oklch()` color.
 */
export function parseOklch(value: string): Oklch {
  const groups = OKLCH_RX.exec(value.trim())?.groups;
  if (groups?.l === undefined || groups.c === undefined || groups.h === undefined) {
    throw new Error(`Invalid OKLCH color "${value}" – expected "oklch(<l>% <c> <h>)".`);
  }
  return {
    c: Number(groups.c),
    h: groups.h.toLowerCase() === 'none' ? 0 : Number(groups.h),
    l: Number(groups.l) / 100,
  };
}

/**
 * Get the highest chroma a color with the given lightness and hue can have while staying within `gamut`.
 *
 * @param l       OKLCH lightness.
 * @param h       OKLCH hue, in degrees.
 * @param gamut   The gamut to stay within (defaults to sRGB).
 */
export function maxChroma(l: number, h: number, gamut: Gamut = 'srgb'): number {
  let low = 0;
  let high = MAX_SEARCH_CHROMA;
  for (let step = 0; step < CHROMA_SEARCH_STEPS; step += 1) {
    const mid = (low + high) / 2;
    if (isInGamut(oklchToLinearRgb({ c: mid, h, l }), gamut)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return low;
}

/**
 * Convert an OKLCH color to an opaque `#RRGGBB` hex color.
 * Out-of-gamut colors are mapped into sRGB by reducing their chroma (keeping lightness and hue).
 */
export function oklchToHex(color: Oklch): string {
  const inGamut = isInGamut(oklchToLinearRgb(color), 'srgb');
  const rgb = oklchToLinearRgb(inGamut ? color : { ...color, c: maxChroma(color.l, color.h) });
  return `#${rgb.map((channel) => toHexByte(fromLinear(channel))).join('')}`;
}

/**
 * Scale the OKLCH lightness of an opaque color, keeping its chroma and hue.
 * Results outside of sRGB are mapped back into it (see `oklchToHex`).
 *
 * @param hex      The `#RRGGBB` color.
 * @param factor   Lightness multiplier (e.g., `0.9` for a 10 % darker color).
 */
export function scaleLightness(hex: string, factor: number): string {
  const color = hexToOklch(hex);
  return oklchToHex({ ...color, l: Math.min(1, Math.max(0, color.l * factor)) });
}

/**
 * Alpha-composite a (possibly translucent) `#RRGGBBAA` color over an opaque background.
 * @returns The resulting opaque `#RRGGBB` color.
 */
export function composite(color: string, background: string): string {
  const fg = parseHex(color);
  const bg = parseHex(background);
  const mixed = fg.rgb.map((channel, index) => {
    const under = bg.rgb[index] ?? 0;
    return (channel * fg.alpha + under * (1 - fg.alpha)) / 255;
  });
  return `#${mixed.map((channel) => toHexByte(channel)).join('')}`;
}

/**
 * WCAG 2 relative luminance of an opaque color.
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).rgb.map((channel) => toLinear(channel / 255)) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2 contrast ratio between two opaque colors (`1` to `21`).
 */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
