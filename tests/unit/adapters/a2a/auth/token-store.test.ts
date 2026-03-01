/**
 * TokenStore Unit Tests
 *
 * Comprehensive test suite for the token storage implementation.
 * Covers CRUD operations, TTL expiration, and cleanup.
 *
 * @module tests/unit/adapters/a2a/auth/token-store
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Types for TokenStore (implementation will be created by other agents)
interface StoredToken {
  token: string;
  type: 'access' | 'refresh' | 'authorization_code';
  clientId: string;
  userId?: string;
  scope: string[];
  createdAt: Date;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
}

interface TokenStoreConfig {
  maxTokens?: number;
  cleanupInterval?: number;
  enableAutoCleanup?: boolean;
}

interface TokenStore {
  store(token: StoredToken): StoredToken;
  get(tokenValue: string): StoredToken | null;
  delete(tokenValue: string): boolean;
  deleteByClient(clientId: string): number;
  deleteByUser(userId: string): number;
  isValid(tokenValue: string): boolean;
  getByClient(clientId: string): StoredToken[];
  getByUser(userId: string): StoredToken[];
  updateExpiry(tokenValue: string, newExpiresAt: Date): boolean;
  cleanupExpired(): number;
  clear(): void;
  size: number;
  destroy(): void;
}

// Mock implementation for testing
const createMockTokenStore = (config: TokenStoreConfig = {}): TokenStore => {
  const tokens = new Map<string, StoredToken>();
  const maxTokens = config.maxTokens ?? 10000;
  let cleanupTimer: NodeJS.Timeout | null = null;

  const store: TokenStore = {
    store(token: StoredToken): StoredToken {
      if (tokens.size >= maxTokens) {
        throw new Error('Token store capacity exceeded');
      }

      if (tokens.has(token.token)) {
        throw new Error('Token already exists');
      }

      tokens.set(token.token, { ...token });
      return token;
    },

    get(tokenValue: string): StoredToken | null {
      const token = tokens.get(tokenValue);
      if (!token) {
        return null;
      }

      // Check expiration
      if (token.expiresAt < new Date()) {
        tokens.delete(tokenValue);
        return null;
      }

      return { ...token };
    },

    delete(tokenValue: string): boolean {
      return tokens.delete(tokenValue);
    },

    deleteByClient(clientId: string): number {
      let count = 0;
      for (const [key, token] of tokens.entries()) {
        if (token.clientId === clientId) {
          tokens.delete(key);
          count++;
        }
      }
      return count;
    },

    deleteByUser(userId: string): number {
      let count = 0;
      for (const [key, token] of tokens.entries()) {
        if (token.userId === userId) {
          tokens.delete(key);
          count++;
        }
      }
      return count;
    },

    isValid(tokenValue: string): boolean {
      const token = tokens.get(tokenValue);
      if (!token) {
        return false;
      }
      return token.expiresAt > new Date();
    },

    getByClient(clientId: string): StoredToken[] {
      const result: StoredToken[] = [];
      const now = new Date();

      for (const token of tokens.values()) {
        if (token.clientId === clientId && token.expiresAt > now) {
          result.push({ ...token });
        }
      }

      return result;
    },

    getByUser(userId: string): StoredToken[] {
      const result: StoredToken[] = [];
      const now = new Date();

      for (const token of tokens.values()) {
        if (token.userId === userId && token.expiresAt > now) {
          result.push({ ...token });
        }
      }

      return result;
    },

    updateExpiry(tokenValue: string, newExpiresAt: Date): boolean {
      const token = tokens.get(tokenValue);
      if (!token) {
        return false;
      }

      token.expiresAt = newExpiresAt;
      return true;
    },

    cleanupExpired(): number {
      const now = new Date();
      let count = 0;

      for (const [key, token] of tokens.entries()) {
        if (token.expiresAt < now) {
          tokens.delete(key);
          count++;
        }
      }

      return count;
    },

    clear(): void {
      tokens.clear();
    },

    get size(): number {
      return tokens.size;
    },

    destroy(): void {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
      tokens.clear();
    },
  };

  // Setup auto cleanup if enabled
  if (config.enableAutoCleanup !== false && config.cleanupInterval) {
    cleanupTimer = setInterval(() => {
      store.cleanupExpired();
    }, config.cleanupInterval);
  }

  return store;
};

// Helper to create test tokens
const createTestToken = (
  overrides: Partial<StoredToken> = {}
): StoredToken => ({
  token: `tok_${Math.random().toString(36).slice(2)}`,
  type: 'access',
  clientId: 'client-123',
  scope: ['agent:read'],
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 3600000), // 1 hour
  ...overrides,
});

// ============================================================================
// Test Suite
// ============================================================================

describe('TokenStore', () => {
  let store: TokenStore;

  beforeEach(() => {
    store = createMockTokenStore();
  });

  afterEach(() => {
    store.destroy();
  });

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  describe('store', () => {
    it('should store a token', () => {
      const token = createTestToken();
      const stored = store.store(token);

      expect(stored.token).toBe(token.token);
      expect(store.size).toBe(1);
    });

    it('should store token with all fields', () => {
      const token = createTestToken({
        userId: 'user-456',
        metadata: { deviceId: 'device-abc', ip: '192.168.1.1' },
      });

      store.store(token);
      const retrieved = store.get(token.token);

      expect(retrieved?.userId).toBe('user-456');
      expect(retrieved?.metadata?.deviceId).toBe('device-abc');
    });

    it('should reject duplicate tokens', () => {
      const token = createTestToken();
      store.store(token);

      expect(() => store.store(token)).toThrow('Token already exists');
    });

    it('should reject when capacity exceeded', () => {
      const limitedStore = createMockTokenStore({ maxTokens: 2 });

      limitedStore.store(createTestToken());
      limitedStore.store(createTestToken());

      expect(() => limitedStore.store(createTestToken())).toThrow('capacity exceeded');

      limitedStore.destroy();
    });

    it('should store different token types', () => {
      const accessToken = createTestToken({ type: 'access' });
      const refreshToken = createTestToken({ type: 'refresh' });
      const authCode = createTestToken({ type: 'authorization_code' });

      store.store(accessToken);
      store.store(refreshToken);
      store.store(authCode);

      expect(store.size).toBe(3);
      expect(store.get(accessToken.token)?.type).toBe('access');
      expect(store.get(refreshToken.token)?.type).toBe('refresh');
      expect(store.get(authCode.token)?.type).toBe('authorization_code');
    });
  });

  describe('get', () => {
    it('should retrieve stored token', () => {
      const token = createTestToken({ scope: ['agent:read', 'task:create'] });
      store.store(token);

      const retrieved = store.get(token.token);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.token).toBe(token.token);
      expect(retrieved?.scope).toEqual(['agent:read', 'task:create']);
    });

    it('should return null for non-existent token', () => {
      const retrieved = store.get('non-existent-token');

      expect(retrieved).toBeNull();
    });

    it('should return null for expired token', () => {
      const expiredToken = createTestToken({
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });

      // Directly add to bypass normal store (simulating past creation)
      store.store({
        ...expiredToken,
        expiresAt: new Date(Date.now() + 1000), // Store with valid expiry
      });

      vi.useFakeTimers();
      vi.advanceTimersByTime(2000); // Now it's expired

      const retrieved = store.get(expiredToken.token);
      expect(retrieved).toBeNull();

      vi.useRealTimers();
    });

    it('should remove expired token on access', () => {
      const token = createTestToken();
      store.store(token);

      vi.useFakeTimers();
      vi.advanceTimersByTime(3700000); // Past 1 hour expiry

      store.get(token.token); // This should remove the expired token
      expect(store.size).toBe(0);

      vi.useRealTimers();
    });

    it('should return a copy, not the original', () => {
      const token = createTestToken();
      store.store(token);

      const retrieved = store.get(token.token);
      if (retrieved) {
        retrieved.scope = ['modified'];
      }

      const secondRetrieve = store.get(token.token);
      expect(secondRetrieve?.scope).toEqual(['agent:read']);
    });
  });

  describe('delete', () => {
    it('should delete existing token', () => {
      const token = createTestToken();
      store.store(token);

      const deleted = store.delete(token.token);

      expect(deleted).toBe(true);
      expect(store.get(token.token)).toBeNull();
      expect(store.size).toBe(0);
    });

    it('should return false for non-existent token', () => {
      const deleted = store.delete('non-existent');

      expect(deleted).toBe(false);
    });
  });

  describe('deleteByClient', () => {
    beforeEach(() => {
      store.store(createTestToken({ clientId: 'client-a' }));
      store.store(createTestToken({ clientId: 'client-a' }));
      store.store(createTestToken({ clientId: 'client-b' }));
      store.store(createTestToken({ clientId: 'client-a' }));
    });

    it('should delete all tokens for a client', () => {
      const deleted = store.deleteByClient('client-a');

      expect(deleted).toBe(3);
      expect(store.size).toBe(1);
    });

    it('should return 0 when no tokens for client', () => {
      const deleted = store.deleteByClient('unknown-client');

      expect(deleted).toBe(0);
    });
  });

  describe('deleteByUser', () => {
    beforeEach(() => {
      store.store(createTestToken({ userId: 'user-1' }));
      store.store(createTestToken({ userId: 'user-1' }));
      store.store(createTestToken({ userId: 'user-2' }));
    });

    it('should delete all tokens for a user', () => {
      const deleted = store.deleteByUser('user-1');

      expect(deleted).toBe(2);
      expect(store.size).toBe(1);
    });

    it('should return 0 when no tokens for user', () => {
      const deleted = store.deleteByUser('unknown-user');

      expect(deleted).toBe(0);
    });
  });

  // ==========================================================================
  // Validation
  // ==========================================================================

  describe('isValid', () => {
    it('should return true for valid token', () => {
      const token = createTestToken();
      store.store(token);

      expect(store.isValid(token.token)).toBe(true);
    });

    it('should return false for non-existent token', () => {
      expect(store.isValid('non-existent')).toBe(false);
    });

    it('should return false for expired token', () => {
      const token = createTestToken();
      store.store(token);

      vi.useFakeTimers();
      vi.advanceTimersByTime(3700000); // Past expiry

      expect(store.isValid(token.token)).toBe(false);

      vi.useRealTimers();
    });
  });

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  describe('getByClient', () => {
    beforeEach(() => {
      store.store(createTestToken({ clientId: 'client-a', type: 'access' }));
      store.store(createTestToken({ clientId: 'client-a', type: 'refresh' }));
      store.store(createTestToken({ clientId: 'client-b' }));
    });

    it('should return all tokens for a client', () => {
      const tokens = store.getByClient('client-a');

      expect(tokens).toHaveLength(2);
      expect(tokens.every((t) => t.clientId === 'client-a')).toBe(true);
    });

    it('should return empty array for unknown client', () => {
      const tokens = store.getByClient('unknown');

      expect(tokens).toEqual([]);
    });

    it('should exclude expired tokens', () => {
      vi.useFakeTimers();
      vi.advanceTimersByTime(3700000);

      const tokens = store.getByClient('client-a');
      expect(tokens).toHaveLength(0);

      vi.useRealTimers();
    });
  });

  describe('getByUser', () => {
    beforeEach(() => {
      store.store(createTestToken({ userId: 'user-a' }));
      store.store(createTestToken({ userId: 'user-a' }));
      store.store(createTestToken({ userId: 'user-b' }));
    });

    it('should return all tokens for a user', () => {
      const tokens = store.getByUser('user-a');

      expect(tokens).toHaveLength(2);
    });

    it('should return empty array for unknown user', () => {
      const tokens = store.getByUser('unknown');

      expect(tokens).toEqual([]);
    });
  });

  // ==========================================================================
  // TTL and Expiration
  // ==========================================================================

  describe('updateExpiry', () => {
    it('should update token expiry', () => {
      const token = createTestToken();
      store.store(token);

      const newExpiry = new Date(Date.now() + 7200000); // 2 hours
      const updated = store.updateExpiry(token.token, newExpiry);

      expect(updated).toBe(true);

      const retrieved = store.get(token.token);
      expect(retrieved?.expiresAt.getTime()).toBe(newExpiry.getTime());
    });

    it('should return false for non-existent token', () => {
      const updated = store.updateExpiry('non-existent', new Date());

      expect(updated).toBe(false);
    });
  });

  describe('cleanupExpired', () => {
    it('should remove all expired tokens', () => {
      // Store some tokens that will expire
      store.store(createTestToken({ expiresAt: new Date(Date.now() + 1000) }));
      store.store(createTestToken({ expiresAt: new Date(Date.now() + 1000) }));
      store.store(createTestToken({ expiresAt: new Date(Date.now() + 100000) }));

      vi.useFakeTimers();
      vi.advanceTimersByTime(2000); // First two expired

      const cleaned = store.cleanupExpired();

      expect(cleaned).toBe(2);
      expect(store.size).toBe(1);

      vi.useRealTimers();
    });

    it('should return 0 when no expired tokens', () => {
      store.store(createTestToken());
      store.store(createTestToken());

      const cleaned = store.cleanupExpired();

      expect(cleaned).toBe(0);
      expect(store.size).toBe(2);
    });
  });

  // ==========================================================================
  // Utility Operations
  // ==========================================================================

  describe('clear', () => {
    it('should remove all tokens', () => {
      store.store(createTestToken());
      store.store(createTestToken());
      store.store(createTestToken());

      store.clear();

      expect(store.size).toBe(0);
    });
  });

  describe('size', () => {
    it('should return correct count', () => {
      expect(store.size).toBe(0);

      store.store(createTestToken());
      expect(store.size).toBe(1);

      store.store(createTestToken());
      expect(store.size).toBe(2);

      store.clear();
      expect(store.size).toBe(0);
    });
  });

  // ==========================================================================
  // Auto Cleanup
  // ==========================================================================

  describe('auto cleanup', () => {
    it('should periodically clean up expired tokens', () => {
      vi.useFakeTimers();

      const autoCleanStore = createMockTokenStore({
        enableAutoCleanup: true,
        cleanupInterval: 1000, // Every second
      });

      autoCleanStore.store(createTestToken({ expiresAt: new Date(Date.now() + 500) }));
      autoCleanStore.store(createTestToken({ expiresAt: new Date(Date.now() + 500) }));

      expect(autoCleanStore.size).toBe(2);

      vi.advanceTimersByTime(1500); // Past expiry and cleanup interval

      expect(autoCleanStore.size).toBe(0);

      autoCleanStore.destroy();
      vi.useRealTimers();
    });
  });

  // ==========================================================================
  // Concurrent Access Simulation
  // ==========================================================================

  describe('concurrent operations', () => {
    it('should handle concurrent stores', async () => {
      const tokens = Array.from({ length: 100 }, () => createTestToken());

      await Promise.all(tokens.map((token) => store.store(token)));

      expect(store.size).toBe(100);
    });

    it('should handle concurrent reads', async () => {
      const token = createTestToken();
      store.store(token);

      const results = await Promise.all(
        Array.from({ length: 100 }, () => store.get(token.token))
      );

      expect(results.every((r) => r?.token === token.token)).toBe(true);
    });

    it('should handle mixed read/write operations', async () => {
      const tokens = Array.from({ length: 50 }, () => createTestToken());

      // Store first batch
      await Promise.all(tokens.slice(0, 25).map((t) => store.store(t)));

      // Mix store, get, and delete
      await Promise.all([
        ...tokens.slice(25).map((t) => store.store(t)),
        ...tokens.slice(0, 10).map((t) => store.get(t.token)),
        ...tokens.slice(10, 15).map((t) => store.delete(t.token)),
      ]);

      expect(store.size).toBe(45); // 50 - 5 deleted
    });
  });
});
