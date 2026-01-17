/**
 * Agent Mapper Tests
 * Tests for V2 to V3 agent migration compatibility layer
 *
 * These tests verify that the AgentMapper correctly implements ADR-048
 * V2-to-V3 agent mapping with proper naming (no v3- prefix).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentMapper } from '../../../src/compatibility/agent-mapper.js';
import type { AgentResolution, AgentMapping } from '../../../src/compatibility/types.js';

describe('AgentMapper', () => {
  let mapper: AgentMapper;

  beforeEach(() => {
    mapper = new AgentMapper();
  });

  describe('resolve()', () => {
    describe('ADR-048 Tier 2: Renamed Agents', () => {
      // Test each ADR-048 mapping
      const adr048Mappings = [
        { v2: 'qe-test-generator', v3: 'qe-test-architect', domain: 'test-generation' },
        { v2: 'qe-test-writer', v3: 'qe-tdd-red', domain: 'test-generation' },
        { v2: 'qe-test-implementer', v3: 'qe-tdd-green', domain: 'test-generation' },
        { v2: 'qe-test-refactorer', v3: 'qe-tdd-refactor', domain: 'test-generation' },
        { v2: 'qe-coverage-analyzer', v3: 'qe-coverage-specialist', domain: 'coverage-analysis' },
        { v2: 'qe-gap-detector', v3: 'qe-coverage-specialist', domain: 'coverage-analysis' },
        { v2: 'qe-visual-tester', v3: 'qe-visual-accessibility', domain: 'visual-accessibility' },
        { v2: 'qe-graphql-tester', v3: 'qe-contract-validator', domain: 'contract-testing' },
        { v2: 'qe-api-contract-validator', v3: 'qe-contract-testing', domain: 'contract-testing' },
        { v2: 'qe-deployment-advisor', v3: 'qe-quality-gate', domain: 'quality-assessment' },
        { v2: 'qe-parallel-executor', v3: 'qe-test-executor', domain: 'test-execution' },
        { v2: 'qe-defect-predictor', v3: 'qe-defect-intelligence', domain: 'defect-intelligence' },
        { v2: 'qe-root-cause-analyzer', v3: 'qe-defect-intelligence', domain: 'defect-intelligence' },
        { v2: 'qe-learning-coordinator', v3: 'qe-learning-optimization', domain: 'learning-optimization' },
      ];

      for (const mapping of adr048Mappings) {
        it(`should resolve ${mapping.v2} to ${mapping.v3}`, () => {
          const result = mapper.resolve(mapping.v2);

          expect(result.resolved).toBe(true);
          expect(result.v3Agent).toBe(mapping.v3);
          expect(result.wasV2).toBe(true);
          expect(result.domain).toBe(mapping.domain);
          expect(result.deprecationWarning).toContain('deprecated');
          expect(result.deprecationWarning).toContain(mapping.v3);
        });
      }
    });

    describe('V3 agent passthrough', () => {
      const v3Agents = [
        'qe-test-architect',
        'qe-tdd-red',
        'qe-tdd-green',
        'qe-tdd-refactor',
        'qe-coverage-specialist',
        'qe-visual-accessibility',
        'qe-contract-validator',
        'qe-contract-testing',
        'qe-quality-gate',
        'qe-test-executor',
        'qe-defect-intelligence',
        'qe-learning-optimization',
      ];

      for (const agent of v3Agents) {
        it(`should recognize ${agent} as already V3`, () => {
          const result = mapper.resolve(agent);

          expect(result.resolved).toBe(true);
          expect(result.v3Agent).toBe(agent);
          expect(result.wasV2).toBe(false);
          expect(result.deprecationWarning).toBeUndefined();
        });
      }
    });

    describe('Unknown agent handling', () => {
      it('should not resolve unknown agents', () => {
        const result = mapper.resolve('unknown-agent');

        expect(result.resolved).toBe(false);
        expect(result.v3Agent).toBeNull();
        expect(result.wasV2).toBe(false);
        expect(result.domain).toBeNull();
      });

      it('should not resolve non-QE agents', () => {
        const result = mapper.resolve('some-other-agent');

        expect(result.resolved).toBe(false);
        expect(result.v3Agent).toBeNull();
      });
    });

    describe('Case handling', () => {
      it('should handle case-insensitive lookups for V2 agents', () => {
        const result = mapper.resolve('QE-TEST-GENERATOR');

        expect(result.resolved).toBe(true);
        expect(result.v3Agent).toBe('qe-test-architect');
      });

      it('should handle case-insensitive lookups for V3 agents', () => {
        const result = mapper.resolve('QE-TEST-ARCHITECT');

        expect(result.resolved).toBe(true);
        expect(result.wasV2).toBe(false);
      });

      it('should handle mixed case', () => {
        const result = mapper.resolve('Qe-Test-Generator');

        expect(result.resolved).toBe(true);
        expect(result.v3Agent).toBe('qe-test-architect');
      });
    });
  });

  describe('isV2Agent()', () => {
    it('should return true for V2 agents', () => {
      expect(mapper.isV2Agent('qe-test-generator')).toBe(true);
      expect(mapper.isV2Agent('qe-test-writer')).toBe(true);
      expect(mapper.isV2Agent('qe-coverage-analyzer')).toBe(true);
      expect(mapper.isV2Agent('qe-parallel-executor')).toBe(true);
    });

    it('should return false for V3 agents', () => {
      expect(mapper.isV2Agent('qe-test-architect')).toBe(false);
      expect(mapper.isV2Agent('qe-tdd-red')).toBe(false);
      expect(mapper.isV2Agent('qe-coverage-specialist')).toBe(false);
      expect(mapper.isV2Agent('qe-test-executor')).toBe(false);
    });

    it('should return false for unknown agents', () => {
      expect(mapper.isV2Agent('unknown-agent')).toBe(false);
    });
  });

  describe('getV2Name()', () => {
    it('should return first V2 name for V3 agent', () => {
      expect(mapper.getV2Name('qe-test-architect')).toBe('qe-test-generator');
      expect(mapper.getV2Name('qe-tdd-red')).toBe('qe-test-writer');
    });

    it('should return null for unknown V3 agent', () => {
      expect(mapper.getV2Name('unknown-agent')).toBeNull();
    });
  });

  describe('getV2Names()', () => {
    it('should return single V2 name when only one exists', () => {
      const names = mapper.getV2Names('qe-test-architect');
      expect(names).toEqual(['qe-test-generator']);
    });

    it('should return multiple V2 names when agent was consolidated', () => {
      // qe-coverage-specialist has two predecessors: qe-coverage-analyzer and qe-gap-detector
      const names = mapper.getV2Names('qe-coverage-specialist');
      expect(names).toContain('qe-coverage-analyzer');
      expect(names).toContain('qe-gap-detector');
      expect(names.length).toBe(2);
    });

    it('should return multiple V2 names for qe-defect-intelligence', () => {
      const names = mapper.getV2Names('qe-defect-intelligence');
      expect(names).toContain('qe-defect-predictor');
      expect(names).toContain('qe-root-cause-analyzer');
      expect(names.length).toBe(2);
    });

    it('should return empty array for unknown agent', () => {
      const names = mapper.getV2Names('unknown-agent');
      expect(names).toEqual([]);
    });
  });

  describe('getAllMappings()', () => {
    it('should return all ADR-048 mappings', () => {
      const mappings = mapper.getAllMappings();

      expect(mappings.length).toBeGreaterThanOrEqual(14);
      expect(mappings.every(m => m.deprecated)).toBe(true);
    });

    it('should include required fields in each mapping', () => {
      const mappings = mapper.getAllMappings();

      for (const mapping of mappings) {
        expect(mapping.v2Name).toBeDefined();
        expect(mapping.v3Name).toBeDefined();
        expect(mapping.domain).toBeDefined();
        expect(mapping.deprecated).toBe(true);
        // V3 names should NOT have v3- prefix
        expect(mapping.v3Name).not.toMatch(/^v3-/);
      }
    });
  });

  describe('getMappingsByDomain()', () => {
    it('should return test-generation agents', () => {
      const mappings = mapper.getMappingsByDomain('test-generation');

      expect(mappings.length).toBe(4);
      expect(mappings.map(m => m.v2Name)).toContain('qe-test-generator');
      expect(mappings.map(m => m.v2Name)).toContain('qe-test-writer');
      expect(mappings.map(m => m.v2Name)).toContain('qe-test-implementer');
      expect(mappings.map(m => m.v2Name)).toContain('qe-test-refactorer');
    });

    it('should return coverage-analysis agents', () => {
      const mappings = mapper.getMappingsByDomain('coverage-analysis');

      expect(mappings.length).toBe(2);
      expect(mappings.map(m => m.v2Name)).toContain('qe-coverage-analyzer');
      expect(mappings.map(m => m.v2Name)).toContain('qe-gap-detector');
    });

    it('should return defect-intelligence agents', () => {
      const mappings = mapper.getMappingsByDomain('defect-intelligence');

      expect(mappings.length).toBe(2);
      expect(mappings.map(m => m.v2Name)).toContain('qe-defect-predictor');
      expect(mappings.map(m => m.v2Name)).toContain('qe-root-cause-analyzer');
    });

    it('should return empty array for unknown domain', () => {
      const mappings = mapper.getMappingsByDomain('unknown-domain');
      expect(mappings).toEqual([]);
    });
  });

  describe('getAllDomains()', () => {
    it('should return all unique domains', () => {
      const domains = mapper.getAllDomains();

      expect(domains).toContain('test-generation');
      expect(domains).toContain('coverage-analysis');
      expect(domains).toContain('test-execution');
      expect(domains).toContain('quality-assessment');
      expect(domains).toContain('defect-intelligence');
      expect(domains).toContain('learning-optimization');
      expect(domains).toContain('visual-accessibility');
      expect(domains).toContain('contract-testing');
    });
  });

  describe('generateMigrationReport()', () => {
    it('should categorize agents correctly', () => {
      const usedAgents = [
        'qe-test-generator',      // V2 - needs migration
        'qe-test-architect',      // V3 - already migrated
        'custom-agent',           // Unknown
      ];

      const report = mapper.generateMigrationReport(usedAgents);

      expect(report.needsMigration).toContain('qe-test-generator → qe-test-architect');
      expect(report.alreadyV3).toContain('qe-test-architect');
      expect(report.unknown).toContain('custom-agent');
    });

    it('should handle empty list', () => {
      const report = mapper.generateMigrationReport([]);

      expect(report.needsMigration).toEqual([]);
      expect(report.alreadyV3).toEqual([]);
      expect(report.unknown).toEqual([]);
    });

    it('should handle all V2 agents', () => {
      const v2Agents = ['qe-test-generator', 'qe-test-writer', 'qe-coverage-analyzer'];
      const report = mapper.generateMigrationReport(v2Agents);

      expect(report.needsMigration.length).toBe(3);
      expect(report.alreadyV3.length).toBe(0);
      expect(report.unknown.length).toBe(0);
    });

    it('should handle all V3 agents', () => {
      const v3Agents = ['qe-test-architect', 'qe-tdd-red', 'qe-coverage-specialist'];
      const report = mapper.generateMigrationReport(v3Agents);

      expect(report.needsMigration.length).toBe(0);
      expect(report.alreadyV3.length).toBe(3);
      expect(report.unknown.length).toBe(0);
    });
  });

  describe('generateDetailedMigrationReport()', () => {
    it('should include domain information', () => {
      const report = mapper.generateDetailedMigrationReport(['qe-test-generator']);

      expect(report.needsMigration.length).toBe(1);
      expect(report.needsMigration[0].v2Name).toBe('qe-test-generator');
      expect(report.needsMigration[0].v3Name).toBe('qe-test-architect');
      expect(report.needsMigration[0].domain).toBe('test-generation');
    });
  });

  describe('getDomainForAgent()', () => {
    it('should return domain for V2 agent', () => {
      expect(mapper.getDomainForAgent('qe-test-generator')).toBe('test-generation');
      expect(mapper.getDomainForAgent('qe-coverage-analyzer')).toBe('coverage-analysis');
    });

    it('should return domain for V3 agent', () => {
      expect(mapper.getDomainForAgent('qe-test-architect')).toBe('test-generation');
      expect(mapper.getDomainForAgent('qe-coverage-specialist')).toBe('coverage-analysis');
    });

    it('should return null for unknown agent', () => {
      expect(mapper.getDomainForAgent('unknown-agent')).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const result = mapper.resolve('');

      expect(result.resolved).toBe(false);
    });

    it('should handle whitespace', () => {
      const result = mapper.resolve('  qe-test-generator  ');

      expect(result.resolved).toBe(true);
      expect(result.v3Agent).toBe('qe-test-architect');
    });

    it('should handle agent with tabs', () => {
      const result = mapper.resolve('\tqe-test-generator\t');

      expect(result.resolved).toBe(true);
      expect(result.v3Agent).toBe('qe-test-architect');
    });
  });

  describe('Naming Convention', () => {
    it('should NOT use v3- prefix in V3 names (ADR-048)', () => {
      const mappings = mapper.getAllMappings();

      for (const mapping of mappings) {
        expect(mapping.v3Name).not.toMatch(/^v3-/);
        expect(mapping.v3Name).toMatch(/^qe-/);
      }
    });

    it('should use qe- prefix for all agent names', () => {
      const mappings = mapper.getAllMappings();

      for (const mapping of mappings) {
        expect(mapping.v2Name).toMatch(/^qe-/);
        expect(mapping.v3Name).toMatch(/^qe-/);
      }
    });
  });
});
