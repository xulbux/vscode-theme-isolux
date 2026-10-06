/** A color gamut (range of displayable colors): `srgb` (what themes can show) or `p3` (Display P3, wider). */
export type Gamut = 'srgb' | 'p3';

/** A color in the OKLCH color space. */
export interface Oklch {
  /** OKLCH lightness, from `0` (black) to `1` (white). */
  l: number;
  /** Chroma (colorfulness), from `0` (gray) upwards (~ `0.32` at most within sRGB, ~ `0.37` within Display P3). */
  c: number;
  /** Hue angle in degrees, from `0` to `360`. */
  h: number;
}
