/**
 * kv-Date rehydration helper.
 *
 * Background (issue #493, related #491 Bug 3):
 *   Records stored via `memory.set(key, record)` go through `JSON.stringify`,
 *   which converts `Date` instances to ISO strings. The matching `memory.get`
 *   does `JSON.parse`, which does NOT rehydrate strings back to `Date`. The
 *   record's runtime shape therefore disagrees with its TypeScript type:
 *   `lastUsedAt: Date` is actually a `string` at runtime.
 *
 *   Two failure modes follow:
 *   1. THROW: `record.lastUsedAt.getTime()` raises
 *      `TypeError: getTime is not a function`.
 *   2. SILENT: `record.lastUsedAt >= start` (where `start` is a real Date)
 *      coerces both sides via valueOf; the string becomes NaN; every
 *      comparison returns false. `TimeRange.contains` and similar filters
 *      then silently drop every record, producing empty analytics with no
 *      visible error.
 *
 *   The silent variant is the worse one — it surfaced as #491 Bug 3 and
 *   went undetected for a release cycle.
 *
 * Use this helper at the kv-read seam:
 *
 *     const record = rehydrateDates(
 *       await memory.get<Knowledge>(key),
 *       ['createdAt', 'expiresAt'],
 *     );
 *
 * The helper returns a shallow copy with the named string fields converted
 * to `Date`. Already-Date and null/undefined values pass through unchanged.
 * Returns null/undefined as-is so callers can keep their existing optional
 * chaining.
 */

/**
 * Rehydrate ISO-string Date fields on a record read from the kv store.
 *
 * @param record A record from `memory.get<T>(key)`, possibly null/undefined.
 * @param dateFields Field names that are typed `Date` (or `Date | undefined`)
 *   on T but may have round-tripped as strings through the kv JSON layer.
 * @returns The same record with named fields coerced to Date, or null/undefined
 *   when the input was null/undefined.
 */
export function rehydrateDates<T extends object>(
  record: T | null | undefined,
  dateFields: readonly (keyof T)[],
): T | null | undefined {
  if (record === null || record === undefined) {
    return record;
  }
  const result: T = { ...record };
  for (const field of dateFields) {
    const value = result[field];
    // Only coerce strings — leaves real Date instances, null, and undefined
    // alone so this is safe to call on records whose date fields are
    // optional or already correctly hydrated (e.g. on the write path or
    // when the source is an in-memory cache).
    if (typeof value === 'string') {
      // The cast is unavoidable: we're widening the runtime type to match
      // what TypeScript already claims the field is.
      (result as Record<keyof T, unknown>)[field] = new Date(value);
    }
  }
  return result;
}

/**
 * Array variant — common when iterating `memory.search` results.
 *
 * Filters out nulls so callers don't have to repeat the guard at every site.
 */
export function rehydrateDatesAll<T extends object>(
  records: ReadonlyArray<T | null | undefined>,
  dateFields: readonly (keyof T)[],
): T[] {
  const out: T[] = [];
  for (const record of records) {
    const r = rehydrateDates(record, dateFields);
    if (r) {
      out.push(r);
    }
  }
  return out;
}
