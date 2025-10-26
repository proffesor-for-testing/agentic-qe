/**
 * TestTemplateCreator Tests
 * Phase 2 (v1.1.0) - Pattern Extraction Specialist
 */

import { TestTemplateCreator } from '@reasoning/TestTemplateCreator';
import { TestPattern, PatternType, TestFramework, PatternCategory } from '@types/pattern.types';

describe('TestTemplateCreator', () => {
  let creator: TestTemplateCreator;

  beforeEach(() => {
    creator = new TestTemplateCreator();
  });

  const createMockPattern = (type: PatternType): TestPattern => ({
    id: `pattern-${type}-123`,
    name: `Test ${type}`,
    type,
    category: PatternCategory.UNIT_TEST,
    framework: TestFramework.JEST,
    template: {
      id: 'temp-123',
      name: 'Template',
      description: 'Test template',
      structure: { type: 'root', id: 'root', children: [], properties: {}, parameterRefs: [] },
      parameters: [],
      validationRules: [],
      codeGenerators: {}
    },
    examples: ['example code'],
    frequency: 5,
    confidence: 0.9,
    applicabilityConditions: ['condition'],
    sourceFile: '/test.ts',
    createdAt: new Date(),
    metadata: {}
  });

  describe('createTemplate', () => {
    it('should create template from edge case pattern', async () => {
      const pattern = createMockPattern(PatternType.EDGE_CASE);

      const template = await creator.createTemplate(pattern);

      expect(template.id).toBeDefined();
      expect(template.name).toContain('Template:');
      expect(template.structure).toBeDefined();
      expect(template.parameters.length).toBeGreaterThan(0);
      expect(template.validationRules.length).toBeGreaterThan(0);
    });

    it('should create template with standard parameters', async () => {
      const pattern = createMockPattern(PatternType.ASSERTION_PATTERN);

      const template = await creator.createTemplate(pattern);

      const paramNames = template.parameters.map(p => p.name);
      expect(paramNames).toContain('suiteName');
      expect(paramNames).toContain('testName');
      expect(paramNames).toContain('input');
      expect(paramNames).toContain('expectedOutput');
    });

    it('should create template with pattern-specific parameters', async () => {
      const boundaryPattern = createMockPattern(PatternType.BOUNDARY_CONDITION);

      const template = await creator.createTemplate(boundaryPattern);

      const paramNames = template.parameters.map(p => p.name);
      expect(paramNames).toContain('minValue');
      expect(paramNames).toContain('maxValue');
    });

    it('should create template with error handling parameters', async () => {
      const errorPattern = createMockPattern(PatternType.ERROR_HANDLING);

      const template = await creator.createTemplate(errorPattern);

      const paramNames = template.parameters.map(p => p.name);
      expect(paramNames).toContain('errorType');
      expect(paramNames).toContain('errorMessage');
    });

    it('should create template with mock parameters', async () => {
      const mockPattern = createMockPattern(PatternType.MOCK_PATTERN);

      const template = await creator.createTemplate(mockPattern);

      const paramNames = template.parameters.map(p => p.name);
      expect(paramNames).toContain('mockTarget');
      expect(paramNames).toContain('mockReturnValue');
    });

    it('should create template with async parameters', async () => {
      const asyncPattern = createMockPattern(PatternType.ASYNC_PATTERN);

      const template = await creator.createTemplate(asyncPattern);

      const paramNames = template.parameters.map(p => p.name);
      expect(paramNames).toContain('timeout');
    });
  });

  describe('createTemplates', () => {
    it('should create multiple templates', async () => {
      const patterns = [
        createMockPattern(PatternType.EDGE_CASE),
        createMockPattern(PatternType.ERROR_HANDLING),
        createMockPattern(PatternType.MOCK_PATTERN)
      ];

      const templates = await creator.createTemplates(patterns);

      expect(templates.length).toBe(3);
      templates.forEach(template => {
        expect(template.id).toBeDefined();
        expect(template.parameters.length).toBeGreaterThan(0);
      });
    });
  });

  describe('code generation', () => {
    it('should generate Jest code', async () => {
      const pattern = createMockPattern(PatternType.ASSERTION_PATTERN);

      const template = await creator.createTemplate(pattern);

      expect(template.codeGenerators[TestFramework.JEST]).toBeDefined();
      expect(template.codeGenerators[TestFramework.JEST]).toContain('describe');
      expect(template.codeGenerators[TestFramework.JEST]).toContain('expect');
    });

    it('should generate Mocha code', async () => {
      const pattern = createMockPattern(PatternType.ASSERTION_PATTERN);

      const template = await creator.createTemplate(pattern);

      expect(template.codeGenerators[TestFramework.MOCHA]).toBeDefined();
      expect(template.codeGenerators[TestFramework.MOCHA]).toContain('describe');
    });

    it('should generate Cypress code', async () => {
      const pattern = createMockPattern(PatternType.ASSERTION_PATTERN);

      const template = await creator.createTemplate(pattern);

      expect(template.codeGenerators[TestFramework.CYPRESS]).toBeDefined();
      expect(template.codeGenerators[TestFramework.CYPRESS]).toContain('cy.');
    });

    it('should generate framework-specific assertions', async () => {
      const errorPattern = createMockPattern(PatternType.ERROR_HANDLING);

      const template = await creator.createTemplate(errorPattern);

      const jestCode = template.codeGenerators[TestFramework.JEST];
      expect(jestCode).toContain('toThrow');

      const mochaCode = template.codeGenerators[TestFramework.MOCHA];
      expect(mochaCode).toContain('throw');
    });
  });

  describe('validateTemplate', () => {
    it('should validate required parameters', async () => {
      const pattern = createMockPattern(PatternType.EDGE_CASE);
      const template = await creator.createTemplate(pattern);

      const validParams = {
        suiteName: 'Test Suite',
        testName: 'Test Case',
        input: null,
        expectedOutput: null,
        edgeValue: 'null'
      };

      const result = await creator.validateTemplate(template, validParams);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing required parameters', async () => {
      const pattern = createMockPattern(PatternType.EDGE_CASE);
      const template = await creator.createTemplate(pattern);

      const invalidParams = {
        testName: 'Test Case'
        // Missing required parameters
      };

      const result = await creator.validateTemplate(template, invalidParams);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate boundary order rule', async () => {
      const pattern = createMockPattern(PatternType.BOUNDARY_CONDITION);
      const template = await creator.createTemplate(pattern);

      const invalidParams = {
        suiteName: 'Suite',
        testName: 'Test',
        input: 5,
        expectedOutput: true,
        minValue: 10,
        maxValue: 5 // maxValue < minValue - invalid
      };

      const result = await creator.validateTemplate(template, invalidParams);

      expect(result.valid).toBe(false);
    });
  });

  describe('instantiateTemplate', () => {
    it('should instantiate template with parameters', async () => {
      const pattern = createMockPattern(PatternType.EDGE_CASE);
      const template = await creator.createTemplate(pattern);

      const params = {
        suiteName: 'Calculator Tests',
        testName: 'should handle null input',
        input: null,
        expectedOutput: null,
        edgeValue: 'null'
      };

      const code = await creator.instantiateTemplate(template, TestFramework.JEST, params);

      expect(code).toContain('Calculator Tests');
      expect(code).toContain('should handle null input');
      expect(code).toContain('null');
    });

    it('should replace all parameter placeholders', async () => {
      const pattern = createMockPattern(PatternType.ASSERTION_PATTERN);
      const template = await creator.createTemplate(pattern);

      const params = {
        suiteName: 'Math Tests',
        testName: 'addition works',
        input: [1, 2],
        expectedOutput: 3
      };

      const code = await creator.instantiateTemplate(template, TestFramework.JEST, params);

      expect(code).not.toContain('{{suiteName}}');
      expect(code).not.toContain('{{testName}}');
      expect(code).toContain('Math Tests');
      expect(code).toContain('addition works');
    });

    it('should throw error for invalid parameters', async () => {
      const pattern = createMockPattern(PatternType.EDGE_CASE);
      const template = await creator.createTemplate(pattern);

      const invalidParams = {}; // Missing required params

      await expect(
        creator.instantiateTemplate(template, TestFramework.JEST, invalidParams)
      ).rejects.toThrow('Template validation failed');
    });

    it('should generate different code for different frameworks', async () => {
      const pattern = createMockPattern(PatternType.ASSERTION_PATTERN);
      const template = await creator.createTemplate(pattern);

      const params = {
        suiteName: 'Test',
        testName: 'test',
        input: 1,
        expectedOutput: 1
      };

      const jestCode = await creator.instantiateTemplate(template, TestFramework.JEST, params);
      const mochaCode = await creator.instantiateTemplate(template, TestFramework.MOCHA, params);
      const cypressCode = await creator.instantiateTemplate(template, TestFramework.CYPRESS, params);

      expect(jestCode).toContain('expect');
      expect(jestCode).toContain('toEqual');
      expect(mochaCode).toContain('expect');
      expect(cypressCode).toContain('cy.');

      // Should be different
      expect(jestCode).not.toBe(mochaCode);
      expect(jestCode).not.toBe(cypressCode);
    });
  });

  describe('template structure', () => {
    it('should create arrange-act-assert structure', async () => {
      const pattern = createMockPattern(PatternType.ASSERTION_PATTERN);
      const template = await creator.createTemplate(pattern);

      const structure = template.structure;
      expect(structure.type).toBe('describe');

      const testNode = structure.children[0];
      expect(testNode).toBeDefined();

      const childTypes = testNode.children.map((c: any) => c.type);
      expect(childTypes).toContain('arrange');
      expect(childTypes).toContain('act');
      expect(childTypes).toContain('assert');
    });

    it('should include setup for mock patterns', async () => {
      const pattern = createMockPattern(PatternType.MOCK_PATTERN);
      const template = await creator.createTemplate(pattern);

      const structure = template.structure;
      const testNode = structure.children[0];
      const childTypes = testNode.children.map((c: any) => c.type);

      expect(childTypes).toContain('setup');
    });
  });
});
