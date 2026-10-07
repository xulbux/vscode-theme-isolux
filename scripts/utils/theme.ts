/**
 * Theme helpers – Access the color values of a (compiled or source) VS Code theme object.
 */

import type { TokenColorRole, TokenColorVisitor } from '../types/index.ts';
import { isHexColor } from './color.ts';
import { isPlainObject } from './object.ts';

// ---------------------------------------- CONSTS ---------------------------------------

/** Color properties inside `tokenColors[].settings`. */
const TOKEN_SETTINGS_COLOR_KEYS: readonly TokenColorRole[] = ['foreground', 'background'];

/** Color properties inside `semanticTokenColors` style objects (VS Code doesn't support a background there). */
const SEMANTIC_STYLE_COLOR_KEYS: readonly TokenColorRole[] = ['foreground'];

// -------------------------------------- INTERNALS --------------------------------------

/** Call `visit` for every color property of a token style (`keys`) that is set. */
function visitStyle(
  style: Record<string, unknown>,
  keys: readonly TokenColorRole[],
  path: string,
  visit: TokenColorVisitor
): void {
  for (const key of keys) {
    if (key in style) {
      visit(style, key, `${path}.${key}`, key);
    }
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Get the JSON path of a `colors` key (e.g., `colors["editor.background"]`). */
export function colorKeyPath(key: string): string {
  return `colors[${JSON.stringify(key)}]`;
}

/** Get the `colors` object of a theme (an empty object if it isn't set or isn't an object). */
export function readColors(theme: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return isPlainObject(theme.colors) ? theme.colors : {};
}

/** Read a resolved `colors` value; Values that aren't hex colors (yet) are treated as not set. */
export function readHexColor(
  colors: Readonly<Record<string, unknown>>,
  key: string
): string | undefined {
  const value = colors[key];
  return isHexColor(value) ? value : undefined;
}

/**
 * Call `visit` for every color value that is set in the token colors of a theme:
 * - `tokenColors[].settings.foreground` / `.background`
 * - `semanticTokenColors.*` (string values, or `.foreground` of style objects)
 *
 * A string `tokenColors` value (a path to an external TextMate theme) is skipped.
 */
export function forEachTokenColor(
  theme: Readonly<Record<string, unknown>>,
  visit: TokenColorVisitor
): void {
  const { semanticTokenColors, tokenColors } = theme;

  if (Array.isArray(tokenColors)) {
    for (const [index, rule] of tokenColors.entries()) {
      if (isPlainObject(rule) && isPlainObject(rule.settings)) {
        visitStyle(
          rule.settings,
          TOKEN_SETTINGS_COLOR_KEYS,
          `tokenColors[${index}].settings`,
          visit
        );
      }
    }
  }

  if (isPlainObject(semanticTokenColors)) {
    for (const [selector, value] of Object.entries(semanticTokenColors)) {
      const path = `semanticTokenColors[${JSON.stringify(selector)}]`;
      if (isPlainObject(value)) {
        visitStyle(value, SEMANTIC_STYLE_COLOR_KEYS, path, visit);
      } else {
        visit(semanticTokenColors, selector, path, 'foreground');
      }
    }
  }
}
