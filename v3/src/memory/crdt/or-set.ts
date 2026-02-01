/**
 * Observed-Remove Set Implementation
 *
 * A CRDT set with add-wins semantics on concurrent add/remove operations.
 * Each add operation creates a unique tag. Remove operations mark those tags
 * as tombstones. An element is present if it has at least one tag not in tombstones.
 *
 * @module memory/crdt/or-set
 */

import type { ORSet, ORSetState } from './types.js';

// =============================================================================
// Tag Generation
// =============================================================================

/**
 * Generate a unique tag for an element
 * Format: nodeId:timestamp:counter
 */
function generateTag(nodeId: string, counter: number): string {
  return `${nodeId}:${Date.now()}:${counter}`;
}

// =============================================================================
// Element Serialization
// =============================================================================

/**
 * Serialize an element to a string key
 * Uses JSON.stringify for consistent serialization
 */
function serializeElement<T>(element: T): string {
  if (typeof element === 'string') {
    return `s:${element}`;
  }
  if (typeof element === 'number') {
    return `n:${element}`;
  }
  if (typeof element === 'boolean') {
    return `b:${element}`;
  }
  return `j:${JSON.stringify(element)}`;
}

/**
 * Deserialize a string key back to an element
 */
function deserializeElement<T>(key: string): T {
  const type = key.substring(0, 2);
  const value = key.substring(2);

  switch (type) {
    case 's:':
      return value as unknown as T;
    case 'n:':
      return Number(value) as unknown as T;
    case 'b:':
      return (value === 'true') as unknown as T;
    case 'j:':
      return JSON.parse(value) as T;
    default:
      throw new Error(`Unknown serialization type: ${type}`);
  }
}

// =============================================================================
// OR-Set Implementation
// =============================================================================

/**
 * Create a new OR-Set
 *
 * @param nodeId - Unique identifier for this node
 * @returns OR-Set instance
 *
 * @example
 * ```typescript
 * const set = createORSet<string>('node-1');
 * set.add('apple');
 * set.add('banana');
 * set.remove('apple');
 * console.log(set.values()); // ['banana']
 * ```
 */
export function createORSet<T>(nodeId: string): ORSet<T> {
  // Internal state
  // elements: Map<serializedElement, Set<tags>>
  // tombstones: Map<serializedElement, Set<removedTags>>
  const elements = new Map<string, Set<string>>();
  const tombstones = new Map<string, Set<string>>();

  let version = 0;
  let lastUpdated = Date.now();
  let tagCounter = 0;

  /**
   * Check if an element has any active (non-tombstoned) tags
   */
  function hasActiveTags(serialized: string): boolean {
    const tags = elements.get(serialized);
    if (!tags || tags.size === 0) {
      return false;
    }

    const tombstoneTags = tombstones.get(serialized);
    if (!tombstoneTags || tombstoneTags.size === 0) {
      return true;
    }

    // Check if any tag is not tombstoned
    for (const tag of tags) {
      if (!tombstoneTags.has(tag)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get active tags for an element (tags not in tombstones)
   */
  function getActiveTags(serialized: string): Set<string> {
    const tags = elements.get(serialized);
    if (!tags) {
      return new Set();
    }

    const tombstoneTags = tombstones.get(serialized) || new Set();
    const active = new Set<string>();

    for (const tag of tags) {
      if (!tombstoneTags.has(tag)) {
        active.add(tag);
      }
    }

    return active;
  }

  return {
    has(element: T): boolean {
      const serialized = serializeElement(element);
      return hasActiveTags(serialized);
    },

    values(): T[] {
      const result: T[] = [];

      for (const [serialized] of elements) {
        if (hasActiveTags(serialized)) {
          result.push(deserializeElement<T>(serialized));
        }
      }

      return result;
    },

    size(): number {
      let count = 0;
      for (const [serialized] of elements) {
        if (hasActiveTags(serialized)) {
          count++;
        }
      }
      return count;
    },

    add(element: T): void {
      const serialized = serializeElement(element);
      const tag = generateTag(nodeId, tagCounter++);

      if (!elements.has(serialized)) {
        elements.set(serialized, new Set());
      }
      elements.get(serialized)!.add(tag);

      version++;
      lastUpdated = Date.now();
    },

    remove(element: T): void {
      const serialized = serializeElement(element);
      const tags = elements.get(serialized);

      if (!tags || tags.size === 0) {
        return; // Element not in set
      }

      // Tombstone all current tags for this element
      if (!tombstones.has(serialized)) {
        tombstones.set(serialized, new Set());
      }

      const tombstoneTags = tombstones.get(serialized)!;
      for (const tag of tags) {
        tombstoneTags.add(tag);
      }

      version++;
      lastUpdated = Date.now();
    },

    merge(other: ORSet<T>): void {
      const otherState = other.getState();
      this.applyState(otherState);
    },

    getState(): ORSetState<T> {
      // Convert Sets to arrays for serialization
      const elementsObj: Record<string, string[]> = {};
      for (const [key, tags] of elements) {
        elementsObj[key] = Array.from(tags);
      }

      const tombstonesObj: Record<string, string[]> = {};
      for (const [key, tags] of tombstones) {
        if (tags.size > 0) {
          tombstonesObj[key] = Array.from(tags);
        }
      }

      return {
        elements: elementsObj,
        tombstones: tombstonesObj,
        version,
        lastUpdated,
      };
    },

    applyState(incoming: ORSetState<T>): void {
      let changed = false;

      // Merge elements (union of tags)
      for (const [serialized, incomingTags] of Object.entries(incoming.elements)) {
        if (!elements.has(serialized)) {
          elements.set(serialized, new Set());
        }

        const localTags = elements.get(serialized)!;
        for (const tag of incomingTags) {
          if (!localTags.has(tag)) {
            localTags.add(tag);
            changed = true;
          }
        }
      }

      // Merge tombstones (union of tags)
      for (const [serialized, incomingTombstones] of Object.entries(
        incoming.tombstones
      )) {
        if (!tombstones.has(serialized)) {
          tombstones.set(serialized, new Set());
        }

        const localTombstones = tombstones.get(serialized)!;
        for (const tag of incomingTombstones) {
          if (!localTombstones.has(tag)) {
            localTombstones.add(tag);
            changed = true;
          }
        }
      }

      if (changed) {
        version = Math.max(version, incoming.version) + 1;
        lastUpdated = Date.now();
      }
    },

    getNodeId(): string {
      return nodeId;
    },

    clear(): void {
      // Remove all elements by tombstoning all tags
      for (const [serialized, tags] of elements) {
        if (!tombstones.has(serialized)) {
          tombstones.set(serialized, new Set());
        }

        const tombstoneTags = tombstones.get(serialized)!;
        for (const tag of tags) {
          tombstoneTags.add(tag);
        }
      }

      version++;
      lastUpdated = Date.now();
    },
  };
}

// =============================================================================
// Factory with State
// =============================================================================

/**
 * Create an OR-Set from existing state
 *
 * @param nodeId - Unique identifier for this node
 * @param existingState - State to restore from
 * @returns OR-Set instance
 */
export function createORSetFromState<T>(
  nodeId: string,
  existingState: ORSetState<T>
): ORSet<T> {
  const set = createORSet<T>(nodeId);
  set.applyState(existingState);
  return set;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a value is a valid OR-Set state
 */
export function isORSetState<T>(value: unknown): value is ORSetState<T> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const state = value as Record<string, unknown>;
  return (
    typeof state.elements === 'object' &&
    state.elements !== null &&
    typeof state.tombstones === 'object' &&
    state.tombstones !== null &&
    typeof state.version === 'number' &&
    typeof state.lastUpdated === 'number'
  );
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Get detailed statistics about an OR-Set
 */
export interface ORSetStats {
  /** Number of active elements */
  activeElements: number;
  /** Total tags across all elements */
  totalTags: number;
  /** Total tombstoned tags */
  totalTombstones: number;
  /** Number of elements with tombstones */
  elementsWithTombstones: number;
}

/**
 * Get statistics about an OR-Set
 */
export function getORSetStats<T>(state: ORSetState<T>): ORSetStats {
  let activeElements = 0;
  let totalTags = 0;
  let totalTombstones = 0;
  let elementsWithTombstones = 0;

  for (const [serialized, tags] of Object.entries(state.elements)) {
    totalTags += tags.length;

    const tombstoneTags = state.tombstones[serialized] || [];
    totalTombstones += tombstoneTags.length;

    if (tombstoneTags.length > 0) {
      elementsWithTombstones++;
    }

    // Check if element is active
    const tombstoneSet = new Set(tombstoneTags);
    const hasActive = tags.some((tag) => !tombstoneSet.has(tag));
    if (hasActive) {
      activeElements++;
    }
  }

  return {
    activeElements,
    totalTags,
    totalTombstones,
    elementsWithTombstones,
  };
}

/**
 * Compact OR-Set state by removing fully tombstoned elements
 * Returns a new state object (does not mutate input)
 */
export function compactORSetState<T>(state: ORSetState<T>): ORSetState<T> {
  const elements: Record<string, string[]> = {};
  const tombstones: Record<string, string[]> = {};

  for (const [serialized, tags] of Object.entries(state.elements)) {
    const tombstoneTags = new Set(state.tombstones[serialized] || []);

    // Filter out tombstoned tags
    const activeTags = tags.filter((tag) => !tombstoneTags.has(tag));

    if (activeTags.length > 0) {
      elements[serialized] = activeTags;
      // Keep only tombstones for remaining tags
      const relevantTombstones = tags.filter((tag) => tombstoneTags.has(tag));
      if (relevantTombstones.length > 0) {
        tombstones[serialized] = relevantTombstones;
      }
    }
  }

  return {
    elements,
    tombstones,
    version: state.version + 1,
    lastUpdated: Date.now(),
  };
}

// =============================================================================
// Exports
// =============================================================================

export type { ORSet, ORSetState };
