/**
 * String helpers.
 */

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
 * Find the candidate most similar to `input`, for "Did you mean …?" hints.
 * @param maxDistance   Candidates further away than this are never suggested.
 * @returns The closest candidate, or `undefined` if none is close enough.
 */
export function findClosest(
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
