import { EventEmitter } from 'events';
import { SwarmMemoryManager, Hint } from '../memory/SwarmMemoryManager';

export interface BlackboardHint {
  key: string;
  value: any;
  ttl?: number;
}

/**
 * BlackboardCoordination - Implements the blackboard pattern for agent coordination
 *
 * The blackboard pattern allows multiple agents to share information asynchronously
 * by posting and reading "hints" on a shared blackboard.
 *
 * Features:
 * - Event-driven hint posting
 * - Pattern-based hint retrieval
 * - TTL-based hint expiration
 * - Async coordination without direct agent coupling
 */
export class BlackboardCoordination extends EventEmitter {
  constructor(private memory: SwarmMemoryManager) {
    super();
  }

  /**
   * Post a hint to the blackboard
   * Emits 'blackboard:hint-posted' event
   */
  async postHint(hint: BlackboardHint): Promise<void> {
    await this.memory.postHint(hint);
    this.emit('blackboard:hint-posted', hint);
  }

  /**
   * Read hints matching a pattern
   * Pattern supports SQL LIKE syntax (e.g., 'aqe/test-queue/*' becomes 'aqe/test-queue/%')
   */
  async readHints(pattern: string): Promise<Hint[]> {
    // Convert glob-style pattern to SQL LIKE pattern
    const sqlPattern = pattern.replace(/\*/g, '%');
    return await this.memory.readHints(sqlPattern);
  }

  /**
   * Wait for a specific hint to appear on the blackboard
   *
   * REFACTORED: Event-driven pattern using Promise.race eliminates race condition
   * Old pattern: setTimeout could fire while hint was being posted
   * New pattern: Event wins the race if hint arrives, timeout only for true absence
   */
  async waitForHint(pattern: string, timeout: number = 30000): Promise<Hint | null> {
    const sqlPattern = pattern.replace(/\*/g, '%');

    // Check if hint already exists (no race condition)
    const existing = await this.memory.readHints(sqlPattern);
    if (existing.length > 0) {
      return existing[0] || null;
    }

    // Event-driven wait with timeout protection using Promise.race
    return Promise.race([
      // Event-driven path: wait for hint to be posted
      new Promise<Hint | null>((resolve) => {
        const listener = async (hint: BlackboardHint) => {
          const matches = hint.key.match(new RegExp('^' + sqlPattern.replace(/%/g, '.*') + '$'));
          if (matches) {
            this.removeListener('blackboard:hint-posted', listener);
            resolve({
              key: hint.key,
              value: hint.value,
              createdAt: Date.now(),
              expiresAt: hint.ttl ? Date.now() + (hint.ttl * 1000) : undefined
            });
          }
        };

        this.on('blackboard:hint-posted', listener);
      }),
      // Timeout protection (returns null if no hint arrives)
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeout);
      })
    ]);
  }

  /**
   * Subscribe to hints matching a pattern
   * Returns unsubscribe function
   */
  subscribeToHints(pattern: string, callback: (hint: Hint) => void): () => void {
    const sqlPattern = pattern.replace(/\*/g, '%');

    const listener = (hint: BlackboardHint) => {
      const matches = hint.key.match(new RegExp('^' + sqlPattern.replace(/%/g, '.*') + '$'));
      if (matches) {
        callback({
          key: hint.key,
          value: hint.value,
          createdAt: Date.now(),
          expiresAt: hint.ttl ? Date.now() + (hint.ttl * 1000) : undefined
        });
      }
    };

    this.on('blackboard:hint-posted', listener);

    return () => {
      this.removeListener('blackboard:hint-posted', listener);
    };
  }
}
