/**
 * Source schema generator.
 *
 * VS Code's built-in `vscode://schemas/color-theme` schema requires hex colors, so it would flag every
 * palette reference in a theme source. Instead, theme sources point their `$schema` to a schema generated
 * from their own palette, which:
 * - suggests every palette color (with its hex value) when typing a color value
 * - flags unknown palette colors, disallowed opacity steps and color scope violations right in the editor
 * - flags unknown `colors` keys and shows their descriptions (based on the `scripts/data/vscode-color-ids.json` snapshot)
 * - flags invalid `tokenColors` structure (unknown properties, invalid `fontStyle`, …)
 *
 * VS Code's own token color schemas are still included as an `if` condition: VS Code's JSON language service
 * uses the schemas of an `if` for suggestions and hover descriptions, but never reports their problems. That way
 * the scope suggestions and descriptions always match the installed VS Code (and extensions), without its hex rules.
 */

import type { ColorDescriptions, Palette } from '../types.ts';
import { OPACITY_STEPS, SHADES, TRANSPARENT } from './palette.ts';
import {
  CATEGORY_KEY_PREFIXES,
  type ColorScope,
  hasScopes,
  isAllowedInScope,
  scopeOfColorKey,
} from './scopes.ts';
import { BASE_SHADE, TARGET_LIGHTNESS } from './shades.ts';

// ---------------------------------------- CONSTS ----------------------------------------

/** VS Code's built-in schemas of `tokenColors` and `semanticTokenColors` (only resolvable inside VS Code). */
const VSCODE_TEXTMATE_COLORS_SCHEMA = 'vscode://schemas/textmate-colors';
const VSCODE_TOKEN_STYLING_SCHEMA = 'vscode://schemas/token-styling';

/** Allowed `fontStyle` values (same pattern as VS Code's TextMate theme schema). */
const FONT_STYLE_PATTERN = String.raw`^(\s*\b(italic|bold|underline|strikethrough))*\s*$`;

const HEX_PATTERN = '^#[0-9A-Fa-f]{6}$';
const NAME_PATTERN = '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$';
const NUMERIC_KEY_PATTERN = String.raw`^\d+$`;

// -------------------------------------- INTERNALS --------------------------------------

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/**
 * Build the JSON schema describing a single color reference value, limited to the colors allowed in `scope`.
 */
function buildColorReferenceSchema(palette: Palette, scope: ColorScope): Record<string, unknown> {
  const colors = [...palette].filter(([name]) => isAllowedInScope(name, scope));
  const names = colors.map(([name]) => escapeRegExp(name)).join('|');
  const steps = [...OPACITY_STEPS.keys()];

  return {
    defaultSnippets: [
      { body: TRANSPARENT, label: TRANSPARENT, markdownDescription: 'Fully transparent' },
      ...colors.map(([name, hex]) => ({
        body: name,
        label: name,
        markdownDescription: `\`${hex}\``,
      })),
    ],
    pattern: `^(?:${TRANSPARENT}|(?:${names})(?:/(?:${steps.join('|')}))?)$`,
    patternErrorMessage: `Expected a palette color allowed here ("<name>" or "<name>/<opacity>") or "${TRANSPARENT}". Allowed opacity steps: ${steps.join(', ')}.`,
    type: 'string',
  };
}

/**
 * Build the JSON schema of the `colors` object.
 * With `knownColors`, every known key gets the color reference of its scope (and its VS Code description)
 * and unknown keys are flagged. Without, any key is accepted (category keys by prefix).
 */
function buildColorsSchema(
  anyColor: Record<string, unknown>,
  uiColor: Record<string, unknown>,
  knownColors: ColorDescriptions | undefined
): Record<string, unknown> {
  if (knownColors === undefined) {
    const categoryPattern = `^(?:${CATEGORY_KEY_PREFIXES.map((prefix) => escapeRegExp(prefix)).join('|')})`;
    return {
      additionalProperties: uiColor,
      patternProperties: { [categoryPattern]: anyColor },
      type: 'object',
    };
  }

  return {
    additionalProperties: false,
    properties: Object.fromEntries(
      Object.entries(knownColors).map(([id, description]) => [
        id,
        {
          ...(scopeOfColorKey(id) === 'any' ? anyColor : uiColor),
          ...(description && { description }),
        },
      ])
    ),
    type: 'object',
  };
}

// ---------------------------------------- PUBLIC ----------------------------------------

/**
 * Generate the JSON schema for a theme source that uses the palette system.
 * @param themeFile    File name of the theme source (only used for the schema title).
 * @param knownColors  All valid `colors` keys with their descriptions, or `undefined` to accept any key.
 */
export function generateSourceSchema(
  themeFile: string,
  palette: Palette,
  knownColors?: ColorDescriptions
): Record<string, unknown> {
  const scoped = hasScopes(palette);
  const anyColor = { $ref: '#/definitions/colorReference' };
  const uiColor = scoped ? { $ref: '#/definitions/uiColorReference' } : anyColor;
  const syntaxColor = scoped ? { $ref: '#/definitions/syntaxColorReference' } : anyColor;
  const fontStyle = {
    pattern: FONT_STYLE_PATTERN,
    patternErrorMessage:
      'Font style must be a combination of "italic", "bold", "underline" and "strikethrough", or empty.',
    type: 'string',
  };

  const tokenSettings = {
    additionalProperties: false,
    properties: {
      background: syntaxColor,
      fontFamily: { type: 'string' },
      fontSize: { type: 'number' },
      fontStyle,
      foreground: syntaxColor,
      lineHeight: { type: 'number' },
    },
    type: 'object',
  };
  const semanticStyle = {
    additionalProperties: false,
    properties: {
      bold: { type: 'boolean' },
      fontStyle,
      foreground: syntaxColor,
      italic: { type: 'boolean' },
      strikethrough: { type: 'boolean' },
      underline: { type: 'boolean' },
    },
    type: 'object',
  };

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    definitions: {
      colorReference: buildColorReferenceSchema(palette, 'any'),
      ...(scoped && {
        syntaxColorReference: buildColorReferenceSchema(palette, 'syntax'),
        uiColorReference: buildColorReferenceSchema(palette, 'ui'),
      }),
      paletteGroup: {
        additionalProperties: {
          anyOf: [
            { $ref: '#/definitions/paletteValue' },
            { $ref: '#/definitions/shadeScale' },
            { $ref: '#/definitions/paletteGroup' },
          ],
        },
        propertyNames: { not: { pattern: NUMERIC_KEY_PATTERN } },
        type: 'object',
      },
      paletteValue: {
        anyOf: [
          { pattern: HEX_PATTERN, type: 'string' },
          { pattern: NAME_PATTERN, type: 'string' },
        ],
      },
      shadeScale: {
        additionalProperties: false,
        markdownDescription: `Manual shade scale – every shade (${[...SHADES].join(', ')}) is required.`,
        properties: Object.fromEntries(
          [...SHADES].map((shade) => [shade, { $ref: '#/definitions/paletteValue' }])
        ),
        required: [...SHADES],
        type: 'object',
      },
    },
    description: 'GENERATED by `scripts/build.ts` – do not edit.',
    // Only for suggestions and descriptions – problems of an `if` schema are never reported.
    // `colors` is left out: VS Code's color schema only accepts hex values (or `default`), so for a palette
    // reference the hover would show the description of its `default` option instead of the color's own.
    if: {
      properties: {
        semanticTokenColors: { $ref: VSCODE_TOKEN_STYLING_SCHEMA },
        tokenColors: { $ref: VSCODE_TEXTMATE_COLORS_SCHEMA },
      },
    },
    properties: {
      $schema: { type: 'string' },
      colors: buildColorsSchema(anyColor, uiColor, knownColors),
      name: { type: 'string' },
      palette: {
        additionalProperties: {
          anyOf: [
            {
              markdownDescription: `Base color – generates the whole shade scale (\`<name>-50\` … \`<name>-950\`), with \`<name>-${BASE_SHADE}\` set to this color.`,
              pattern: HEX_PATTERN,
              type: 'string',
            },
            { pattern: NAME_PATTERN, type: 'string' },
            { $ref: '#/definitions/shadeScale' },
            { $ref: '#/definitions/paletteGroup' },
          ],
        },
        markdownDescription: `Colors referenced by name in \`colors\`, \`tokenColors\` and \`semanticTokenColors\`.\n\n- A hex color is a base color: the whole shade scale is generated from it, with shade \`${BASE_SHADE}\` set to the base. Every base must have the OKLCH lightness of shade \`${BASE_SHADE}\` (${TARGET_LIGHTNESS.get(BASE_SHADE)}), so all families look equally bright; the base decides the hue and saturation of the whole scale.\n- An object with numeric keys is a manual shade scale and must define every shade (\`${[...SHADES].join('`, `')}\`).\n- Other objects are groups of named colors (e.g., \`ansi\`, \`ui\`), whose values are \`#RRGGBB\` hex colors or the name of another palette color. Nested keys are joined with \`-\`.\n\nIf a \`ui\` group is defined, \`colors\` may only use \`ui-*\`, \`gray-*\` and \`ansi-*\` (except category keys like \`symbolIcon.*\`), and token colors may not use \`ui-*\`.`,
        propertyNames: { not: { pattern: NUMERIC_KEY_PATTERN } },
        type: 'object',
      },
      semanticHighlighting: { type: 'boolean' },
      semanticTokenColors: {
        additionalProperties: { anyOf: [syntaxColor, semanticStyle] },
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
      type: { enum: ['dark', 'light', 'hcDark', 'hcLight'] },
    },
    required: ['palette'],
    title: `Theme source: ${themeFile}`,
    type: 'object',
  };
}
