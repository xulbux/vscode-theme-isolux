/**
 * Distinctness check – Warns about syntax colors that are too similar to tell apart at a glance.
 *
 * Compares every pair of colored (non-gray), opaque `token.*` tokens by their perceptual distance (`ΔE_OK`, the
 * Euclidean distance in OKLab, see `deltaEOk`), once per theme variant. Gray tokens (comments, punctuation, plain
 * text, …) are skipped, since they're told apart by their lightness and the context instead of their hue.
 *
 * Pairs of tokens that never show up close to each other (e.g., regex syntax and function parameters) don't need to
 * be told apart and are listed in `UNRELATED_PAIRS`; Only add pairs there whose scopes really never meet. Tokens of a
 * `SEPARATE_CONTEXTS` group (e.g., the diff lines) are only compared with each other.
 */

import type { BuildIssue, TokenMap, Variant } from '../types/index.ts';
import { deltaEOk, isNeutralColor, isOpaqueHexColor } from '../utils/color.ts';

// ---------------------------------------- CONSTS ---------------------------------------

/** Minimum perceptual distance (`ΔE_OK`) between two colored syntax tokens. */
const MIN_DISTANCE = 0.05;

/** The token group whose colors are compared. */
const SYNTAX_GROUP = 'token';

/**
 * Pairs of syntax tokens that are allowed to look alike, since they never show up close to each other.
 * Every pair needs a reason.
 */
const UNRELATED_PAIRS: readonly (readonly [first: string, second: string])[] = [
  // Special keywords are regex group syntax, keyframe offsets, positional parameters (`$1`) and magic variables,
  // which never sit next to parameters or properties.
  ['token.keyword.special', 'token.property'],
  // Secondary strings are values in config files (`.ini`, `.env`, YAML), which have no constants (YAML's `true`,
  // `null`, … are `token.constant.language`).
  ['token.constant', 'token.string.secondary'],
];

/** Token groups that only show up in their own context, so they're only compared with each other. */
const SEPARATE_CONTEXTS: readonly string[] = [
  // Inserted / deleted / changed lines of diff files, which contain no other syntax.
  'token.diff.',
];

// -------------------------------------- INTERNALS --------------------------------------

/** Get the `SEPARATE_CONTEXTS` group of a token (`''` for the shared context of all other tokens). */
function contextOf(name: string): string {
  return SEPARATE_CONTEXTS.find((prefix) => name.startsWith(prefix)) ?? '';
}

/** Check if two tokens are listed in `UNRELATED_PAIRS` (in any order). */
function isUnrelatedPair(first: string, second: string): boolean {
  return UNRELATED_PAIRS.some(
    ([a, b]) => (a === first && b === second) || (a === second && b === first)
  );
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Check that the colored syntax tokens of a theme variant are clearly distinguishable.
 *
 * @param tokens    The tokens of the theme.
 * @param variant   The variant to check.
 * @returns One warning per pair of tokens closer than `MIN_DISTANCE` (reported on the later token), except for
 *          `UNRELATED_PAIRS` and tokens of different `SEPARATE_CONTEXTS`.
 */
export function checkDistinctness(tokens: TokenMap, variant: Variant): BuildIssue[] {
  const colored = [...tokens.values()]
    .filter((token) => token.group === SYNTAX_GROUP)
    .map((token) => ({ hex: token.colors[variant].hex, name: token.name }))
    .filter(({ hex }) => isOpaqueHexColor(hex) && !isNeutralColor(hex));

  const issues: BuildIssue[] = [];
  for (const [index, token] of colored.entries()) {
    for (const other of colored.slice(0, index)) {
      const distance = deltaEOk(token.hex, other.hex);
      const isComparable =
        contextOf(token.name) === contextOf(other.name) && !isUnrelatedPair(token.name, other.name);
      if (distance < MIN_DISTANCE && isComparable) {
        issues.push({
          message: `Hard to tell apart from "${other.name}" (ΔE_OK ${distance.toFixed(3)}, minimum ${MIN_DISTANCE}).`,
          path: token.name,
        });
      }
    }
  }
  return issues;
}
