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

/**
 * Find the index of the closing quote of the string literal whose opening quote (`"`, `'` or `` ` ``) is at `start`, honoring escape sequences.
 * @returns The index of the closing quote, or `text.length` if the literal isn't closed.
 */
export function findStringEnd(text: string, start: number): number {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length && text[i] !== quote) {
    i += text[i] === '\\' ? 2 : 1;
  }
  return Math.min(i, text.length);
}

/** Get the message of a caught error (or the value itself, if something other than an `Error` was thrown). */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Format a count with a noun, adding a plural `s` unless the count is `1` (e.g., `3 warnings`). */
export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
