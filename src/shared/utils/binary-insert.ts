/**
 * Binary Insertion Utilities - O(log n) sorted insertion
 *
 * Provides efficient sorted insertion into arrays using binary search
 * to find the insertion point. This is more efficient than Array.sort()
 * for maintaining sorted arrays with frequent insertions.
 *
 * Time Complexity:
 * - Binary search for insertion point: O(log n)
 * - Array splice for insertion: O(n) worst case
 * - Total: O(n) but with much lower constant factor than O(n log n) sort
 *
 * For priority queues where tasks are mostly appended (newer = larger timestamp),
 * this approach is optimal as most insertions happen at or near the end.
 */

/**
 * Comparator function type for binary search
 * Returns negative if a < b, 0 if a === b, positive if a > b
 */
export type Comparator<T> = (a: T, b: T) => number;

/**
 * Find the insertion index for a value in a sorted array using binary search.
 * Returns the index where the value should be inserted to maintain sort order.
 *
 * @param array - The sorted array to search
 * @param value - The value to find the insertion point for
 * @param compare - Comparator function
 * @returns The index where value should be inserted
 *
 * @example
 * const arr = [1, 3, 5, 7];
 * const idx = binarySearchInsertIndex(arr, 4, (a, b) => a - b);
 * // idx === 2 (insert between 3 and 5)
 */
export function binarySearchInsertIndex<T>(
  array: T[],
  value: T,
  compare: Comparator<T>
): number {
  let low = 0;
  let high = array.length;

  while (low < high) {
    // Use unsigned right shift for safe integer division
    const mid = (low + high) >>> 1;

    if (compare(array[mid], value) <= 0) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

/**
 * Insert a value into a sorted array maintaining sort order.
 * Uses binary search for O(log n) index finding.
 *
 * @param array - The sorted array (mutated in place)
 * @param value - The value to insert
 * @param compare - Comparator function
 * @returns The index where the value was inserted
 *
 * @example
 * const arr = [1, 3, 5];
 * binaryInsert(arr, 4, (a, b) => a - b);
 * // arr is now [1, 3, 4, 5]
 */
export function binaryInsert<T>(
  array: T[],
  value: T,
  compare: Comparator<T>
): number {
  const index = binarySearchInsertIndex(array, value, compare);
  array.splice(index, 0, value);
  return index;
}

/**
 * Insert a value into a sorted array if it doesn't already exist.
 * Uses binary search for O(log n) index finding.
 *
 * @param array - The sorted array (mutated in place)
 * @param value - The value to insert
 * @param compare - Comparator function
 * @param equals - Optional equality check (defaults to compare returning 0)
 * @returns The index where the value was inserted, or -1 if it already existed
 */
export function binaryInsertUnique<T>(
  array: T[],
  value: T,
  compare: Comparator<T>,
  equals?: (a: T, b: T) => boolean
): number {
  const index = binarySearchInsertIndex(array, value, compare);

  // Check if the value already exists at or before the insertion point
  const equalsFn = equals || ((a, b) => compare(a, b) === 0);

  // Check previous element
  if (index > 0 && equalsFn(array[index - 1], value)) {
    return -1;
  }

  // Check element at insertion point
  if (index < array.length && equalsFn(array[index], value)) {
    return -1;
  }

  array.splice(index, 0, value);
  return index;
}

/**
 * Remove a value from a sorted array using binary search.
 *
 * @param array - The sorted array (mutated in place)
 * @param value - The value to remove
 * @param compare - Comparator function
 * @returns true if the value was found and removed, false otherwise
 */
export function binaryRemove<T>(
  array: T[],
  value: T,
  compare: Comparator<T>
): boolean {
  const index = binarySearchInsertIndex(array, value, compare);

  // The value would be inserted at 'index', so check index-1 for exact match
  if (index > 0 && compare(array[index - 1], value) === 0) {
    array.splice(index - 1, 1);
    return true;
  }

  return false;
}

/**
 * Create a comparator for Date objects (ascending order)
 */
export const dateComparator: Comparator<Date> = (a, b) =>
  a.getTime() - b.getTime();

/**
 * Create a comparator for objects with a createdAt Date field (ascending order)
 */
export function createdAtComparator<T extends { createdAt: Date }>(): Comparator<T> {
  return (a, b) => a.createdAt.getTime() - b.createdAt.getTime();
}

/**
 * Create a comparator from a key extractor function
 */
export function keyComparator<T, K>(
  keyFn: (item: T) => K,
  compareKeys: Comparator<K> = (a, b) => (a as unknown as number) - (b as unknown as number)
): Comparator<T> {
  return (a, b) => compareKeys(keyFn(a), keyFn(b));
}
