/**
 * Latch field manager for API header/prompt stabilization.
 * Values are locked after first set — subsequent set() calls are no-ops
 * unless explicitly reset(). This prevents cache-busting from
 * incidental parameter changes between API calls.
 */
export class PromptCacheLatch {
  private latched: Map<string, unknown> = new Map();
  private readonly disabled = process.env.AQE_PROMPT_CACHE_LATCH === 'false';

  /**
   * Latch a value. If already latched, this is a no-op (original preserved).
   * Returns true if the value was newly latched, false if already locked.
   * When disabled via AQE_PROMPT_CACHE_LATCH=false, always stores the new value.
   */
  latch(key: string, value: unknown): boolean {
    if (this.disabled) {
      this.latched.set(key, value);
      return true;
    }
    if (this.latched.has(key)) {
      return false;
    }
    this.latched.set(key, value);
    return true;
  }

  /**
   * Get a latched value.
   */
  get<T>(key: string): T | undefined {
    return this.latched.get(key) as T | undefined;
  }

  /**
   * Check if a key is latched.
   */
  has(key: string): boolean {
    return this.latched.has(key);
  }

  /**
   * Explicitly unlock and remove a latched value.
   */
  reset(key: string): void {
    this.latched.delete(key);
  }

  /**
   * Reset all latched values (e.g., on session boundary).
   */
  resetAll(): void {
    this.latched.clear();
  }

  /**
   * Get snapshot of all latched key-value pairs.
   */
  getSnapshot(): Record<string, unknown> {
    return Object.fromEntries(this.latched);
  }

  /**
   * Number of latched values.
   */
  get size(): number {
    return this.latched.size;
  }
}
