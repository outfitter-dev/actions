/**
 * Asserts that a condition is truthy, throwing an error if not.
 * Use this for runtime invariant checks at boundaries.
 *
 * @param condition - Value to check for truthiness
 * @param message - Error message if invariant fails
 * @throws Error if condition is falsy
 */
export function invariant(condition: unknown, message = 'Invariant failed'): asserts condition {
  if (!condition) throw new Error(message);
}

export function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

