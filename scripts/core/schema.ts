/**
 * Source schema – Generates the JSON schema of the shared theme source (`theme/theme.jsonc`).
 *
 * VS Code's built-in `vscode://schemas/color-theme` schema requires hex colors, so it would flag every token reference in the theme source.
 * Instead, the theme source points its `$schema` to a schema generated from the tokens, which:
 * - suggests every token allowed at a position (with its colors in every theme and variant) when typing a value
 * - flags unknown tokens and scope violations (UI vs. syntax tokens, see `scopes.ts`) right in the editor
 * - flags unknown `colors` keys and shows their descriptions
 *   (read from the installed VS Code, see `colorIds.ts`; The build flags unknown keys as well, see `colorKeys.ts`)
 * - flags invalid `tokenColors` structure (unknown properties, invalid `fontStyle`, …)
 *
 * VS Code's own token color schemas are still included as an `if` condition:
 * VS Code's JSON language service uses the schemas of an `if` for suggestions and hover descriptions, but never reports their problems.
 * That way the scope suggestions and descriptions always match the installed VS Code (and extensions), without its hex rules.
 */

import type { ColorDescriptions, ColorScope, ThemeTokenMap } from '../types/index.ts';
import { escapeRegExp } from '../utils/strings.ts';
import { CATEGORY_KEY_PREFIXES, scopeOfColorKey, tokenNamesInScope } from './scopes.ts';
import { TRANSPARENT } from './theme.ts';
import { VARIANTS } from './tokens.ts';

// ---------------------------------------- CONSTS ---------------------------------------

/** VS Code's built-in schema of `tokenColors` (only resolvable inside VS Code). */
const VSCODE_TEXTMATE_COLORS_SCHEMA = 'vscode://schemas/textmate-colors';

/** VS Code's built-in schema of `semanticTokenColors` (only resolvable inside VS Code). */
const VSCODE_TOKEN_STYLING_SCHEMA = 'vscode://schemas/token-styling';

/** Allowed `fontStyle` values (same pattern as VS Code's TextMate theme schema). */
const FONT_STYLE_PATTERN = String.raw`^(\s*\b(italic|bold|underline|strikethrough))*\s*$`;

/** The schema definition name of the token reference of each scope. */
const SCOPE_DEFINITIONS: Readonly<Record<ColorScope, string>> = {
  any: 'anyToken',
  syntax: 'syntaxToken',
  ui: 'uiToken',
};

// -------------------------------------- INTERNALS --------------------------------------

/** Get a `$ref` to the token reference schema of a scope. */
function tokenRef(scope: ColorScope): Record<string, unknown> {
  return { $ref: `#/definitions/${SCOPE_DEFINITIONS[scope]}` };
}

/**
 * Describe a token's colors in every theme and variant (Markdown).
 * The list follows an intro line, since VS Code renders the hover as `` `value`: description ``,
 * which would join the first list item with the value.
 */
function describeToken(name: string, themes: readonly ThemeTokenMap[]): string {
  const lines = themes.flatMap(({ id, tokens }) => {
    const token = tokens.get(name);
    if (token === undefined) {
      return [`- ${id}: *missing*`];
    }
    return VARIANTS.map((variant) => {
      const { hex, name: colorName } = token.colors[variant];
      return `- ${id} (${variant}): \`${colorName}\` \`${hex}\``;
    });
  });
  return ['resolves to:', '', ...lines].join('\n');
}

/**
 * Build the JSON schema of a token reference, limited to the tokens allowed in `scope`.
 *
 * @param names    Every token name (in definition order).
 * @param themes   The tokens of every theme (for the descriptions).
 * @param scope    The color scope the reference is used in.
 */
function buildTokenSchema(
  names: readonly string[],
  themes: readonly ThemeTokenMap[],
  scope: ColorScope
): Record<string, unknown> {
  const allowed = tokenNamesInScope(names, scope);
  return {
    enum: [TRANSPARENT, ...allowed],
    markdownEnumDescriptions: [
      'Fully transparent',
      ...allowed.map((name) => describeToken(name, themes)),
    ],
    type: 'string',
  };
}

/**
 * Build the JSON schema of the `colors` object.
 * With `knownColors`, every known key gets the token reference of its scope (and its VS Code description) and unknown keys are flagged.
 * Without, any key is accepted (category keys by prefix).
 */
function buildColorsSchema(knownColors: ColorDescriptions | undefined): Record<string, unknown> {
  if (knownColors === undefined) {
    const categoryPattern = `^(?:${CATEGORY_KEY_PREFIXES.map((prefix) => escapeRegExp(prefix)).join('|')})`;
    return {
      additionalProperties: tokenRef('ui'),
      patternProperties: { [categoryPattern]: tokenRef('any') },
      type: 'object',
    };
  }

  // Draft-07 ignores every keyword next to a `$ref` (and so does VS Code's hover);
  // The reference is wrapped in an `allOf`, so the description is shown.
  return {
    additionalProperties: false,
    properties: Object.fromEntries(
      Object.entries(knownColors).map(([id, description]) => {
        const reference = tokenRef(scopeOfColorKey(id));
        return [id, description ? { allOf: [reference], description } : reference];
      })
    ),
    type: 'object',
  };
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Generate the JSON schema of the shared theme source.
 *
 * @param sourceFile    File name of the theme source (only used for the schema title).
 * @param themes        The tokens of every theme (all themes define the same token names).
 * @param knownColors   All valid `colors` keys with their descriptions, or `undefined` to accept any key.
 */
export function generateSourceSchema(
  sourceFile: string,
  themes: readonly ThemeTokenMap[],
  knownColors?: ColorDescriptions
): Record<string, unknown> {
  const names = [...new Set(themes.flatMap(({ tokens }) => [...tokens.keys()]))];
  const syntaxToken = tokenRef('syntax');
  const fontStyle = {
    pattern: FONT_STYLE_PATTERN,
    patternErrorMessage:
      'Font style must be a combination of "italic", "bold", "underline" and "strikethrough", or empty.',
    type: 'string',
  };

  const tokenSettings = {
    additionalProperties: false,
    properties: {
      background: syntaxToken,
      fontFamily: { type: 'string' },
      fontSize: { type: 'number' },
      fontStyle,
      foreground: syntaxToken,
      lineHeight: { type: 'number' },
    },
    type: 'object',
  };
  const semanticStyle = {
    additionalProperties: false,
    properties: {
      bold: { type: 'boolean' },
      fontStyle,
      foreground: syntaxToken,
      italic: { type: 'boolean' },
      strikethrough: { type: 'boolean' },
      underline: { type: 'boolean' },
    },
    type: 'object',
  };

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    // Keys set by the build (`name`, `type`, `author`, … – see `compileTheme`) are left out, so they're flagged.
    additionalProperties: false,
    definitions: {
      anyToken: buildTokenSchema(names, themes, 'any'),
      syntaxToken: buildTokenSchema(names, themes, 'syntax'),
      uiToken: buildTokenSchema(names, themes, 'ui'),
    },
    description: 'GENERATED by `scripts/build.ts` – do not edit.',
    // Only for suggestions and descriptions; Problems of an `if` schema are never reported.
    // `colors` is left out: VS Code's color schema only accepts hex values (or `default`),
    // so for a token reference the hover would show the description of its `default` option instead of the token's own.
    if: {
      properties: {
        semanticTokenColors: { $ref: VSCODE_TOKEN_STYLING_SCHEMA },
        tokenColors: { $ref: VSCODE_TEXTMATE_COLORS_SCHEMA },
      },
    },
    properties: {
      $schema: { type: 'string' },
      colors: buildColorsSchema(knownColors),
      semanticHighlighting: { type: 'boolean' },
      semanticTokenColors: {
        additionalProperties: { anyOf: [syntaxToken, semanticStyle] },
        type: 'object',
      },
      tokenColors: {
        items: {
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            scope: { anyOf: [{ type: 'string' }, { items: { type: 'string' }, type: 'array' }] },
            settings: tokenSettings,
          },
          required: ['settings'],
          type: 'object',
        },
        type: 'array',
      },
    },
    title: `Theme source: ${sourceFile}`,
    type: 'object',
  };
}
