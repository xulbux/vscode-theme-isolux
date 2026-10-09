/**
 * Palette – The raw colors shared by every Isolux theme.
 *
 * This is the only place for hex colors. Chromatic families are defined by a base color (shade `400`);
 * other shades are generated. Bases must have the same OKLCH lightness. The neutral `gray` scale is defined manually.
 */

import { definePalette } from '../scripts/api.ts';

export const color = definePalette({
  gray: {
    50: '#FAFAFA',
    100: '#E2E2E2',
    200: '#BDBDBD',
    300: '#8A8A8A',
    400: '#646464',
    500: '#3D3D3D',
    600: '#2C2C2C',
    700: '#242424',
    800: '#181818',
    900: '#101010',
    950: '#000000',
  },
  red: '#FF7680',
  orange: '#FF7A57',
  amber: '#EC8C49',
  green: '#60C077',
  cyan: '#46BDB6',
  indigo: '#909FFF',
  violet: '#AF91FF',
  purple: '#C386FF',
  fuchsia: '#E470F6',
});
