/**
 * OAuth 2.0 Scopes Unit Tests
 *
 * Comprehensive test suite for scope validation and hierarchy.
 *
 * @module tests/unit/adapters/a2a/auth/scopes
 */

import { describe, it, expect } from 'vitest';
import {
  A2A_CORE_SCOPES,
  A2A_DOMAIN_SCOPES,
  A2A_SCOPES,
  getScopeDescription,
  isValidScope,
  scopeHierarchy,
  expandScopes,
  validateScopes,
  getMissingScopes,
  normalizeScopes,
  parseScopeString,
  formatScopeString,
  getScopesByCategory,
  getQEDomainScopes,
  getCoreScopes,
  DEFAULT_CLIENT_SCOPES,
  ADMIN_SCOPES,
  type A2AScope,
  type A2ACoreScope,
  type A2ADomainScope,
} from '../../../../../src/adapters/a2a/auth/scopes.js';

// ============================================================================
// Test Suite
// ============================================================================

describe('A2A OAuth Scopes', () => {
  // ==========================================================================
  // Scope Definition Tests
  // ==========================================================================

  describe('Scope Definitions', () => {
    it('should define all core A2A scopes', () => {
      expect(A2A_CORE_SCOPES['platform:read']).toBeDefined();
      expect(A2A_CORE_SCOPES['platform:admin']).toBeDefined();
      expect(A2A_CORE_SCOPES['agent:read']).toBeDefined();
      expect(A2A_CORE_SCOPES['agent:extended']).toBeDefined();
      expect(A2A_CORE_SCOPES['agent:register']).toBeDefined();
      expect(A2A_CORE_SCOPES['agent:manage']).toBeDefined();
      expect(A2A_CORE_SCOPES['task:read']).toBeDefined();
      expect(A2A_CORE_SCOPES['task:create']).toBeDefined();
      expect(A2A_CORE_SCOPES['task:cancel']).toBeDefined();
      expect(A2A_CORE_SCOPES['task:resubmit']).toBeDefined();
      expect(A2A_CORE_SCOPES['message:send']).toBeDefined();
      expect(A2A_CORE_SCOPES['message:stream']).toBeDefined();
      expect(A2A_CORE_SCOPES['notification:manage']).toBeDefined();
    });

    it('should define all 12 QE domain scopes with read/execute', () => {
      const domains = [
        'test-generation',
        'test-execution',
        'coverage-analysis',
        'quality-assessment',
        'defect-intelligence',
        'learning-optimization',
        'security-compliance',
        'chaos-resilience',
        'accessibility',
        'performance',
        'contract-testing',
        'visual-testing',
      ];

      for (const domain of domains) {
        expect(A2A_DOMAIN_SCOPES[`qe:${domain}:read` as A2ADomainScope]).toBeDefined();
        expect(A2A_DOMAIN_SCOPES[`qe:${domain}:execute` as A2ADomainScope]).toBeDefined();
      }

      // 12 domains * 2 (read + execute) = 24 domain scopes
      expect(Object.keys(A2A_DOMAIN_SCOPES).length).toBe(24);
    });

    it('should combine all scopes in A2A_SCOPES', () => {
      const coreCount = Object.keys(A2A_CORE_SCOPES).length;
      const domainCount = Object.keys(A2A_DOMAIN_SCOPES).length;

      expect(Object.keys(A2A_SCOPES).length).toBe(coreCount + domainCount);
    });

    it('should provide descriptions for all scopes', () => {
      for (const scope of Object.keys(A2A_SCOPES)) {
        const description = getScopeDescription(scope);
        expect(description).toBeDefined();
        expect(typeof description).toBe('string');
        expect(description!.length).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================================================
  // Validation Tests
  // ==========================================================================

  describe('isValidScope', () => {
    it('should return true for valid core scopes', () => {
      expect(isValidScope('platform:read')).toBe(true);
      expect(isValidScope('agent:read')).toBe(true);
      expect(isValidScope('task:create')).toBe(true);
      expect(isValidScope('message:send')).toBe(true);
    });

    it('should return true for valid domain scopes', () => {
      expect(isValidScope('qe:test-generation:read')).toBe(true);
      expect(isValidScope('qe:security-compliance:execute')).toBe(true);
      expect(isValidScope('qe:accessibility:read')).toBe(true);
    });

    it('should return false for invalid scopes', () => {
      expect(isValidScope('invalid:scope')).toBe(false);
      expect(isValidScope('platform:delete')).toBe(false);
      expect(isValidScope('qe:unknown-domain:read')).toBe(false);
      expect(isValidScope('')).toBe(false);
      expect(isValidScope('random')).toBe(false);
    });

    it('should be type-safe (return type guard)', () => {
      const scope: string = 'agent:read';
      if (isValidScope(scope)) {
        // TypeScript should now know scope is A2AScope
        const _typedScope: A2AScope = scope;
        expect(_typedScope).toBe('agent:read');
      }
    });
  });

  describe('getScopeDescription', () => {
    it('should return description for valid scope', () => {
      expect(getScopeDescription('platform:read')).toBe('Read platform discovery information');
      expect(getScopeDescription('agent:manage')).toBe('Manage agent configuration and status');
    });

    it('should return undefined for invalid scope', () => {
      expect(getScopeDescription('invalid:scope')).toBeUndefined();
    });
  });

  // ==========================================================================
  // Scope Hierarchy Tests
  // ==========================================================================

  describe('scopeHierarchy', () => {
    it('should return scope itself for scopes without hierarchy', () => {
      const hierarchy = scopeHierarchy('platform:read');
      expect(hierarchy).toContain('platform:read');
      expect(hierarchy.length).toBe(1);
    });

    it('should expand platform:admin to include platform:read', () => {
      const hierarchy = scopeHierarchy('platform:admin');
      expect(hierarchy).toContain('platform:admin');
      expect(hierarchy).toContain('platform:read');
    });

    it('should expand agent:manage to include all agent scopes', () => {
      const hierarchy = scopeHierarchy('agent:manage');
      expect(hierarchy).toContain('agent:manage');
      expect(hierarchy).toContain('agent:read');
      expect(hierarchy).toContain('agent:extended');
      expect(hierarchy).toContain('agent:register');
    });

    it('should expand agent:extended to include agent:read', () => {
      const hierarchy = scopeHierarchy('agent:extended');
      expect(hierarchy).toContain('agent:extended');
      expect(hierarchy).toContain('agent:read');
    });

    it('should expand task scopes correctly', () => {
      const resubmitHierarchy = scopeHierarchy('task:resubmit');
      expect(resubmitHierarchy).toContain('task:resubmit');
      expect(resubmitHierarchy).toContain('task:read');
      expect(resubmitHierarchy).toContain('task:create');

      const cancelHierarchy = scopeHierarchy('task:cancel');
      expect(cancelHierarchy).toContain('task:cancel');
      expect(cancelHierarchy).toContain('task:read');
    });

    it('should expand message:stream to include message:send', () => {
      const hierarchy = scopeHierarchy('message:stream');
      expect(hierarchy).toContain('message:stream');
      expect(hierarchy).toContain('message:send');
    });

    it('should expand QE execute scopes to include read', () => {
      const hierarchy = scopeHierarchy('qe:test-generation:execute');
      expect(hierarchy).toContain('qe:test-generation:execute');
      expect(hierarchy).toContain('qe:test-generation:read');
    });
  });

  describe('expandScopes', () => {
    it('should expand multiple scopes', () => {
      const expanded = expandScopes(['platform:admin', 'agent:manage']);

      expect(expanded).toContain('platform:admin');
      expect(expanded).toContain('platform:read');
      expect(expanded).toContain('agent:manage');
      expect(expanded).toContain('agent:read');
      expect(expanded).toContain('agent:extended');
    });

    it('should remove duplicates', () => {
      const expanded = expandScopes(['agent:manage', 'agent:read']);

      // agent:read appears in both but should only be once
      const readCount = expanded.filter((s) => s === 'agent:read').length;
      expect(readCount).toBe(1);
    });

    it('should handle empty array', () => {
      const expanded = expandScopes([]);
      expect(expanded).toEqual([]);
    });
  });

  // ==========================================================================
  // Scope Validation Tests
  // ==========================================================================

  describe('validateScopes', () => {
    it('should validate when all requested scopes are granted', () => {
      const result = validateScopes(['agent:read', 'task:read'], ['agent:read', 'task:read']);
      expect(result).toBe(true);
    });

    it('should validate when granted scopes imply requested', () => {
      const result = validateScopes(['agent:read'], ['agent:manage']);
      expect(result).toBe(true);
    });

    it('should validate complex hierarchy', () => {
      // platform:admin implies platform:read
      // agent:manage implies agent:read, agent:extended, agent:register
      // task:read is NOT implied by either, so we need to grant it separately
      const result = validateScopes(
        ['platform:read', 'agent:read', 'agent:extended'],
        ['platform:admin', 'agent:manage']
      );
      expect(result).toBe(true);
    });

    it('should reject when requested scope not covered', () => {
      const result = validateScopes(['task:cancel'], ['task:read']);
      expect(result).toBe(false);
    });

    it('should reject when completely different scopes', () => {
      const result = validateScopes(['agent:read'], ['task:read']);
      expect(result).toBe(false);
    });

    it('should handle empty requested scopes', () => {
      const result = validateScopes([], ['agent:read']);
      expect(result).toBe(true);
    });

    it('should handle empty granted scopes', () => {
      const result = validateScopes(['agent:read'], []);
      expect(result).toBe(false);
    });
  });

  describe('getMissingScopes', () => {
    it('should return missing scopes', () => {
      const missing = getMissingScopes(['agent:read', 'task:cancel', 'platform:admin'], ['agent:manage']);

      expect(missing).toContain('task:cancel');
      expect(missing).toContain('platform:admin');
      expect(missing).not.toContain('agent:read'); // Covered by agent:manage
    });

    it('should return empty array when all scopes covered', () => {
      const missing = getMissingScopes(['agent:read', 'platform:read'], ['agent:manage', 'platform:admin']);
      expect(missing).toEqual([]);
    });

    it('should return all requested when no grants', () => {
      const missing = getMissingScopes(['agent:read', 'task:create'], []);
      expect(missing).toEqual(['agent:read', 'task:create']);
    });
  });

  // ==========================================================================
  // Scope String Handling Tests
  // ==========================================================================

  describe('normalizeScopes', () => {
    it('should remove duplicates', () => {
      const normalized = normalizeScopes(['agent:read', 'task:read', 'agent:read']);
      expect(normalized).toHaveLength(2);
    });

    it('should sort scopes', () => {
      const normalized = normalizeScopes(['task:read', 'agent:read', 'platform:read']);
      expect(normalized).toEqual(['agent:read', 'platform:read', 'task:read']);
    });
  });

  describe('parseScopeString', () => {
    it('should parse space-separated scope string', () => {
      const scopes = parseScopeString('agent:read task:create message:send');
      expect(scopes).toEqual(['agent:read', 'task:create', 'message:send']);
    });

    it('should handle multiple spaces', () => {
      const scopes = parseScopeString('agent:read    task:create');
      expect(scopes).toEqual(['agent:read', 'task:create']);
    });

    it('should trim whitespace', () => {
      const scopes = parseScopeString('  agent:read task:create  ');
      expect(scopes).toEqual(['agent:read', 'task:create']);
    });

    it('should return empty array for empty string', () => {
      const scopes = parseScopeString('');
      expect(scopes).toEqual([]);
    });

    it('should return empty array for whitespace-only string', () => {
      const scopes = parseScopeString('   ');
      expect(scopes).toEqual([]);
    });
  });

  describe('formatScopeString', () => {
    it('should join scopes with space', () => {
      const scopeString = formatScopeString(['agent:read', 'task:create']);
      expect(scopeString).toBe('agent:read task:create');
    });

    it('should normalize before joining', () => {
      const scopeString = formatScopeString(['task:create', 'agent:read', 'agent:read']);
      expect(scopeString).toBe('agent:read task:create');
    });
  });

  // ==========================================================================
  // Category Tests
  // ==========================================================================

  describe('getScopesByCategory', () => {
    it('should get platform scopes', () => {
      const platformScopes = getScopesByCategory('platform');
      expect(platformScopes).toContain('platform:read');
      expect(platformScopes).toContain('platform:admin');
      expect(platformScopes.length).toBe(2);
    });

    it('should get agent scopes', () => {
      const agentScopes = getScopesByCategory('agent');
      expect(agentScopes).toContain('agent:read');
      expect(agentScopes).toContain('agent:manage');
      expect(agentScopes.length).toBe(4);
    });

    it('should get task scopes', () => {
      const taskScopes = getScopesByCategory('task');
      expect(taskScopes).toContain('task:read');
      expect(taskScopes).toContain('task:create');
      expect(taskScopes).toContain('task:cancel');
      expect(taskScopes).toContain('task:resubmit');
    });

    it('should get QE domain scopes', () => {
      const testGenScopes = getScopesByCategory('qe:test-generation');
      expect(testGenScopes).toContain('qe:test-generation:read');
      expect(testGenScopes).toContain('qe:test-generation:execute');
      expect(testGenScopes.length).toBe(2);
    });

    it('should return empty for unknown category', () => {
      const unknownScopes = getScopesByCategory('unknown');
      expect(unknownScopes).toEqual([]);
    });
  });

  describe('getQEDomainScopes', () => {
    it('should return all QE domain scopes', () => {
      const qeScopes = getQEDomainScopes();

      expect(qeScopes.length).toBe(24); // 12 domains * 2
      expect(qeScopes.every((s) => s.startsWith('qe:'))).toBe(true);
    });
  });

  describe('getCoreScopes', () => {
    it('should return all core scopes', () => {
      const coreScopes = getCoreScopes();

      expect(coreScopes).toContain('platform:read');
      expect(coreScopes).toContain('agent:read');
      expect(coreScopes).toContain('task:read');
      expect(coreScopes.every((s) => !s.startsWith('qe:'))).toBe(true);
    });
  });

  // ==========================================================================
  // Default Scopes Tests
  // ==========================================================================

  describe('Default Scopes', () => {
    it('should define minimal default client scopes', () => {
      expect(DEFAULT_CLIENT_SCOPES).toContain('platform:read');
      expect(DEFAULT_CLIENT_SCOPES).toContain('agent:read');
      expect(DEFAULT_CLIENT_SCOPES).toContain('task:read');
      expect(DEFAULT_CLIENT_SCOPES).toContain('message:send');
      expect(DEFAULT_CLIENT_SCOPES.length).toBe(4);
    });

    it('should define admin scopes as all scopes', () => {
      expect(ADMIN_SCOPES.length).toBe(Object.keys(A2A_SCOPES).length);

      // All scopes should be valid
      for (const scope of ADMIN_SCOPES) {
        expect(isValidScope(scope)).toBe(true);
      }
    });

    it('should have admin scopes cover all default scopes', () => {
      const result = validateScopes(DEFAULT_CLIENT_SCOPES, ADMIN_SCOPES);
      expect(result).toBe(true);
    });
  });
});
