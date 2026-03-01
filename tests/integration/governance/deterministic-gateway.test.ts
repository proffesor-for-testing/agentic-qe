/**
 * Integration tests for DeterministicGateway Integration
 *
 * Tests verify:
 * - Idempotency key generation is deterministic
 * - Duplicate detection within deduplication window
 * - Result caching for idempotent operations
 * - Schema validation for tool parameters
 * - Feature flag behavior
 *
 * @see ADR-058-guidance-governance-integration.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  governanceFlags,
  DEFAULT_GOVERNANCE_FLAGS,
  isStrictMode,
  type GovernanceFeatureFlags,
} from '../../../src/governance/feature-flags.js';
import {
  DeterministicGatewayIntegration,
  deterministicGatewayIntegration,
  withIdempotency,
  type GatewayDecision,
  type ToolSchema,
  type ValidationError,
} from '../../../src/governance/deterministic-gateway-integration.js';

describe('DeterministicGateway Integration - ADR-058 Phase 2', () => {
  beforeEach(() => {
    // Reset to defaults before each test
    governanceFlags.reset();
    deterministicGatewayIntegration.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Feature Flags', () => {
    it('should have deterministicGateway enabled by default', () => {
      const flags = governanceFlags.getFlags() as GovernanceFeatureFlags & {
        deterministicGateway: {
          enabled: boolean;
          deduplicationWindowMs: number;
          cacheResultsForIdempotent: boolean;
          validateSchemas: boolean;
        };
      };

      expect(flags.deterministicGateway.enabled).toBe(true);
      expect(flags.deterministicGateway.deduplicationWindowMs).toBe(5000);
      expect(flags.deterministicGateway.cacheResultsForIdempotent).toBe(true);
      expect(flags.deterministicGateway.validateSchemas).toBe(true);
    });

    it('should allow runtime flag updates for deterministicGateway', () => {
      const flags = governanceFlags.getFlags() as GovernanceFeatureFlags & {
        deterministicGateway: { enabled: boolean };
      };
      expect(flags.deterministicGateway.enabled).toBe(true);

      governanceFlags.updateFlags({
        deterministicGateway: {
          enabled: false,
          deduplicationWindowMs: 5000,
          cacheResultsForIdempotent: true,
          validateSchemas: true,
        },
      } as Partial<GovernanceFeatureFlags>);

      const updatedFlags = governanceFlags.getFlags() as GovernanceFeatureFlags & {
        deterministicGateway: { enabled: boolean };
      };
      expect(updatedFlags.deterministicGateway.enabled).toBe(false);
    });

    it('should disable deterministicGateway when all gates disabled', () => {
      governanceFlags.disableAllGates();

      const gate = new DeterministicGatewayIntegration();
      // When all gates disabled, should bypass and allow
      expect(gate.isDuplicate('any-key')).toBe(false);
    });
  });

  describe('Idempotency Key Generation', () => {
    it('should generate deterministic keys for same inputs', () => {
      const gate = new DeterministicGatewayIntegration();

      const key1 = gate.generateIdempotencyKey('memory_store', { key: 'test', value: 123 });
      const key2 = gate.generateIdempotencyKey('memory_store', { key: 'test', value: 123 });

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^idem_[0-9a-f]{8}$/);
    });

    it('should generate different keys for different tool names', () => {
      const gate = new DeterministicGatewayIntegration();

      const key1 = gate.generateIdempotencyKey('memory_store', { key: 'test' });
      const key2 = gate.generateIdempotencyKey('memory_retrieve', { key: 'test' });

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different params', () => {
      const gate = new DeterministicGatewayIntegration();

      const key1 = gate.generateIdempotencyKey('memory_store', { key: 'test', value: 1 });
      const key2 = gate.generateIdempotencyKey('memory_store', { key: 'test', value: 2 });

      expect(key1).not.toBe(key2);
    });

    it('should generate same key regardless of param order', () => {
      const gate = new DeterministicGatewayIntegration();

      const key1 = gate.generateIdempotencyKey('test', { a: 1, b: 2, c: 3 });
      const key2 = gate.generateIdempotencyKey('test', { c: 3, a: 1, b: 2 });

      expect(key1).toBe(key2);
    });

    it('should handle nested objects deterministically', () => {
      const gate = new DeterministicGatewayIntegration();

      const key1 = gate.generateIdempotencyKey('test', {
        config: { nested: { deep: 'value' } },
        array: [1, 2, 3],
      });
      const key2 = gate.generateIdempotencyKey('test', {
        array: [1, 2, 3],
        config: { nested: { deep: 'value' } },
      });

      expect(key1).toBe(key2);
    });
  });

  describe('Duplicate Detection', () => {
    it('should detect duplicate requests within window', async () => {
      const gate = new DeterministicGatewayIntegration();

      // First call should be allowed
      const decision1 = await gate.beforeToolCall('memory_store', { key: 'test' });
      expect(decision1.allowed).toBe(true);
      expect(decision1.idempotencyKey).toBeDefined();

      // Same call immediately after should be duplicate (in-flight)
      const decision2 = await gate.beforeToolCall('memory_store', { key: 'test' });
      expect(decision2.isDuplicate).toBe(true);
    });

    it('should return cached result for completed duplicates', async () => {
      const gate = new DeterministicGatewayIntegration();

      // First call
      const decision1 = await gate.beforeToolCall('memory_store', { key: 'test' });
      expect(decision1.allowed).toBe(true);

      // Complete the call
      await gate.afterToolCall('memory_store', { success: true }, decision1.idempotencyKey!);

      // Duplicate call should return cached result
      const decision2 = await gate.beforeToolCall('memory_store', { key: 'test' });
      expect(decision2.isDuplicate).toBe(true);
      expect(decision2.cachedResult).toEqual({ success: true });
      expect(decision2.allowed).toBe(false);
    });

    it('should not detect duplicate for different params', async () => {
      const gate = new DeterministicGatewayIntegration();

      await gate.beforeToolCall('memory_store', { key: 'test1' });
      const decision = await gate.beforeToolCall('memory_store', { key: 'test2' });

      expect(decision.allowed).toBe(true);
      expect(decision.isDuplicate).toBeFalsy();
    });

    it('should respect custom idempotency key', async () => {
      const gate = new DeterministicGatewayIntegration();

      // First call with custom key
      const decision1 = await gate.beforeToolCall(
        'memory_store',
        { key: 'test' },
        'custom_key_123'
      );
      expect(decision1.allowed).toBe(true);
      expect(decision1.idempotencyKey).toBe('custom_key_123');

      // Same custom key should be duplicate
      const decision2 = await gate.beforeToolCall(
        'memory_store',
        { key: 'different' },
        'custom_key_123'
      );
      expect(decision2.isDuplicate).toBe(true);
    });

    it('should allow after deduplication window expires', async () => {
      // Use short dedup window for testing
      governanceFlags.updateFlags({
        deterministicGateway: {
          enabled: true,
          deduplicationWindowMs: 50, // 50ms
          cacheResultsForIdempotent: false, // Disable caching for this test
          validateSchemas: true,
        },
      } as Partial<GovernanceFeatureFlags>);

      const gate = new DeterministicGatewayIntegration();

      const decision1 = await gate.beforeToolCall('test_tool', { x: 1 });
      expect(decision1.allowed).toBe(true);

      // Wait for dedup window to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should no longer be duplicate
      const decision2 = await gate.beforeToolCall('test_tool', { x: 1 });
      expect(decision2.allowed).toBe(true);
      expect(decision2.isDuplicate).toBeFalsy();
    });
  });

  describe('Result Caching', () => {
    it('should cache results for idempotent operations', async () => {
      const gate = new DeterministicGatewayIntegration();

      // Register an idempotent tool
      gate.registerToolSchema({
        toolName: 'idempotent_tool',
        params: {},
        isIdempotent: true,
        cacheableDurationMs: 60000,
      });

      const key = gate.generateIdempotencyKey('idempotent_tool', {});

      // Store result
      await gate.afterToolCall('idempotent_tool', { data: 'cached' }, key);

      // Should retrieve cached result
      const cached = gate.getCachedResult(key);
      expect(cached).toEqual({ data: 'cached' });
    });

    it('should not cache results for non-idempotent operations', async () => {
      const gate = new DeterministicGatewayIntegration();

      // test_execute is registered as non-idempotent
      const key = gate.generateIdempotencyKey('test_execute', { testFiles: ['a.test.ts'] });

      await gate.afterToolCall('test_execute', { passed: true }, key);

      // Should not cache
      const cached = gate.getCachedResult(key);
      expect(cached).toBeNull();
    });

    it('should expire cached results', async () => {
      const gate = new DeterministicGatewayIntegration();

      // Register tool with very short cache duration
      gate.registerToolSchema({
        toolName: 'short_cache_tool',
        params: {},
        isIdempotent: true,
        cacheableDurationMs: 50, // 50ms cache
      });

      const key = gate.generateIdempotencyKey('short_cache_tool', {});
      await gate.afterToolCall('short_cache_tool', { temp: true }, key);

      // Immediately should be cached
      expect(gate.getCachedResult(key)).toEqual({ temp: true });

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should be expired
      expect(gate.getCachedResult(key)).toBeNull();
    });

    it('should clear specific cache entry', async () => {
      const gate = new DeterministicGatewayIntegration();

      gate.registerToolSchema({
        toolName: 'clearable_tool',
        params: {},
        isIdempotent: true,
        cacheableDurationMs: 60000,
      });

      const key = gate.generateIdempotencyKey('clearable_tool', {});
      await gate.afterToolCall('clearable_tool', { value: 1 }, key);

      expect(gate.getCachedResult(key)).toEqual({ value: 1 });

      gate.clearCache(key);

      expect(gate.getCachedResult(key)).toBeNull();
    });
  });

  describe('Schema Validation', () => {
    it('should validate required params', async () => {
      const gate = new DeterministicGatewayIntegration();

      // memory_store requires 'key' param
      const decision = await gate.beforeToolCall('memory_store', { value: {} });

      expect(decision.validationErrors).toBeDefined();
      expect(decision.validationErrors?.some(e => e.path === 'key')).toBe(true);
      expect(decision.validationErrors?.some(e => e.message.includes('required'))).toBe(true);
    });

    it('should validate param types', async () => {
      const gate = new DeterministicGatewayIntegration();

      gate.registerToolSchema({
        toolName: 'typed_tool',
        params: {
          count: { type: 'number', required: true },
          name: { type: 'string', required: true },
        },
        isIdempotent: true,
      });

      const decision = await gate.beforeToolCall('typed_tool', {
        count: 'not-a-number',
        name: 123,
      });

      expect(decision.validationErrors?.length).toBe(2);
      expect(decision.validationErrors?.some(e =>
        e.path === 'count' && e.message.includes('number')
      )).toBe(true);
      expect(decision.validationErrors?.some(e =>
        e.path === 'name' && e.message.includes('string')
      )).toBe(true);
    });

    it('should validate string length constraints', async () => {
      const gate = new DeterministicGatewayIntegration();

      gate.registerToolSchema({
        toolName: 'length_tool',
        params: {
          code: { type: 'string', required: true, minLength: 3, maxLength: 10 },
        },
        isIdempotent: true,
      });

      // Too short
      const decision1 = await gate.beforeToolCall('length_tool', { code: 'ab' });
      expect(decision1.validationErrors?.some(e => e.message.includes('at least 3'))).toBe(true);

      // Too long
      const decision2 = await gate.beforeToolCall('length_tool', { code: 'waytoolongstring' });
      expect(decision2.validationErrors?.some(e => e.message.includes('at most 10'))).toBe(true);

      // Just right
      const decision3 = await gate.beforeToolCall('length_tool', { code: 'valid' });
      expect(decision3.validationErrors).toBeUndefined();
      expect(decision3.allowed).toBe(true);
    });

    it('should validate number range constraints', async () => {
      const gate = new DeterministicGatewayIntegration();

      gate.registerToolSchema({
        toolName: 'range_tool',
        params: {
          score: { type: 'number', required: true, min: 0, max: 100 },
        },
        isIdempotent: true,
      });

      // Below min
      const decision1 = await gate.beforeToolCall('range_tool', { score: -5 });
      expect(decision1.validationErrors?.some(e => e.message.includes('at least 0'))).toBe(true);

      // Above max
      const decision2 = await gate.beforeToolCall('range_tool', { score: 150 });
      expect(decision2.validationErrors?.some(e => e.message.includes('at most 100'))).toBe(true);

      // Valid
      const decision3 = await gate.beforeToolCall('range_tool', { score: 50 });
      expect(decision3.allowed).toBe(true);
    });

    it('should validate enum constraints', async () => {
      const gate = new DeterministicGatewayIntegration();

      gate.registerToolSchema({
        toolName: 'enum_tool',
        params: {
          status: { type: 'string', required: true, enum: ['pending', 'running', 'complete'] },
        },
        isIdempotent: true,
      });

      // Invalid enum value
      const decision1 = await gate.beforeToolCall('enum_tool', { status: 'invalid' });
      expect(decision1.validationErrors?.some(e => e.message.includes('must be one of'))).toBe(true);

      // Valid enum value
      const decision2 = await gate.beforeToolCall('enum_tool', { status: 'running' });
      expect(decision2.allowed).toBe(true);
    });

    it('should validate pattern constraints', async () => {
      const gate = new DeterministicGatewayIntegration();

      gate.registerToolSchema({
        toolName: 'pattern_tool',
        params: {
          email: { type: 'string', required: true, pattern: '^[^@]+@[^@]+\\.[^@]+$' },
        },
        isIdempotent: true,
      });

      // Invalid pattern
      const decision1 = await gate.beforeToolCall('pattern_tool', { email: 'not-an-email' });
      expect(decision1.validationErrors?.some(e => e.message.includes('pattern'))).toBe(true);

      // Valid pattern
      const decision2 = await gate.beforeToolCall('pattern_tool', { email: 'test@example.com' });
      expect(decision2.allowed).toBe(true);
    });

    it('should validate array items', async () => {
      const gate = new DeterministicGatewayIntegration();

      gate.registerToolSchema({
        toolName: 'array_tool',
        params: {
          numbers: {
            type: 'array',
            required: true,
            items: { type: 'number', min: 0 },
          },
        },
        isIdempotent: true,
      });

      // Invalid item in array
      const decision1 = await gate.beforeToolCall('array_tool', { numbers: [1, 2, -3, 4] });
      expect(decision1.validationErrors?.some(e => e.path === 'numbers[2]')).toBe(true);

      // Valid array
      const decision2 = await gate.beforeToolCall('array_tool', { numbers: [1, 2, 3] });
      expect(decision2.allowed).toBe(true);
    });

    it('should allow tools without registered schema', async () => {
      const gate = new DeterministicGatewayIntegration();

      const decision = await gate.beforeToolCall('unregistered_tool', { any: 'params' });

      expect(decision.allowed).toBe(true);
      expect(decision.validationErrors).toBeUndefined();
    });

    it('should skip validation when schema validation disabled', async () => {
      governanceFlags.updateFlags({
        deterministicGateway: {
          enabled: true,
          deduplicationWindowMs: 5000,
          cacheResultsForIdempotent: true,
          validateSchemas: false, // Disabled
        },
      } as Partial<GovernanceFeatureFlags>);

      const gate = new DeterministicGatewayIntegration();

      // Would normally fail validation
      const decision = await gate.beforeToolCall('memory_store', { invalid: true });

      expect(decision.allowed).toBe(true);
      expect(decision.validationErrors).toBeUndefined();
    });
  });

  describe('Strict Mode Behavior', () => {
    it('should allow with warning in non-strict mode for validation errors', async () => {
      const gate = new DeterministicGatewayIntegration();

      const decision = await gate.beforeToolCall('memory_store', { invalid: 'params' });

      // Non-strict: allowed but with warnings
      expect(decision.allowed).toBe(true);
      expect(decision.validationErrors).toBeDefined();
    });

    it('should block in strict mode for validation errors', async () => {
      governanceFlags.enableStrictMode();

      const gate = new DeterministicGatewayIntegration();

      const decision = await gate.beforeToolCall('memory_store', { invalid: 'params' });

      expect(decision.allowed).toBe(false);
      expect(decision.validationErrors).toBeDefined();
    });

    it('should allow in-flight duplicates in non-strict mode', async () => {
      const gate = new DeterministicGatewayIntegration();

      await gate.beforeToolCall('test_tool', { x: 1 });
      const decision = await gate.beforeToolCall('test_tool', { x: 1 });

      // Non-strict: allowed even though duplicate
      expect(decision.isDuplicate).toBe(true);
      expect(decision.allowed).toBe(true);
    });

    it('should block in-flight duplicates in strict mode', async () => {
      governanceFlags.enableStrictMode();

      const gate = new DeterministicGatewayIntegration();

      await gate.beforeToolCall('test_tool', { x: 1 });
      const decision = await gate.beforeToolCall('test_tool', { x: 1 });

      expect(decision.isDuplicate).toBe(true);
      expect(decision.allowed).toBe(false);
    });
  });

  describe('withIdempotency Helper', () => {
    it('should execute function and cache result', async () => {
      const gate = new DeterministicGatewayIntegration();

      gate.registerToolSchema({
        toolName: 'helper_test',
        params: {},
        isIdempotent: true,
        cacheableDurationMs: 60000,
      });

      const executeFn = vi.fn().mockResolvedValue({ result: 'success' });

      const result = await withIdempotency('helper_test', { id: 1 }, executeFn);

      expect(result).toEqual({ result: 'success' });
      expect(executeFn).toHaveBeenCalledTimes(1);
    });

    it('should return cached result on duplicate call', async () => {
      const gate = new DeterministicGatewayIntegration();

      gate.registerToolSchema({
        toolName: 'cached_helper',
        params: {},
        isIdempotent: true,
        cacheableDurationMs: 60000,
      });

      const executeFn = vi.fn().mockResolvedValue({ value: 42 });

      // First call
      const result1 = await withIdempotency('cached_helper', { x: 1 }, executeFn);
      expect(result1).toEqual({ value: 42 });

      // Second call - should use cache
      const result2 = await withIdempotency('cached_helper', { x: 1 }, executeFn);
      expect(result2).toEqual({ value: 42 });

      // Execute should only be called once
      expect(executeFn).toHaveBeenCalledTimes(1);
    });

    it('should clear cache on error', async () => {
      const gate = new DeterministicGatewayIntegration();

      const executeFn = vi.fn().mockRejectedValue(new Error('Test error'));

      await expect(
        withIdempotency('error_tool', { a: 1 }, executeFn)
      ).rejects.toThrow('Test error');

      // Should be able to retry (not stuck as duplicate)
      executeFn.mockResolvedValue({ success: true });
      const result = await withIdempotency('error_tool', { a: 1 }, executeFn);
      expect(result).toEqual({ success: true });
    });
  });

  describe('Tool Schema Management', () => {
    it('should register and retrieve tool schemas', () => {
      const gate = new DeterministicGatewayIntegration();

      const schema: ToolSchema = {
        toolName: 'custom_tool',
        params: {
          input: { type: 'string', required: true },
        },
        isIdempotent: true,
        cacheableDurationMs: 30000,
      };

      gate.registerToolSchema(schema);

      const retrieved = gate.getToolSchema('custom_tool');
      expect(retrieved).toEqual(schema);
    });

    it('should check if tool is idempotent', async () => {
      const gate = new DeterministicGatewayIntegration();
      await gate.initialize(); // Need to initialize to register default schemas

      expect(gate.isToolIdempotent('memory_store')).toBe(true);
      expect(gate.isToolIdempotent('test_execute')).toBe(false);
      expect(gate.isToolIdempotent('unknown_tool')).toBe(false);
    });

    it('should have default schemas for AQE tools', async () => {
      const gate = new DeterministicGatewayIntegration();
      await gate.initialize();

      expect(gate.getToolSchema('memory_store')).toBeDefined();
      expect(gate.getToolSchema('memory_retrieve')).toBeDefined();
      expect(gate.getToolSchema('test_execute')).toBeDefined();
      expect(gate.getToolSchema('coverage_analyze')).toBeDefined();
      expect(gate.getToolSchema('quality_assess')).toBeDefined();
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track statistics', async () => {
      const gate = new DeterministicGatewayIntegration();
      await gate.initialize();

      // Make some calls
      await gate.beforeToolCall('test1', { a: 1 });
      const decision = await gate.beforeToolCall('test2', { b: 2 });
      await gate.afterToolCall('test2', { result: 'ok' }, decision.idempotencyKey!);

      const stats = gate.getStats();

      expect(stats.pendingRequests).toBeGreaterThanOrEqual(1);
      expect(stats.registeredSchemas).toBeGreaterThan(0);
    });

    it('should reset all state', async () => {
      const gate = new DeterministicGatewayIntegration();
      await gate.initialize();

      await gate.beforeToolCall('test', { x: 1 });

      gate.reset();

      const stats = gate.getStats();
      expect(stats.pendingRequests).toBe(0);
      expect(stats.cachedResults).toBe(0);
      expect(stats.registeredSchemas).toBe(0);
    });
  });

  describe('Bypass Behavior', () => {
    it('should bypass when gate is disabled', async () => {
      governanceFlags.updateFlags({
        deterministicGateway: {
          enabled: false,
          deduplicationWindowMs: 5000,
          cacheResultsForIdempotent: true,
          validateSchemas: true,
        },
      } as Partial<GovernanceFeatureFlags>);

      const gate = new DeterministicGatewayIntegration();

      // Should always allow when disabled
      const decision = await gate.beforeToolCall('any_tool', { invalid: true });
      expect(decision.allowed).toBe(true);

      // Duplicate detection should also be bypassed
      await gate.beforeToolCall('same_tool', { x: 1 });
      const decision2 = await gate.beforeToolCall('same_tool', { x: 1 });
      expect(decision2.allowed).toBe(true);
      expect(decision2.isDuplicate).toBeUndefined();
    });

    it('should bypass when all gates disabled', async () => {
      governanceFlags.disableAllGates();

      const gate = new DeterministicGatewayIntegration();

      const decision = await gate.beforeToolCall('test', {});
      expect(decision.allowed).toBe(true);
    });
  });

  describe('Singleton Instance', () => {
    it('should export singleton instance', () => {
      expect(deterministicGatewayIntegration).toBeDefined();
      expect(deterministicGatewayIntegration).toBeInstanceOf(DeterministicGatewayIntegration);
    });

    it('should maintain state across calls via singleton', async () => {
      deterministicGatewayIntegration.reset();

      const decision1 = await deterministicGatewayIntegration.beforeToolCall(
        'singleton_test',
        { id: 'test123' }
      );
      expect(decision1.allowed).toBe(true);

      // Same call via singleton should detect duplicate
      const decision2 = await deterministicGatewayIntegration.beforeToolCall(
        'singleton_test',
        { id: 'test123' }
      );
      expect(decision2.isDuplicate).toBe(true);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent duplicate detection correctly', async () => {
      const gate = new DeterministicGatewayIntegration();

      // Launch multiple concurrent calls with same params
      const decisions = await Promise.all([
        gate.beforeToolCall('concurrent_tool', { x: 1 }),
        gate.beforeToolCall('concurrent_tool', { x: 1 }),
        gate.beforeToolCall('concurrent_tool', { x: 1 }),
      ]);

      // First should be allowed, others should be duplicates
      const allowed = decisions.filter(d => d.allowed && !d.isDuplicate);
      const duplicates = decisions.filter(d => d.isDuplicate);

      expect(allowed.length).toBe(1);
      expect(duplicates.length).toBe(2);
    });

    it('should handle concurrent different operations', async () => {
      const gate = new DeterministicGatewayIntegration();

      const decisions = await Promise.all([
        gate.beforeToolCall('tool_a', { x: 1 }),
        gate.beforeToolCall('tool_b', { x: 1 }),
        gate.beforeToolCall('tool_c', { x: 1 }),
      ]);

      // All different tools should be allowed
      expect(decisions.every(d => d.allowed)).toBe(true);
    });
  });
});
