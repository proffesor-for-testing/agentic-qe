/**
 * Test KG context integration in test generators
 */
import { describe, it, expect } from 'vitest';
import { TestGeneratorFactory } from '../../../../../src/domains/test-generation/factories/test-generator-factory';
import type { TestGenerationContext, KGDependencyContext, KGSimilarCodeContext } from '../../../../../src/domains/test-generation/interfaces/test-generator.interface';

describe('KG context in test generators', () => {
  const factory = new TestGeneratorFactory();

  describe('pytest generator with KG dependencies', () => {
    it('should include mock imports when dependencies are provided', () => {
      const gen = factory.create('pytest');
      const context: TestGenerationContext = {
        moduleName: 'dependencies',
        importPath: 'installer.steps.dependencies',
        testType: 'unit',
        patterns: [],
        analysis: undefined,
        dependencies: {
          imports: ['installer.context', 'installer.platform_utils'],
          importedBy: ['installer.cli'],
          callees: [],
          callers: [],
        },
      };

      const testCode = gen.generateTests(context);

      expect(testCode).toContain('from unittest.mock import patch, MagicMock');
      expect(testCode).toContain('test_dependencies_importable');
      expect(testCode).toContain('installer.context');
      expect(testCode).toContain('test_public_api_surface');
    });

    it('should include similarity comments when similar code is provided', () => {
      const gen = factory.create('pytest');
      const context: TestGenerationContext = {
        moduleName: 'dependencies',
        importPath: 'installer.steps.dependencies',
        testType: 'unit',
        patterns: [],
        analysis: undefined,
        similarCode: {
          snippets: [
            { file: 'installer/steps/config.py', snippet: 'ConfigStep', score: 0.85 },
          ],
        },
      };

      const testCode = gen.generateTests(context);

      expect(testCode).toContain('KG: Similar modules found');
      expect(testCode).toContain('installer/steps/config.py');
      expect(testCode).toContain('85%');
    });

    it('should generate more assertions with KG context than without', () => {
      const gen = factory.create('pytest');

      const withoutKG: TestGenerationContext = {
        moduleName: 'dependencies',
        importPath: 'installer.steps.dependencies',
        testType: 'unit',
        patterns: [],
        analysis: undefined,
      };

      const withKG: TestGenerationContext = {
        ...withoutKG,
        dependencies: {
          imports: ['installer.context', 'installer.platform_utils', 'installer.steps.base'],
          importedBy: ['installer.cli'],
          callees: [],
          callers: [],
        },
        similarCode: {
          snippets: [
            { file: 'installer/steps/config.py', snippet: 'ConfigStep', score: 0.85 },
          ],
        },
      };

      const codeWithout = gen.generateTests(withoutKG);
      const codeWith = gen.generateTests(withKG);

      const assertsWithout = (codeWithout.match(/assert/g) || []).length;
      const assertsWith = (codeWith.match(/assert/g) || []).length;

      expect(assertsWith).toBeGreaterThan(assertsWithout);
    });
  });

  describe('jest/vitest generator with KG dependencies', () => {
    it('should include mock declarations for external dependencies only', () => {
      const gen = factory.create('vitest');
      const context: TestGenerationContext = {
        moduleName: 'UserService',
        importPath: './user-service',
        testType: 'unit',
        patterns: [],
        analysis: {
          functions: [{
            name: 'getUser',
            parameters: [{ name: 'id', type: 'string', optional: false, defaultValue: undefined }],
            returnType: 'User',
            isAsync: true,
            isExported: true,
            complexity: 2,
            startLine: 10,
            endLine: 20,
          }],
          classes: [],
        },
        dependencies: {
          imports: ['./database', './cache', 'lodash', '@org/shared-utils'],
          importedBy: [],
          callees: [],
          callers: [],
        },
      };

      const testCode = gen.generateTests(context);

      // Bug #295 fix: relative imports must NOT be mocked (they wipe out named exports)
      expect(testCode).not.toContain("vi.mock('./database'");
      expect(testCode).not.toContain("vi.mock('./cache'");
      // External deps should still be mocked
      expect(testCode).toContain("vi.mock('lodash'");
      expect(testCode).toContain("vi.mock('@org/shared-utils'");
    });
  });
});
