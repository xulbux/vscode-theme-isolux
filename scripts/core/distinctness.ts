/**
 * Distinctness check – Warns about syntax colors that are too similar to tell apart at a glance.
 *
 * Compares every pair of colored (non-gray), opaque `token.*` tokens by their perceptual distance (`ΔE_OK`, the
 * Euclidean distance in OKLab, see `deltaEOk`), once per theme variant. Gray tokens (comments, punctuation, plain
 * text, …) are skipped, since they're told apart by their lightness and the context instead of their hue.
 *
 * Pairs of tokens that never show up close to each other (e.g., regex syntax and function parameters), or that never
 * sit directly next to each other and are told apart by their glyphs (e.g., constant names and numbers), don't need
 * to be told apart by color and are listed in `UNRELATED_PAIRS`. Tokens of a `SEPARATE_CONTEXTS` group (e.g., the
 * diff lines) are only compared with each other.
 */

import type { BuildIssue, TokenMap, Variant } from '../types/index.ts';
import { deltaEOk, isNeutralColor, isOpaqueHexColor } from '../utils/color.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** Two syntax token names (e.g., `token.constant`) that are allowed to look alike. */
type UnrelatedPair = readonly [first: string, second: string];

/** Options of `checkDistinctness`. */
interface DistinctnessOptions {
  /** Pairs of tokens that are allowed to look alike (defaults to `UNRELATED_PAIRS`). */
  readonly unrelatedPairs?: readonly UnrelatedPair[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Minimum perceptual distance (`ΔE_OK`) between two colored syntax tokens. */
const MIN_DISTANCE = 0.05;

/** The token group whose colors are compared. */
const SYNTAX_GROUP = 'token';

/**
 * Pairs of syntax tokens that are allowed to look alike, since they never show up close to each other (or never sit
 * directly next to each other and are told apart by their glyphs). Every pair needs a reason.
 */
const UNRELATED_PAIRS: readonly UnrelatedPair[] = [
  // Escapes sit inside code strings, labels are Markdown link texts; Markdown escapes are told apart by their backslash.
  ['token.string.escape', 'token.string.label'],
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

/** Check if two tokens are listed in the unrelated pairs (in any order). */
function isUnrelatedPair(first: string, second: string, pairs: readonly UnrelatedPair[]): boolean {
  return pairs.some(([a, b]) => (a === first && b === second) || (a === second && b === first));
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Check that the colored syntax tokens of a theme variant are clearly distinguishable.
 *
 * @param tokens    The tokens of the theme.
 * @param variant   The variant to check.
 * @param options   Optional pairs of tokens that may look alike (defaults to `UNRELATED_PAIRS`).
 * @returns One warning per pair of tokens closer than `MIN_DISTANCE` (reported on the later token), except for
 *          unrelated pairs and tokens of different `SEPARATE_CONTEXTS`.
 */
export function checkDistinctness(
  tokens: TokenMap,
  variant: Variant,
  options: DistinctnessOptions = {}
): BuildIssue[] {
  const { unrelatedPairs = UNRELATED_PAIRS } = options;
  const colored = [...tokens.values()]
    .filter((token) => token.group === SYNTAX_GROUP)
    .map((token) => ({ hex: token.colors[variant].hex, name: token.name }))
    .filter(({ hex }) => isOpaqueHexColor(hex) && !isNeutralColor(hex));

  const issues: BuildIssue[] = [];
  for (const [index, token] of colored.entries()) {
    for (const other of colored.slice(0, index)) {
      const distance = deltaEOk(token.hex, other.hex);
      const isComparable =
        contextOf(token.name) === contextOf(other.name) &&
        !isUnrelatedPair(token.name, other.name, unrelatedPairs);
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
