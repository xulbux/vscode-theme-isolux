/**
 * Color scopes – Keep UI colors and syntax colors apart.
 *
 * The palette's `ui` group defines UI roles (`ui-accent-base`, `ui-error-bg`, …) as aliases of the base colors.
 * For palettes that define such a group, references are restricted by where they're used:
 * - `colors` (scope `ui`): only UI roles (`ui-*`), neutral colors (`gray-*`, `ansi-*`) and `transparent`.
 *   Exception: keys matching `CATEGORY_KEY_PREFIXES` (scope `any`) may use every palette color.
 * - `tokenColors` / `semanticTokenColors` (scope `syntax`): every palette color except UI roles.
 *
 * Palettes without a `ui` group aren't restricted, so themes can be migrated one at a time.
 */

import type { ColorScope, Palette } from '../types/index.ts';

// ---------------------------------------- CONSTS ---------------------------------------

/** Palette group that holds the UI roles. */
export const UI_GROUP = 'ui';

/** Palette groups allowed in the `ui` scope. */
const UI_SCOPE_GROUPS: readonly string[] = [UI_GROUP, 'gray', 'ansi'];

/**
 * `colors` keys that label categories (symbol kinds, bracket nesting levels, chart series, git states, …)
 * instead of UI states. Their colors must keep their hue independently of the UI roles,
 * so they may use every palette color (scope `any`).
 */
export const CATEGORY_KEY_PREFIXES: readonly string[] = [
  'charts.',
  'debugIcon.',
  'debugTokenExpression.',
  'editorBracketHighlight.',
  'editorBracketPairGuide.',
  'editorLightBulb',
  'extensionIcon.',
  'gitDecoration.',
  'ports.icon',
  'symbolIcon.',
];

// -------------------------------------- INTERNALS --------------------------------------

function isInGroup(name: string, group: string): boolean {
  return name.startsWith(`${group}-`);
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Whether scope restrictions apply to a palette (it defines at least one `ui-*` color).
 */
export function hasScopes(palette: Palette): boolean {
  return [...palette.keys()].some((name) => isInGroup(name, UI_GROUP));
}

/**
 * Get the scope of a `colors` key.
 */
export function scopeOfColorKey(key: string): ColorScope {
  return CATEGORY_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)) ? 'any' : 'ui';
}

/**
 * Whether the palette color `name` may be used in `scope`.
 */
export function isAllowedInScope(name: string, scope: ColorScope): boolean {
  if (scope === 'ui') {
    return UI_SCOPE_GROUPS.some((group) => isInGroup(name, group));
  }
  if (scope === 'syntax') {
    return !isInGroup(name, UI_GROUP);
  }
  return true;
}

/**
 * Build the error message for a palette color used outside of its scope.
 */
export function scopeViolationMessage(name: string, scope: ColorScope): string {
  if (scope === 'syntax') {
    return `UI role "${name}" can't be used for syntax highlighting – use a base palette color instead.`;
  }
  const allowed = UI_SCOPE_GROUPS.map((group) => `"${group}-*"`).join(', ');
  return `"${name}" can't be used for UI colors – use one of ${allowed} (keys that label categories are listed in \`CATEGORY_KEY_PREFIXES\`).`;
}
