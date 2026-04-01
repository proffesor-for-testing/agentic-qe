/**
 * Hook Configuration Snapshot
 *
 * Deep-freezes hook configuration at startup so it cannot be mutated
 * at runtime. Uses structuredClone to detach from the original, then
 * recursively freezes every nested object and array.
 *
 * @module hooks/security/config-snapshot
 * @see IMP-07 Hook Security Hardening
 */

/**
 * Deep-freeze an object and all nested objects.
 * Returns a Readonly<T> that throws on mutation attempts.
 */
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  const props = Object.getOwnPropertyNames(obj);
  for (const prop of props) {
    const val = (obj as Record<string, unknown>)[prop];
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val as object);
    }
  }
  return Object.freeze(obj);
}

/**
 * Capture an immutable snapshot of hook configuration.
 * Uses structuredClone to detach from original, then deep-freezes.
 */
export function captureHooksConfigSnapshot<T extends object>(config: T): Readonly<T> {
  const snapshot = structuredClone(config);
  return deepFreeze(snapshot);
}
