/**
 * Object helpers.
 */

/** Check if a value is a plain object (not `null` and not an array). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
