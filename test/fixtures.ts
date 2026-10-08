/**
 * Test fixtures – The small palette the tests derive their colors from.
 */

import { definePalette } from '../scripts/core/palette.ts';

// ---------------------------------------- CONSTS ---------------------------------------

/** A valid base color (OKLCH lightness `TARGET_LIGHTNESS[400]`). */
export const VALID_BASE = '#AA94FF';

/** A manual gray scale (every shade defined). */
export const GRAY_SCALE = {
  100: '#E2E2E2',
  200: '#BDBDBD',
  300: '#8A8A8A',
  400: '#646464',
  50: '#FAFAFA',
  500: '#3D3D3D',
  600: '#2C2C2C',
  700: '#242424',
  800: '#181818',
  900: '#101010',
  950: '#000000',
} as const;

/** A small palette to derive the test tokens from. */
export const color = definePalette({ gray: GRAY_SCALE, violet: VALID_BASE });
