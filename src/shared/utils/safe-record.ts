/**
 * Prototype-safe keyed records (#914).
 *
 * Plain `{}` objects inherit from Object.prototype. When a key comes from data
 * (a model name, an agent id, a file path), keys such as `constructor`,
 * `toString` or `__proto__` read the inherited member instead of a missing
 * bucket: `(counts[key] || 0) + 1` then concatenates a function source string,
 * and an assignment to `__proto__` is silently dropped.
 */

/** A record with no prototype, so every key starts out absent. */
export function createSafeRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

/** Read only an own property; inherited members count as absent. */
export function getOwn<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** Write an own data property, including for the key `__proto__`. */
export function setOwn<T>(record: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(record, key, { value, writable: true, enumerable: true, configurable: true });
}

/** Add `amount` to the bucket for `key` and return the new total. */
export function addToCount(record: Record<string, number>, key: string, amount = 1): number {
  const next = (getOwn(record, key) ?? 0) + amount;
  setOwn(record, key, next);
  return next;
}
