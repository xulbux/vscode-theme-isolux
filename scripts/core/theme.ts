/**
 * Theme compiler – Turns the shared theme source (`theme/theme.jsonc`, which references tokens by name)
 * into a plain VS Code color theme (with hex colors only) for one theme variant.
 *
 * Token references are resolved in:
 * - `colors.*`
 * - `tokenColors[].settings.foreground` / `.background`
 * - `semanticTokenColors.*` (string values, or `.foreground` of style objects; VS Code doesn't support a background there)
 *
 * Every value must be a token name (e.g., `ui.foreground.muted`) or `transparent`; Raw hex colors and color
 * adjustments aren't allowed (they belong into `theme/tokens.ts`). Each reference is also checked against its
 * scope (UI vs. syntax, see `scopes.ts`). The theme's `name` and `type` are set from `package.json`.
 */

import type {
  BuildIssue,
  ColorScope,
  CompiledTheme,
  CompileOptions,
  TokenMap,
  Variant,
} from '../types/index.ts';
import { normalizeHex } from '../utils/color.ts';
import { isPlainObject } from '../utils/object.ts';
import { didYouMean } from '../utils/strings.ts';
import { colorKeyPath, forEachTokenColor } from '../utils/theme.ts';
import {
  groupsOfScope,
  isAllowedInScope,
  scopeOfColorKey,
  scopeViolationMessage,
} from './scopes.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** State shared while resolving the token references of a single theme variant. */
interface ResolveContext {
  /** The tokens of the theme. */
  tokens: TokenMap;
  /** The variant whose colors are used. */
  variant: Variant;
  /** Number of token references that were resolved to hex colors. */
  resolvedCount: number;
  /** Names of every token referenced so far. */
  referenced: Set<string>;
  /** Every problem found while resolving. */
  issues: BuildIssue[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Keyword for a fully transparent color. */
export const TRANSPARENT = 'transparent';

/** The hex color `TRANSPARENT` resolves to. */
const TRANSPARENT_HEX = '#00000000';

/** The `$schema` written into every compiled theme. */
const VSCODE_THEME_SCHEMA = 'vscode://schemas/color-theme';

/** Top-level source keys that are set by the build, mapped to where they come from instead. */
const RESERVED_KEYS: ReadonlyMap<string, string> = new Map([
  ['name', 'the theme\'s "label" in package.json'],
  ['palette', '"theme/palette.ts"'],
  ['type', 'the theme\'s "uiTheme" in package.json'],
]);

/** The VS Code theme `type` of each variant. */
const THEME_TYPES: Readonly<Record<Variant, string>> = { dark: 'dark', light: 'light' };

// -------------------------------------- INTERNALS --------------------------------------

/** Build the error message for an unknown token, suggesting the closest token allowed in `scope`. */
function unknownTokenMessage(value: string, scope: ColorScope, tokens: TokenMap): string {
  const groups = groupsOfScope(scope);
  const allowed = [...tokens.values()]
    .filter((token) => groups.includes(token.group))
    .map((token) => token.name);
  return `Unknown token "${value}".${didYouMean(value, allowed)}`;
}

/**
 * Resolve `target[key]` (a token name or `transparent`) in place, checking that the token may be used in `scope`.
 *
 * @param target    The object holding the token reference.
 * @param key       The property of `target` that holds the token reference.
 * @param path      JSON path to the token reference (for issues).
 * @param scope     The color scope the reference is used in.
 * @param context   The resolve state, which counts successes and collects issues.
 */
function resolveReference(
  target: Record<string, unknown>,
  key: string,
  path: string,
  scope: ColorScope,
  context: ResolveContext
): void {
  const value = target[key];
  if (value === TRANSPARENT) {
    target[key] = TRANSPARENT_HEX;
    context.resolvedCount += 1;
    return;
  }
  if (typeof value !== 'string') {
    context.issues.push({ message: `Expected a token name, got ${JSON.stringify(value)}.`, path });
    return;
  }
  if (normalizeHex(value) !== undefined) {
    context.issues.push({
      message: `Raw hex color "${value}" is not allowed – define a token in "theme/tokens.ts" and reference it by name.`,
      path,
    });
    return;
  }

  const token = context.tokens.get(value);
  if (token === undefined) {
    context.issues.push({ message: unknownTokenMessage(value, scope, context.tokens), path });
    return;
  }
  context.referenced.add(token.name);
  if (!isAllowedInScope(token, scope)) {
    context.issues.push({ message: scopeViolationMessage(token, scope), path });
    return;
  }
  target[key] = token.colors[context.variant].hex;
  context.resolvedCount += 1;
}

/** Resolve every token reference in `colors` in place. */
function resolveColors(colors: unknown, context: ResolveContext): void {
  if (colors === undefined) {
    return;
  }
  if (!isPlainObject(colors)) {
    context.issues.push({ message: 'Expected an object.', path: 'colors' });
    return;
  }
  for (const key of Object.keys(colors)) {
    resolveReference(colors, key, colorKeyPath(key), scopeOfColorKey(key), context);
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Compile the parsed theme source into a VS Code color theme for one variant.
 * The source object is not modified.
 *
 * @param source    The parsed theme source (`theme/theme.jsonc`).
 * @param tokens    The tokens of the theme (see `flattenTokens`).
 * @param options   The theme's display name and the variant to compile.
 */
export function compileTheme(
  source: unknown,
  tokens: TokenMap,
  options: CompileOptions
): CompiledTheme {
  const context: ResolveContext = {
    issues: [],
    referenced: new Set(),
    resolvedCount: 0,
    tokens,
    variant: options.variant,
  };
  if (!isPlainObject(source)) {
    context.issues.push({ message: 'Expected the theme to be a JSON object.', path: '(root)' });
    return { issues: context.issues, referenced: context.referenced, resolvedCount: 0, theme: {} };
  }

  for (const [key, origin] of RESERVED_KEYS) {
    if (key in source) {
      context.issues.push({ message: `Remove "${key}" – it's set from ${origin}.`, path: key });
    }
  }
  const rest = Object.fromEntries(
    Object.entries(structuredClone(source)).filter(
      ([key]) => key !== '$schema' && !RESERVED_KEYS.has(key)
    )
  );
  // Assigned one by one, so `$schema`, `type` and `name` are always the first keys of the compiled theme.
  const theme: Record<string, unknown> = { $schema: VSCODE_THEME_SCHEMA };
  theme.type = THEME_TYPES[options.variant];
  theme.name = options.name;
  Object.assign(theme, rest);

  resolveColors(theme.colors, context);
  forEachTokenColor(theme, (target, key, path) => {
    resolveReference(target, key, path, 'syntax', context);
  });

  return {
    issues: context.issues,
    referenced: context.referenced,
    resolvedCount: context.resolvedCount,
    theme,
  };
}
