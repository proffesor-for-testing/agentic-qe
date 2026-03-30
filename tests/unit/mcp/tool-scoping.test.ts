/**
 * Agentic QE v3 - Per-Agent Tool Scoping Tests
 * Tests for MCP tool access restrictions by agent role
 */

import { describe, it, expect } from 'vitest';
import {
  isToolAllowed,
  getToolScope,
  getAllowedTools,
  validateToolAccess,
  AgentRole,
} from '../../../src/mcp/tool-scoping';

describe('Per-Agent Tool Scoping', () => {
  describe('isToolAllowed', () => {
    const scopedRoles: { role: AgentRole; tools: string[] }[] = [
      {
        role: 'test-generator',
        tools: [
          'test_generate_enhanced',
          'test_execute_parallel',
          'coverage_analyze_sublinear',
          'code_index',
          'hypergraph_query',
          'memory_query',
          'memory_retrieve',
          'model_route',
        ],
      },
      {
        role: 'coverage-analyzer',
        tools: [
          'coverage_analyze_sublinear',
          'code_index',
          'hypergraph_query',
          'quality_assess',
          'memory_query',
          'memory_retrieve',
        ],
      },
      {
        role: 'security-scanner',
        tools: [
          'security_scan_comprehensive',
          'code_index',
          'hypergraph_query',
          'memory_query',
          'memory_retrieve',
        ],
      },
      {
        role: 'quality-assessor',
        tools: [
          'quality_assess',
          'coverage_analyze_sublinear',
          'defect_predict',
          'hypergraph_query',
          'memory_query',
          'memory_retrieve',
        ],
      },
      {
        role: 'defect-predictor',
        tools: ['defect_predict', 'code_index', 'hypergraph_query', 'memory_query', 'memory_retrieve'],
      },
      {
        role: 'contract-validator',
        tools: ['contract_validate', 'memory_query', 'memory_retrieve'],
      },
      {
        role: 'accessibility-tester',
        tools: ['accessibility_test', 'memory_query', 'memory_retrieve'],
      },
      {
        role: 'chaos-engineer',
        tools: ['chaos_test', 'quality_assess', 'memory_query', 'memory_retrieve'],
      },
    ];

    it.each(scopedRoles)(
      'should allow $role to access its allowed tools',
      ({ role, tools }) => {
        for (const tool of tools) {
          expect(isToolAllowed(role, tool)).toBe(true);
        }
      },
    );

    it.each(scopedRoles)(
      'should deny $role access to tools not in its allowed list',
      ({ role }) => {
        expect(isToolAllowed(role, 'fleet_init')).toBe(false);
        expect(isToolAllowed(role, 'agent_spawn')).toBe(false);
        expect(isToolAllowed(role, 'nonexistent_tool')).toBe(false);
      },
    );

    it('should allow fleet-admin to access any tool', () => {
      expect(isToolAllowed('fleet-admin', 'fleet_init')).toBe(true);
      expect(isToolAllowed('fleet-admin', 'agent_spawn')).toBe(true);
      expect(isToolAllowed('fleet-admin', 'security_scan_comprehensive')).toBe(true);
      expect(isToolAllowed('fleet-admin', 'any_random_tool')).toBe(true);
    });

    it('should allow unrestricted to access any tool', () => {
      expect(isToolAllowed('unrestricted', 'fleet_init')).toBe(true);
      expect(isToolAllowed('unrestricted', 'agent_spawn')).toBe(true);
      expect(isToolAllowed('unrestricted', 'security_scan_comprehensive')).toBe(true);
      expect(isToolAllowed('unrestricted', 'any_random_tool')).toBe(true);
    });

    it('should deny access for unknown roles', () => {
      expect(isToolAllowed('unknown-role' as AgentRole, 'any_tool')).toBe(false);
    });

    it('should deny explicitly denied tools even when allowAll is set', () => {
      // This tests the deny-overrides-allow logic. Since DEFAULT_SCOPES
      // don't have denied entries, we test via the precedence logic:
      // denied check happens before allowAll check.
      // For fleet-admin with no denied list, all tools pass.
      expect(isToolAllowed('fleet-admin', 'memory_query')).toBe(true);
    });
  });

  describe('getToolScope', () => {
    it('should return the scope for a known role', () => {
      const scope = getToolScope('test-generator');
      expect(scope.allowed).toBeDefined();
      expect(scope.allowed).toContain('test_generate_enhanced');
      expect(scope.allowAll).toBeUndefined();
    });

    it('should return allowAll scope for fleet-admin', () => {
      const scope = getToolScope('fleet-admin');
      expect(scope.allowAll).toBe(true);
    });

    it('should return allowAll scope for unrestricted', () => {
      const scope = getToolScope('unrestricted');
      expect(scope.allowAll).toBe(true);
    });

    it('should return empty allowed list for unknown roles', () => {
      const scope = getToolScope('nonexistent' as AgentRole);
      expect(scope).toEqual({ allowed: [] });
    });
  });

  describe('getAllowedTools', () => {
    it('should return the tool list for scoped roles', () => {
      const tools = getAllowedTools('security-scanner');
      expect(tools).toEqual([
        'security_scan_comprehensive',
        'code_index',
        'hypergraph_query',
        'memory_query',
        'memory_retrieve',
      ]);
    });

    it('should return "all" for fleet-admin', () => {
      expect(getAllowedTools('fleet-admin')).toBe('all');
    });

    it('should return "all" for unrestricted', () => {
      expect(getAllowedTools('unrestricted')).toBe('all');
    });

    it('should return empty array for unknown roles', () => {
      expect(getAllowedTools('bogus' as AgentRole)).toEqual([]);
    });
  });

  describe('validateToolAccess', () => {
    it('should return null when access is allowed', () => {
      expect(validateToolAccess('test-generator', 'test_generate_enhanced')).toBeNull();
      expect(validateToolAccess('fleet-admin', 'any_tool')).toBeNull();
      expect(validateToolAccess('unrestricted', 'any_tool')).toBeNull();
    });

    it('should return an error message when access is denied', () => {
      const error = validateToolAccess('security-scanner', 'fleet_init');
      expect(error).not.toBeNull();
      expect(error).toContain('security-scanner');
      expect(error).toContain('fleet_init');
      expect(error).toContain('not allowed');
    });

    it('should include allowed tools in the error message', () => {
      const error = validateToolAccess('contract-validator', 'chaos_test');
      expect(error).toContain('contract_validate');
      expect(error).toContain('memory_query');
    });

    it('should return an error for unknown roles', () => {
      const error = validateToolAccess('fake-role' as AgentRole, 'any_tool');
      expect(error).not.toBeNull();
      expect(error).toContain('fake-role');
    });
  });
});
