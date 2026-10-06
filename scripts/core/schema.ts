/**
 * Source schema – Generates the JSON schema of a theme source that uses the palette system.
 *
 * VS Code's built-in `vscode://schemas/color-theme` schema requires hex colors, so it would flag every
 * palette reference in a theme source. Instead, theme sources point their `$schema` to a schema generated
 * from their own palette, which:
 * - suggests every palette color (with its hex value) when typing a color value
 * - flags unknown palette colors, disallowed lightness modifiers and opacity steps and color scope violations
 *   right in the editor
 * - flags unknown `colors` keys and shows their descriptions (read from the installed VS Code, see `colorIds.ts`;
 *   The build flags unknown keys as well, see `colorKeys.ts`)
 * - flags invalid `tokenColors` structure (unknown properties, invalid `fontStyle`, …)
 *
 * The patterns are built from the same syntax definitions the build uses (see `palette.ts`).
 *
 * VS Code's own token color schemas are still included as an `if` condition: VS Code's JSON language service
 * uses the schemas of an `if` for suggestions and hover descriptions, but never reports their problems. That way
 * the scope suggestions and descriptions always match the installed VS Code (and extensions), without its hex rules.
 */

import type { ColorDescriptions, ColorScope, Palette } from '../types/index.ts';
import { OPAQUE_HEX_PATTERN } from '../utils/color.ts';
import { escapeRegExp } from '../utils/strings.ts';
import { CONTRAST_FOREGROUND_KEYS } from './contrast.ts';
import {
  COLOR_PAIR_SEPARATOR,
  LIGHTNESS_SEPARATOR,
  LIGHTNESS_VALUE_PATTERN,
  MAX_LIGHTNESS,
  MIN_LIGHTNESS,
  NAME_PATTERN,
  NUMERIC_PATTERN,
  OPACITY_SEPARATOR,
  OPACITY_STEPS,
  OPACITY_VALUE_PATTERN,
  SHADES,
  TRANSPARENT,
} from './palette.ts';
import { CATEGORY_KEY_PREFIXES, isAllowedInScope, scopeOfColorKey } from './scopes.ts';
import { BASE_SHADE, TARGET_LIGHTNESS } from './shades.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** The `$ref` schemas of the color reference definitions a `colors` key can use. */
interface ColorReferenceSchemas {
  /** Any palette color (category keys). */
  anyColor: Record<string, unknown>;
  /** Any palette color, or a color pair of them (category keys with a contrast pair). */
  anyColorPair: Record<string, unknown>;
  /** The palette colors allowed in UI colors. */
  uiColor: Record<string, unknown>;
  /** The palette colors allowed in UI colors, or a color pair of them (keys with a contrast pair). */
  uiColorPair: Record<string, unknown>;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** VS Code's built-in schema of `tokenColors` (only resolvable inside VS Code). */
const VSCODE_TEXTMATE_COLORS_SCHEMA = 'vscode://schemas/textmate-colors';

/** VS Code's built-in schema of `semanticTokenColors` (only resolvable inside VS Code). */
const VSCODE_TOKEN_STYLING_SCHEMA = 'vscode://schemas/token-styling';

/** Allowed `fontStyle` values (same pattern as VS Code's TextMate theme schema). */
const FONT_STYLE_PATTERN = String.raw`^(\s*\b(italic|bold|underline|strikethrough))*\s*$`;

/** JSON schema pattern of an opaque `#RRGGBB` hex color. */
const HEX_PATTERN = `^${OPAQUE_HEX_PATTERN}$`;

/** JSON schema pattern of an optional lightness modifier (only the allowed values, see `LIGHTNESS_VALUE_PATTERN`). */
const LIGHTNESS_PATTERN = `(?:${escapeRegExp(LIGHTNESS_SEPARATOR)}${LIGHTNESS_VALUE_PATTERN})?`;

/** JSON schema pattern of an optional opacity step (only the allowed values, see `OPACITY_VALUE_PATTERN`). */
const OPACITY_PATTERN = `(?:${escapeRegExp(OPACITY_SEPARATOR)}${OPACITY_VALUE_PATTERN})?`;

/** JSON schema pattern of a palette alias (another color's name, optionally with a lightness modifier). */
const ALIAS_PATTERN = `^${NAME_PATTERN}${LIGHTNESS_PATTERN}$`;

/** JSON schema pattern of a numeric key (a shade). */
const NUMERIC_KEY_PATTERN = `^${NUMERIC_PATTERN}$`;

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Build the JSON schema describing a single color reference value, limited to the colors allowed in `scope`.
 *
 * @param palette     The flattened palette of the theme source.
 * @param scope       The color scope the reference is used in.
 * @param allowPair   Whether a color pair (`<color>|<color>`) is accepted as well.
 */
function buildColorReferenceSchema(
  palette: Palette,
  scope: ColorScope,
  allowPair = false
): Record<string, unknown> {
  const colors = [...palette].filter(([name]) => isAllowedInScope(name, scope));
  const names = colors.map(([name]) => escapeRegExp(name)).join('|');
  const steps = [...OPACITY_STEPS.keys()];
  const reference = `(?:${names})${LIGHTNESS_PATTERN}${OPACITY_PATTERN}`;
  const pair = allowPair ? `(?:${escapeRegExp(COLOR_PAIR_SEPARATOR)}${reference})?` : '';
  const pairHint = allowPair
    ? `, a color pair ("<color>${COLOR_PAIR_SEPARATOR}<color>", the one with the better contrast is used)`
    : '';

  return {
    defaultSnippets: [
      { body: TRANSPARENT, label: TRANSPARENT, markdownDescription: 'Fully transparent' },
      ...colors.map(([name, hex]) => ({
        body: name,
        label: name,
        markdownDescription: `\`${hex}\``,
      })),
    ],
    pattern: `^(?:${TRANSPARENT}|${reference}${pair})$`,
    patternErrorMessage: `Expected a palette color allowed here ("<name>", "<name>${LIGHTNESS_SEPARATOR}<lightness>", "<name>${OPACITY_SEPARATOR}<opacity>" or "<name>${LIGHTNESS_SEPARATOR}<lightness>${OPACITY_SEPARATOR}<opacity>")${pairHint} or "${TRANSPARENT}". Allowed lightness: ${MIN_LIGHTNESS} to ${MAX_LIGHTNESS} (in % of the perceived lightness). Allowed opacity steps: ${steps.join(', ')}.`,
    type: 'string',
  };
}

/**
 * Get the reference schema for a `colors` key, based on its scope and whether it may use a color pair.
 */
function referenceSchemaFor(key: string, refs: ColorReferenceSchemas): Record<string, unknown> {
  const isPairKey = CONTRAST_FOREGROUND_KEYS.has(key);
  if (scopeOfColorKey(key) === 'any') {
    return isPairKey ? refs.anyColorPair : refs.anyColor;
  }
  return isPairKey ? refs.uiColorPair : refs.uiColor;
}

/**
 * Build the JSON schema of the `colors` object.
 * With `knownColors`, every known key gets the color reference of its scope (and its VS Code description)
 * and unknown keys are flagged. Without, any key is accepted (category keys by prefix).
 * Only the foreground keys of `CONTRAST_PAIRS` accept color pairs.
 */
function buildColorsSchema(
  refs: ColorReferenceSchemas,
  knownColors: ColorDescriptions | undefined
): Record<string, unknown> {
  if (knownColors === undefined) {
    const categoryPattern = `^(?:${CATEGORY_KEY_PREFIXES.map((prefix) => escapeRegExp(prefix)).join('|')})`;
    return {
      additionalProperties: refs.uiColor,
      patternProperties: { [categoryPattern]: refs.anyColor },
      properties: Object.fromEntries(
        [...CONTRAST_FOREGROUND_KEYS].map((key) => [key, referenceSchemaFor(key, refs)])
      ),
      type: 'object',
    };
  }

  // Draft-07 ignores every keyword next to a `$ref` (and so does VS Code's hover);
  // The reference is wrapped in an `allOf`, so the description is shown.
  return {
    additionalProperties: false,
    properties: Object.fromEntries(
      Object.entries(knownColors).map(([id, description]) => {
        const reference = referenceSchemaFor(id, refs);
        return [id, description ? { allOf: [reference], description } : reference];
      })
    ),
    type: 'object',
  };
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Generate the JSON schema for a theme source that uses the palette system.
 *
 * @param themeFile     File name of the theme source (only used for the schema title).
 * @param palette       The flattened palette of the theme source.
 * @param scoped        Whether color scope restrictions apply to the palette (see `CompiledTheme.scoped`).
 * @param knownColors   All valid `colors` keys with their descriptions, or `undefined` to accept any key.
 */
export function generateSourceSchema(
  themeFile: string,
  palette: Palette,
  scoped: boolean,
  knownColors?: ColorDescriptions
): Record<string, unknown> {
  const anyColor = { $ref: '#/definitions/colorReference' };
  const anyColorPair = { $ref: '#/definitions/colorPairReference' };
  const uiColor = scoped ? { $ref: '#/definitions/uiColorReference' } : anyColor;
  const uiColorPair = scoped ? { $ref: '#/definitions/uiColorPairReference' } : anyColorPair;
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
      colorPairReference: buildColorReferenceSchema(palette, 'any', true),
      colorReference: buildColorReferenceSchema(palette, 'any'),
      ...(scoped && {
        syntaxColorReference: buildColorReferenceSchema(palette, 'syntax'),
        uiColorPairReference: buildColorReferenceSchema(palette, 'ui', true),
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
          { pattern: ALIAS_PATTERN, type: 'string' },
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
    // Only for suggestions and descriptions; Problems of an `if` schema are never reported.
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
      colors: buildColorsSchema({ anyColor, anyColorPair, uiColor, uiColorPair }, knownColors),
      name: { type: 'string' },
      palette: {
        additionalProperties: {
          anyOf: [
            {
              markdownDescription: `Base color – generates the whole shade scale (\`<name>-50\` … \`<name>-950\`), with \`<name>-${BASE_SHADE}\` set to this color.`,
              pattern: HEX_PATTERN,
              type: 'string',
            },
            { pattern: ALIAS_PATTERN, type: 'string' },
            { $ref: '#/definitions/shadeScale' },
            { $ref: '#/definitions/paletteGroup' },
          ],
        },
        markdownDescription: `Colors referenced by name in \`colors\`, \`tokenColors\` and \`semanticTokenColors\`.\n\n- A hex color is a base color: the whole shade scale is generated from it, with shade \`${BASE_SHADE}\` set to the base. Every base must have the OKLCH lightness of shade \`${BASE_SHADE}\` (${TARGET_LIGHTNESS.get(BASE_SHADE)}), so all families look equally bright; The base decides the hue and saturation of the whole scale.\n- An object with numeric keys is a manual shade scale and must define every shade (\`${[...SHADES].join('`, `')}\`).\n- Other objects are groups of named colors (e.g., \`ansi\`, \`ui\`), whose values are \`#RRGGBB\` hex colors or the name of another palette color, optionally with a lightness modifier (e.g., \`"bg-hover": "ui-accent-bg${LIGHTNESS_SEPARATOR}94"\` – ${MIN_LIGHTNESS} to ${MAX_LIGHTNESS} % of its perceived lightness, for subtle variants in between the shades). Nested keys are joined with \`-\`.\n\nIf a \`ui\` group is defined, \`colors\` may only use \`ui-*\`, \`gray-*\` and \`ansi-*\` (except category keys like \`symbolIcon.*\`), and token colors may not use \`ui-*\`.`,
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
