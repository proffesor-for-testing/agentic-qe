/**
 * Minimal interface for cross-session pattern lookup.
 * Implementations may wrap AgentDB, a local cache, or an in-memory store.
 * The interface is deliberately small so callers can inject any backend.
 */
export interface PatternLookup {
  search(
    query: string,
    options?: { tags?: string[]; limit?: number },
  ): Promise<Array<{ name: string; content: string; confidence: number; id?: string }>>;
  recordUsage?(patternId: string, outcome: { success: boolean }): Promise<void>;
}
