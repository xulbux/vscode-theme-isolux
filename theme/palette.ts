/**
 * Palette – The raw colors shared by every XulbuX theme.
 *
 * This is the only place for hex colors. Every chromatic family is defined by its base color, which becomes
 * shade `400`; All other shades are generated (see `scripts/core/shades.ts`). Every base must have the same
 * OKLCH lightness, so all families look equally bright (the build suggests a corrected hex otherwise).
 * The neutral `gray` scale can't be generated and is defined shade by shade.
 */

import { definePalette } from '../scripts/api.ts';

export const color = definePalette({
  amber: '#EC8C49',
  coral: '#FA7D6C',
  cyan: '#46BDB6',
  fuchsia: '#E66FF3',
  gray: {
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
  },
  green: '#60C077',
  indigo: '#959DFF',
  orange: '#EF8862',
  orchid: '#D67AFD',
  pink: '#F56FCA',
  purple: '#C187FF',
  red: '#FF7680',
  rose: '#FF6EA5',
  teal: '#10C3A0',
  violet: '#AA94FF',
});
