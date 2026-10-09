/**
 * Theme API – Everything the theme sources in `theme/*.ts` need to define the palette and the tokens.
 *
 * Re-exports the authoring functions of `core/palette.ts` and `core/tokens.ts`,
 * so the theme sources don't depend on the build's internal module layout.
 */

export { definePalette } from './core/palette.ts';
export { alpha, defineTheme, lightness, onColor, saturate } from './core/tokens.ts';
