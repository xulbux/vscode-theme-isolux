/**
 * String helpers.
 */

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Compute the Levenshtein edit distance between two strings.
 */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }

  return previous[b.length];
}

/**
 * Find the candidate most similar to `input`.
 * @param maxDistance   Candidates further away than this are never suggested.
 * @returns The closest candidate, or `undefined` if none is close enough.
 */
function findClosest(
  input: string,
  candidates: Iterable<string>,
  maxDistance = 3
): string | undefined {
  let best: string | undefined = undefined;
  let bestDistance = maxDistance + 1;

  for (const candidate of candidates) {
    const distance = editDistance(input, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

// -------------------------------------- PUBLIC API -------------------------------------

/** Escape every character that has a special meaning in a regular expression. */
export function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Build a ` Did you mean "…"?` hint, suggesting the candidate most similar to `input`.
 * @returns The hint (with a leading space), or an empty string if no candidate is close enough.
 */
export function didYouMean(input: string, candidates: Iterable<string>): string {
  const closest = findClosest(input, candidates);
  return closest === undefined ? '' : ` Did you mean "${closest}"?`;
}

/** Get the message of a caught error (or the value itself, if something other than an `Error` was thrown). */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Format a count with a noun, adding a plural `s` unless the count is `1` (e.g., `3 warnings`). */
export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Build a regular expression alternation (without anchors) that matches exactly the integers
 * from `min` to `max` (both inclusive), except the `excluded` ones.
 * Integers that only differ in their last digit are merged into a character class (e.g., `5[0-9]`).
 *
 * @param min        The lowest integer to match (not negative).
 * @param max        The highest integer to match.
 * @param excluded   Integers within the range that must not match.
 */
export function integerRangePattern(
  min: number,
  max: number,
  excluded: readonly number[] = []
): string {
  // Group the last digits by the leading digits (e.g., `10` → `[1, …, 9]` for 101 – 109).
  const groups = new Map<string, number[]>();
  for (let value = min; value <= max; value += 1) {
    if (!excluded.includes(value)) {
      const prefix = value < 10 ? '' : String(Math.floor(value / 10));
      groups.set(prefix, [...(groups.get(prefix) ?? []), value % 10]);
    }
  }

  const alternatives: string[] = [];
  for (const [prefix, digits] of groups) {
    // Split the digits into consecutive runs, each becoming a single digit or a range.
    let runStart = 0;
    for (let i = 1; i <= digits.length; i += 1) {
      if (i === digits.length || digits[i] !== digits[i - 1] + 1) {
        const first = digits[runStart];
        const last = digits[i - 1];
        alternatives.push(first === last ? `${prefix}${first}` : `${prefix}[${first}-${last}]`);
        runStart = i;
      }
    }
  }
  return `(?:${alternatives.join('|')})`;
}
