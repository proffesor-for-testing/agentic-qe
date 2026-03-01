/**
 * Agentic QE v3 - MCP Tool Registry Tests
 * Tests for the tool registry per ADR-010
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QE_TOOL_NAMES,
  QE_TOOLS,
  getQETool,
  getToolsByDomain,
  getToolDefinition,
  getAllToolDefinitions,
} from '../../../../src/mcp/tools/registry';

describe('QE Tool Registry', () => {
  describe('QE_TOOL_NAMES', () => {
    it('should have all tool names', () => {
      const names = Object.values(QE_TOOL_NAMES);
      // 15 original + 3 GOAP + 3 MinCut + 1 Dream + 5 new + 1 QualityCriteria + 4 Coherence (ADR-052) + 1 QX Analysis = 33 tools
      expect(names.length).toBe(33);
    });

    it('should follow qe/* naming convention', () => {
      for (const name of Object.values(QE_TOOL_NAMES)) {
        expect(name).toMatch(/^qe\/.+\/.+$/);
      }
    });

    it('should have test generation tool', () => {
      expect(QE_TOOL_NAMES.TEST_GENERATE).toBe('qe/tests/generate');
    });

    it('should have test execution tool', () => {
      expect(QE_TOOL_NAMES.TEST_EXECUTE).toBe('qe/tests/execute');
    });

    it('should have coverage tools', () => {
      expect(QE_TOOL_NAMES.COVERAGE_ANALYZE).toBe('qe/coverage/analyze');
      expect(QE_TOOL_NAMES.COVERAGE_GAPS).toBe('qe/coverage/gaps');
    });

    it('should have quality tool', () => {
      expect(QE_TOOL_NAMES.QUALITY_EVALUATE).toBe('qe/quality/evaluate');
    });

    it('should have defect prediction tool', () => {
      expect(QE_TOOL_NAMES.DEFECT_PREDICT).toBe('qe/defects/predict');
    });

    it('should have requirements validation tool', () => {
      expect(QE_TOOL_NAMES.REQUIREMENTS_VALIDATE).toBe('qe/requirements/validate');
    });

    it('should have code analysis tool', () => {
      expect(QE_TOOL_NAMES.CODE_ANALYZE).toBe('qe/code/analyze');
    });

    it('should have security scan tool', () => {
      expect(QE_TOOL_NAMES.SECURITY_SCAN).toBe('qe/security/scan');
    });

    it('should have contract validation tool', () => {
      expect(QE_TOOL_NAMES.CONTRACT_VALIDATE).toBe('qe/contracts/validate');
    });

    it('should have visual compare tool', () => {
      expect(QE_TOOL_NAMES.VISUAL_COMPARE).toBe('qe/visual/compare');
    });

    it('should have accessibility audit tool', () => {
      expect(QE_TOOL_NAMES.A11Y_AUDIT).toBe('qe/a11y/audit');
    });

    it('should have chaos injection tool', () => {
      expect(QE_TOOL_NAMES.CHAOS_INJECT).toBe('qe/chaos/inject');
    });

    it('should have learning optimization tool', () => {
      expect(QE_TOOL_NAMES.LEARNING_OPTIMIZE).toBe('qe/learning/optimize');
    });

    it('should have token usage analysis tool (ADR-042)', () => {
      expect(QE_TOOL_NAMES.TOKEN_USAGE).toBe('qe/analysis/token_usage');
    });
  });

  describe('QE_TOOLS', () => {
    it('should have all tool instances', () => {
      // 15 original + 3 GOAP + 3 MinCut + 1 Dream + 5 new + 1 QualityCriteria + 4 Coherence (ADR-052) + 1 QX Analysis = 33 tools
      expect(QE_TOOLS.length).toBe(33);
    });

    it('should have all unique names', () => {
      const names = QE_TOOLS.map(t => t.name);
      const uniqueNames = new Set(names);
      // 15 original + 3 GOAP + 3 MinCut + 1 Dream + 5 new + 1 QualityCriteria + 4 Coherence (ADR-052) + 1 QX Analysis = 33 tools
      expect(uniqueNames.size).toBe(33);
    });

    it('should have descriptions for all tools', () => {
      for (const tool of QE_TOOLS) {
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(10);
      }
    });

    it('should have domains for all tools', () => {
      for (const tool of QE_TOOLS) {
        expect(tool.domain).toBeDefined();
        expect(tool.domain.length).toBeGreaterThan(0);
      }
    });

    it('should have schemas for all tools', () => {
      for (const tool of QE_TOOLS) {
        const schema = tool.getSchema();
        expect(schema).toBeDefined();
        expect(schema.type).toBe('object');
        expect(schema.properties).toBeDefined();
      }
    });
  });

  describe('getQETool', () => {
    it('should find tool by name', () => {
      const tool = getQETool('qe/tests/generate');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('qe/tests/generate');
    });

    it('should return undefined for unknown tool', () => {
      const tool = getQETool('qe/unknown/tool');
      expect(tool).toBeUndefined();
    });

    it('should find all registered tools by name', () => {
      for (const name of Object.values(QE_TOOL_NAMES)) {
        const tool = getQETool(name);
        expect(tool).toBeDefined();
        expect(tool?.name).toBe(name);
      }
    });
  });

  describe('getToolsByDomain', () => {
    it('should find tools by domain', () => {
      const coverageTools = getToolsByDomain('coverage-analysis');
      expect(coverageTools.length).toBe(2);
      expect(coverageTools.map(t => t.name)).toContain('qe/coverage/analyze');
      expect(coverageTools.map(t => t.name)).toContain('qe/coverage/gaps');
    });

    it('should find test-generation tools', () => {
      const tools = getToolsByDomain('test-generation');
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('qe/tests/generate');
    });

    it('should find test-execution tools', () => {
      const tools = getToolsByDomain('test-execution');
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('qe/tests/execute');
    });

    it('should find visual-accessibility tools', () => {
      const tools = getToolsByDomain('visual-accessibility');
      expect(tools.length).toBe(2);
    });

    it('should return empty array for unknown domain', () => {
      const tools = getToolsByDomain('unknown-domain');
      expect(tools).toEqual([]);
    });
  });

  describe('getToolDefinition', () => {
    it('should return MCP-compatible definition', () => {
      const tool = QE_TOOLS[0];
      const def = getToolDefinition(tool);

      expect(def.name).toBe(tool.name);
      expect(def.description).toBe(tool.description);
      expect(def.inputSchema).toBeDefined();
      expect(def.inputSchema.type).toBe('object');
    });

    it('should include schema properties', () => {
      const tool = getQETool('qe/tests/generate')!;
      const def = getToolDefinition(tool);

      expect(def.inputSchema.properties).toBeDefined();
    });

    it('should include required fields', () => {
      const tool = getQETool('qe/tests/generate')!;
      const def = getToolDefinition(tool);

      expect(def.inputSchema.required).toBeDefined();
    });
  });

  describe('getAllToolDefinitions', () => {
    it('should return all tool definitions', () => {
      const definitions = getAllToolDefinitions();
      // 15 original + 3 GOAP + 3 MinCut + 1 Dream + 5 new + 1 QualityCriteria + 4 Coherence (ADR-052) + 1 QX Analysis = 33 tools
      expect(definitions.length).toBe(33);
    });

    it('should return MCP-compatible definitions', () => {
      const definitions = getAllToolDefinitions();

      for (const def of definitions) {
        expect(def.name).toBeDefined();
        expect(def.description).toBeDefined();
        expect(def.inputSchema).toBeDefined();
        expect(def.inputSchema.type).toBe('object');
      }
    });

    it('should have unique names', () => {
      const definitions = getAllToolDefinitions();
      const names = definitions.map(d => d.name);
      const uniqueNames = new Set(names);
      // 15 original + 3 GOAP + 3 MinCut + 1 Dream + 5 new + 1 QualityCriteria + 4 Coherence (ADR-052) + 1 QX Analysis = 33 tools
      expect(uniqueNames.size).toBe(33);
    });
  });

  describe('tool domains coverage', () => {
    it('should cover all 12 DDD domains', () => {
      const domains = new Set(QE_TOOLS.map(t => t.domain));

      // All 12 domains from ADR-018
      expect(domains.has('test-generation')).toBe(true);
      expect(domains.has('test-execution')).toBe(true);
      expect(domains.has('coverage-analysis')).toBe(true);
      expect(domains.has('quality-assessment')).toBe(true);
      expect(domains.has('defect-intelligence')).toBe(true);
      expect(domains.has('requirements-validation')).toBe(true);
      expect(domains.has('code-intelligence')).toBe(true);
      expect(domains.has('security-compliance')).toBe(true);
      expect(domains.has('contract-testing')).toBe(true);
      expect(domains.has('visual-accessibility')).toBe(true);
      expect(domains.has('chaos-resilience')).toBe(true);
      expect(domains.has('learning-optimization')).toBe(true);
    });
  });
});
