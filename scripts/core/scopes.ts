/**
 * Color scopes – Keep UI colors and syntax colors apart.
 *
 * Token references are restricted by where they're used:
 * - `colors` (scope `ui`): only `ui.*` tokens.
 *   Exception: keys matching `CATEGORY_KEY_PREFIXES` (scope `any`) may use `token.*` tokens as well,
 *   e.g., `symbolIcon.functionForeground` → `token.function`, so icons and highlighting never drift apart.
 * - `tokenColors` / `semanticTokenColors` (scope `syntax`): only `token.*` tokens.
 */

import type { ColorScope, ResolvedToken, TokenGroup } from '../types/index.ts';
import { TOKEN_GROUPS, TOKEN_NAME_SEPARATOR } from './tokens.ts';

// ---------------------------------------- CONSTS ---------------------------------------

/** The token groups allowed in each scope. */
const SCOPE_GROUPS: Readonly<Record<ColorScope, readonly TokenGroup[]>> = {
  any: TOKEN_GROUPS,
  syntax: ['token'],
  ui: ['ui'],
};

/**
 * `colors` keys that label categories (symbol kinds, bracket nesting levels, chart series, git states, …) instead of UI states.
 * They may use syntax tokens as well (scope `any`).
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
  'scmGraph.',
  'symbolIcon.',
];

// -------------------------------------- PUBLIC API -------------------------------------

/** Get the scope of a `colors` key. */
export function scopeOfColorKey(key: string): ColorScope {
  return CATEGORY_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)) ? 'any' : 'ui';
}

/**
 * Filter token names down to the ones allowed in `scope` (by their group, the first segment of the name).
 * @returns The allowed names, in their original order.
 */
export function tokenNamesInScope(names: Iterable<string>, scope: ColorScope): string[] {
  const groups: readonly string[] = SCOPE_GROUPS[scope];
  return [...names].filter((name) => groups.includes(name.split(TOKEN_NAME_SEPARATOR, 1)[0]));
}

/** Whether a token may be used in `scope`. */
export function isAllowedInScope(token: ResolvedToken, scope: ColorScope): boolean {
  return SCOPE_GROUPS[scope].includes(token.group);
}

/** Build the error message for a token used outside of its scope. */
export function scopeViolationMessage(token: ResolvedToken, scope: ColorScope): string {
  if (scope === 'syntax') {
    return `UI token "${token.name}" can't be used for syntax highlighting – use a "token.*" token instead.`;
  }
  return `Syntax token "${token.name}" can't be used for UI colors – use a "ui.*" token instead (only keys that label categories, listed in \`CATEGORY_KEY_PREFIXES\`, may use syntax tokens).`;
}
