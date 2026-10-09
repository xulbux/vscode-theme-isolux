/**
 * Tokens – The semantic colors of a theme, defined per variant in `theme/tokens.ts`.
 *
 * Every theme is a function (e.g., `isoluxPro()`) that returns its token definitions (see `defineTheme`):
 * - Values are palette colors (`ThemeColor`s), either the same in every variant or a `[dark, light]` pair.
 * - Nested keys are joined with `.`; A `DEFAULT` key stands for the group itself.
 * - Helpers like `lightness`, `alpha` and `onColor` derive new colors per variant.
 *
 * The JSONC theme source only references token names, so all adjustments live here.
 */

import type {
  BuildIssue,
  OnColorOptions,
  ResolvedToken,
  ThemeColor,
  ThemeTokens,
  TokenGroup,
  TokenMap,
  Variant,
  VariantValue,
} from '../types/index.ts';
import { composite, contrastRatio, isOpaqueHexColor, scaleLightness } from '../utils/color.ts';
import { isPlainObject } from '../utils/object.ts';
import { createThemeColor, isThemeColor } from './palette.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** State shared while flattening the token definitions of a theme. */
interface FlattenContext {
  /** The flattened tokens by name. */
  tokens: Map<string, ResolvedToken>;
  /** Every problem found while flattening. */
  issues: BuildIssue[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Every theme variant, in the order of `[dark, light]` pairs. */
export const VARIANTS: readonly Variant[] = ['dark', 'light'];

/** The token groups, i.e., the allowed top-level keys of a theme's token definitions. */
export const TOKEN_GROUPS: readonly TokenGroup[] = ['ui', 'token'];

/** Separates the segments of a token name (e.g., `ui.foreground.muted`). */
export const TOKEN_NAME_SEPARATOR = '.';

/**
 * Allowed opacity steps (in %), mapped to their hex alpha byte.
 * Restricting the steps keeps transparency levels consistent across the whole theme.
 */
const OPACITY_STEPS: ReadonlyMap<number, string> = new Map([
  [5, '0D'],
  [10, '1A'],
  [15, '26'],
  [20, '33'],
  [25, '40'],
  [30, '4D'],
  [40, '66'],
  [50, '80'],
  [60, '99'],
  [70, 'B3'],
  [80, 'CC'],
  [90, 'E6'],
]);

/**
 * Lowest allowed lightness factor (of the color's perceived lightness, see `scaleLightness`).
 * Lightness adjustments are meant for subtle variants; Bigger differences should use another shade.
 */
const MIN_LIGHTNESS = 0.5;

/** Highest allowed lightness factor (of the color's perceived lightness, see `scaleLightness`). */
const MAX_LIGHTNESS = 1.5;

/** The key that stands for the group itself (e.g., `ui.foreground` for `ui: { foreground: { DEFAULT } }`). */
const DEFAULT_KEY = 'DEFAULT';

/** Tolerance when matching an opacity to the `OPACITY_STEPS` (in %). */
const OPACITY_TOLERANCE = 1e-9;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a token key (a camelCase word or a number, e.g., `lineHighlight` or `1`). */
const TOKEN_KEY_RX = /^(?:[a-z][a-zA-Z0-9]*|\d+)$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Check if a variant value is a `[dark, light]` pair. */
function isPair<T>(value: VariantValue<T>): value is readonly [T, T] {
  return Array.isArray(value);
}

/** Get the value of a variant value for one variant. */
function pick<T>(value: VariantValue<T>, variant: Variant): T {
  return isPair(value) ? value[VARIANTS.indexOf(variant)] : (value as T);
}

/**
 * Derive a color per variant; If none of the inputs is a `[dark, light]` pair, the color is computed once.
 *
 * @param inputs    The variant values the color is derived from.
 * @param compute   Computes the color for one variant.
 */
function derive(
  inputs: readonly VariantValue<unknown>[],
  compute: (variant: Variant) => ThemeColor
): VariantValue<ThemeColor> {
  if (!inputs.some((input) => isPair(input))) {
    return compute('dark');
  }
  return [compute('dark'), compute('light')];
}

/** Make sure a helper argument is a palette color. */
function assertThemeColor(value: unknown, helper: string): asserts value is ThemeColor {
  if (!isThemeColor(value)) {
    throw new TypeError(
      `${helper}(): Expected a palette color (e.g., \`color.gray[950]\`), got ${JSON.stringify(value)}.`
    );
  }
}

/** Make sure a helper argument is an opaque palette color. */
function assertOpaque(value: unknown, helper: string): asserts value is ThemeColor {
  assertThemeColor(value, helper);
  if (!isOpaqueHexColor(value.hex)) {
    throw new Error(
      `${helper}(): "${value.name}" is translucent – apply the adjustment to its opaque source instead.`
    );
  }
}

/** Apply an opacity (one of the `OPACITY_STEPS`, as a fraction) to an opaque color. */
function applyAlpha(color: ThemeColor, opacity: number): ThemeColor {
  assertOpaque(color, 'alpha');
  const percent = Math.round(opacity * 100);
  const byte = OPACITY_STEPS.get(percent);
  if (byte === undefined || Math.abs(opacity * 100 - percent) > OPACITY_TOLERANCE) {
    const steps = [...OPACITY_STEPS.keys()].map((step) => step / 100).join(', ');
    throw new RangeError(`alpha(): Opacity ${opacity} is not allowed – use one of: ${steps}.`);
  }
  return createThemeColor(`${color.name}/${percent}`, `${color.hex}${byte}`);
}

/** Scale the perceived lightness of an opaque color (`MIN_LIGHTNESS` – `MAX_LIGHTNESS`). */
function applyLightness(color: ThemeColor, factor: number): ThemeColor {
  assertOpaque(color, 'lightness');
  if (factor === 1) {
    throw new RangeError(`lightness(): A factor of 1 has no effect – remove it.`);
  }
  if (!(factor >= MIN_LIGHTNESS && factor <= MAX_LIGHTNESS)) {
    throw new RangeError(
      `lightness(): Factor ${factor} is not allowed – use ${MIN_LIGHTNESS} to ${MAX_LIGHTNESS}; For bigger differences, use another shade.`
    );
  }
  return createThemeColor(
    `${color.name}%${Math.round(factor * 100)}`,
    scaleLightness(color.hex, factor)
  );
}

/**
 * Pick the candidate with the best contrast against every background (the highest lowest contrast ratio).
 *
 * @param candidates    The candidate foregrounds.
 * @param backgrounds   The backgrounds the foreground is drawn on.
 * @param over          Opaque surface below translucent backgrounds.
 */
function pickBestContrast(
  candidates: readonly ThemeColor[],
  backgrounds: readonly ThemeColor[],
  over: ThemeColor | undefined
): ThemeColor {
  const solids = backgrounds.map((background) => {
    assertThemeColor(background, 'onColor');
    if (isOpaqueHexColor(background.hex)) {
      return background.hex;
    }
    if (over === undefined) {
      throw new Error(
        `onColor(): Background "${background.name}" is translucent – pass the surface below it as \`over\`.`
      );
    }
    assertOpaque(over, 'onColor');
    return composite(background.hex, over.hex);
  });

  let [best] = candidates;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    assertThemeColor(candidate, 'onColor');
    const score = Math.min(
      ...solids.map((solid) => contrastRatio(composite(candidate.hex, solid), solid))
    );
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Recursively flatten a token tree into `tokens`, validating every key and value.
 *
 * @param node     The (nested) token group.
 * @param prefix   The name of the group (e.g., `ui.foreground`).
 * @param group    The token group the tree belongs to.
 * @param context  The flattened tokens and the collected issues.
 */
function flattenTree(
  node: Record<string, unknown>,
  prefix: string,
  group: TokenGroup,
  context: FlattenContext
): void {
  for (const [key, value] of Object.entries(node)) {
    const isDefault = key === DEFAULT_KEY;
    const name = isDefault ? prefix : `${prefix}${TOKEN_NAME_SEPARATOR}${key}`;
    const path = isDefault ? `${prefix}${TOKEN_NAME_SEPARATOR}${key}` : name;

    if (isDefault && prefix === group) {
      context.issues.push({
        message: `"${DEFAULT_KEY}" isn't allowed directly in a token group.`,
        path,
      });
    } else if (!isDefault && !TOKEN_KEY_RX.test(key)) {
      context.issues.push({
        message: `Invalid token key – use a camelCase word or a number (or "${DEFAULT_KEY}").`,
        path,
      });
    } else if (isThemeColor(value)) {
      context.tokens.set(name, { colors: { dark: value, light: value }, group, name });
    } else if (Array.isArray(value)) {
      const [dark, light] = value as unknown[];
      if (value.length === VARIANTS.length && isThemeColor(dark) && isThemeColor(light)) {
        context.tokens.set(name, { colors: { dark, light }, group, name });
      } else {
        context.issues.push({
          message: `Expected a [${VARIANTS.join(', ')}] pair of palette colors.`,
          path,
        });
      }
    } else if (isPlainObject(value) && !isDefault) {
      flattenTree(value, name, group, context);
    } else {
      context.issues.push({
        message:
          "Expected a palette color (e.g., `color.gray[950]`), a [dark, light] pair of them or a nested group – raw values (e.g., hex strings) aren't allowed.",
        path,
      });
    }
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Define the tokens of a theme (returned by its function in `theme/tokens.ts`); Only adds type checking. */
export function defineTheme(tokens: ThemeTokens): ThemeTokens {
  return tokens;
}

/**
 * Apply an opacity to a color, e.g., `alpha(color.gray[50], 0.1)`.
 * Single inputs return a single color, so it can be used inside a `[dark, light]` pair.
 *
 * @param color     The opaque color (or a `[dark, light]` pair).
 * @param opacity   The opacity as a fraction, one of the `OPACITY_STEPS` (or a `[dark, light]` pair).
 */
export function alpha(color: ThemeColor, opacity: number): ThemeColor;
export function alpha(
  color: VariantValue<ThemeColor>,
  opacity: VariantValue<number>
): VariantValue<ThemeColor>;
export function alpha(
  color: VariantValue<ThemeColor>,
  opacity: VariantValue<number>
): VariantValue<ThemeColor> {
  return derive([color, opacity], (variant) =>
    applyAlpha(pick(color, variant), pick(opacity, variant))
  );
}

/**
 * Scale the perceived lightness of a color (the toe-corrected OKLCH lightness, see `scaleLightness`),
 * e.g., `lightness(color.gray[100], 0.96)` for a slightly darker variant.
 * Single inputs return a single color, so it can be used inside a `[dark, light]` pair.
 *
 * @param color    The opaque color (or a `[dark, light]` pair).
 * @param factor   The lightness factor, `MIN_LIGHTNESS` – `MAX_LIGHTNESS` (or a `[dark, light]` pair).
 */
export function lightness(color: ThemeColor, factor: number): ThemeColor;
export function lightness(
  color: VariantValue<ThemeColor>,
  factor: VariantValue<number>
): VariantValue<ThemeColor>;
export function lightness(
  color: VariantValue<ThemeColor>,
  factor: VariantValue<number>
): VariantValue<ThemeColor> {
  return derive([color, factor], (variant) =>
    applyLightness(pick(color, variant), pick(factor, variant))
  );
}

/**
 * Pick the foreground with the best contrast on one or more backgrounds (per variant), e.g., the text color of
 * a badge, so it adapts when the badge color changes.
 */
export function onColor(options: OnColorOptions): VariantValue<ThemeColor> {
  const { backgrounds, candidates, over } = options;
  if (candidates.length < 2 || backgrounds.length === 0) {
    throw new Error('onColor(): Expected at least 2 candidates and 1 background.');
  }
  const inputs =
    over === undefined ? [...candidates, ...backgrounds] : [...candidates, ...backgrounds, over];
  return derive(inputs, (variant) =>
    pickBestContrast(
      candidates.map((candidate) => pick(candidate, variant)),
      backgrounds.map((background) => pick(background, variant)),
      over === undefined ? undefined : pick(over, variant)
    )
  );
}

/**
 * Flatten and validate the token definitions of a theme.
 * Problems are appended to `issues`; Invalid tokens are left out of the result.
 */
export function flattenTokens(definition: unknown, issues: BuildIssue[]): TokenMap {
  const tokens = new Map<string, ResolvedToken>();
  if (!isPlainObject(definition)) {
    issues.push({ message: 'Expected the token definitions to be an object.', path: '(root)' });
    return tokens;
  }

  for (const [group, tree] of Object.entries(definition)) {
    if (!TOKEN_GROUPS.includes(group as TokenGroup)) {
      issues.push({
        message: `Unknown token group – use ${TOKEN_GROUPS.map((name) => `"${name}"`).join(' or ')}.`,
        path: group,
      });
    } else if (isPlainObject(tree)) {
      flattenTree(tree, group, group as TokenGroup, { issues, tokens });
    } else {
      issues.push({ message: 'Expected a group of tokens.', path: group });
    }
  }
  return tokens;
}
