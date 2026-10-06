/** Which part of a token style a color value sets. */
export type TokenColorRole = 'foreground' | 'background';

/**
 * Called for every color value of the token colors (see `forEachTokenColor`).
 *
 * @param target   The object holding the color value (it's `target[key]`).
 * @param key      The property of `target` that holds the color value.
 * @param path     JSON path to the color value (e.g., `tokenColors[3].settings.foreground`).
 * @param role     Whether the value is a foreground or a background color.
 */
export type TokenColorVisitor = (
  target: Record<string, unknown>,
  key: string,
  path: string,
  role: TokenColorRole
) => void;
