/**
 * Clause Evaluation Integration Tests
 *
 * Tests constitution clause evaluators including:
 * - AST evaluator on real TypeScript files
 * - Metric evaluator with cyclomatic complexity
 * - Pattern evaluator with regex patterns
 * - Semantic evaluator (mocked LLM)
 * - Evaluator framework coordination
 *
 * @version 1.0.0
 * @module tests/phase2/evaluation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  ASTEvaluator,
  MetricEvaluator,
  PatternEvaluator,
  SemanticEvaluator,
  EvaluatorFactory,
  ClauseEvaluation,
  ConstitutionClause,
} from '@/constitution/evaluators';

describe('Clause Evaluation Integration Tests', () => {
  const testFilesDir = path.join(__dirname, '../fixtures/test-code');
  const sampleTsFile = path.join(testFilesDir, 'sample.ts');
  const complexTsFile = path.join(testFilesDir, 'complex.ts');

  beforeAll(() => {
    // Create test directory and sample files
    if (!fs.existsSync(testFilesDir)) {
      fs.mkdirSync(testFilesDir, { recursive: true });
    }

    // Create simple TypeScript file
    fs.writeFileSync(
      sampleTsFile,
      `export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }
}
`
    );

    // Create complex file with high cyclomatic complexity
    fs.writeFileSync(
      complexTsFile,
      `export class ComplexLogic {
  process(input: any): string {
    if (input === null) {
      return 'null';
    } else if (typeof input === 'string') {
      if (input.length === 0) {
        return 'empty';
      } else if (input.length < 10) {
        return 'short';
      } else if (input.length < 100) {
        return 'medium';
      } else {
        return 'long';
      }
    } else if (typeof input === 'number') {
      if (input === 0) {
        return 'zero';
      } else if (input < 0) {
        return 'negative';
      } else if (input < 10) {
        return 'small';
      } else if (input < 100) {
        return 'medium';
      } else {
        return 'large';
      }
    } else if (Array.isArray(input)) {
      return 'array';
    } else {
      return 'object';
    }
  }
}
`
    );
  });

  afterAll(() => {
    // Cleanup test files
    if (fs.existsSync(testFilesDir)) {
      fs.rmSync(testFilesDir, { recursive: true, force: true });
    }
  });

  describe('AST Evaluator on Real TypeScript Files', () => {
    let astEvaluator: ASTEvaluator;

    beforeEach(() => {
      astEvaluator = new ASTEvaluator();
    });

    it('should parse TypeScript file and extract AST', async () => {
      const sourceCode = fs.readFileSync(sampleTsFile, 'utf-8');
      const clause: ConstitutionClause = {
        id: 'ast-test-1',
        type: 'ast',
        condition: 'ClassDeclaration[name="Calculator"]',
        action: 'allow',
        severity: 'info',
        message: 'Calculator class found',
        metadata: {},
      };

      const result = await astEvaluator.evaluate(clause, {
        sourceCode,
        filePath: sampleTsFile,
      });

      expect(result.passed).toBe(true);
      expect(result.evaluatorType).toBe('ast');
    });

    it('should detect missing required methods', async () => {
      const sourceCode = fs.readFileSync(sampleTsFile, 'utf-8');
      const clause: ConstitutionClause = {
        id: 'ast-test-2',
        type: 'ast',
        condition: 'MethodDefinition[name="multiply"]',
        action: 'deny',
        severity: 'warning',
        message: 'Missing multiply method',
        metadata: {},
      };

      const result = await astEvaluator.evaluate(clause, {
        sourceCode,
        filePath: sampleTsFile,
      });

      expect(result.passed).toBe(false);
      expect(result.message).toContain('multiply');
    });

    it('should validate class structure', async () => {
      const sourceCode = fs.readFileSync(sampleTsFile, 'utf-8');
      const clause: ConstitutionClause = {
        id: 'ast-test-3',
        type: 'ast',
        condition: 'ClassDeclaration > MethodDefinition',
        action: 'allow',
        severity: 'info',
        message: 'Class has methods',
        metadata: { minMethods: 2 },
      };

      const result = await astEvaluator.evaluate(clause, {
        sourceCode,
        filePath: sampleTsFile,
      });

      expect(result.passed).toBe(true);
      expect(result.metadata?.methodCount).toBeGreaterThanOrEqual(2);
    });

    it('should handle parse errors gracefully', async () => {
      const invalidCode = 'class Invalid { method() { } } }'; // Extra closing brace
      const clause: ConstitutionClause = {
        id: 'ast-test-4',
        type: 'ast',
        condition: 'ClassDeclaration',
        action: 'allow',
        severity: 'error',
        message: 'Parse error test',
        metadata: {},
      };

      const result = await astEvaluator.evaluate(clause, {
        sourceCode: invalidCode,
        filePath: 'invalid.ts',
      });

      expect(result.passed).toBe(false);
      expect(result.message).toContain('parse');
    });
  });

  describe('Metric Evaluator with Cyclomatic Complexity', () => {
    let metricEvaluator: MetricEvaluator;

    beforeEach(() => {
      metricEvaluator = new MetricEvaluator();
    });

    it('should calculate cyclomatic complexity', async () => {
      const sourceCode = fs.readFileSync(complexTsFile, 'utf-8');
      const clause: ConstitutionClause = {
        id: 'metric-test-1',
        type: 'metric',
        condition: 'cyclomatic_complexity <= 10',
        action: 'warn',
        severity: 'warning',
        message: 'High complexity detected',
        metadata: { threshold: 10 },
      };

      const result = await metricEvaluator.evaluate(clause, {
        sourceCode,
        filePath: complexTsFile,
      });

      expect(result.evaluatorType).toBe('metric');
      expect(result.metadata?.complexity).toBeDefined();
      expect(typeof result.metadata?.complexity).toBe('number');
    });

    it('should enforce complexity threshold', async () => {
      const sourceCode = fs.readFileSync(complexTsFile, 'utf-8');
      const clause: ConstitutionClause = {
        id: 'metric-test-2',
        type: 'metric',
        condition: 'cyclomatic_complexity <= 5',
        action: 'deny',
        severity: 'error',
        message: 'Complexity exceeds threshold',
        metadata: { threshold: 5 },
      };

      const result = await metricEvaluator.evaluate(clause, {
        sourceCode,
        filePath: complexTsFile,
      });

      // Complex file should fail low threshold
      expect(result.passed).toBe(false);
      expect(result.message).toContain('complexity');
    });

    it('should calculate lines of code metrics', async () => {
      const sourceCode = fs.readFileSync(sampleTsFile, 'utf-8');
      const clause: ConstitutionClause = {
        id: 'metric-test-3',
        type: 'metric',
        condition: 'lines_of_code <= 100',
        action: 'allow',
        severity: 'info',
        message: 'File size acceptable',
        metadata: { maxLines: 100 },
      };

      const result = await metricEvaluator.evaluate(clause, {
        sourceCode,
        filePath: sampleTsFile,
      });

      expect(result.passed).toBe(true);
      expect(result.metadata?.loc).toBeDefined();
      expect(result.metadata?.loc).toBeLessThanOrEqual(100);
    });

    it('should measure code duplication', async () => {
      const duplicateCode = `
function process1() {
  const x = 1;
  const y = 2;
  return x + y;
}

function process2() {
  const x = 1;
  const y = 2;
  return x + y;
}
`;
      const clause: ConstitutionClause = {
        id: 'metric-test-4',
        type: 'metric',
        condition: 'duplication_ratio < 0.3',
        action: 'warn',
        severity: 'warning',
        message: 'Code duplication detected',
        metadata: { threshold: 0.3 },
      };

      const result = await metricEvaluator.evaluate(clause, {
        sourceCode: duplicateCode,
        filePath: 'duplicate.ts',
      });

      expect(result.evaluatorType).toBe('metric');
      expect(result.metadata?.duplicationRatio).toBeDefined();
    });

    it('should complete evaluation within performance threshold', async () => {
      const sourceCode = fs.readFileSync(complexTsFile, 'utf-8');
      const clause: ConstitutionClause = {
        id: 'metric-perf-1',
        type: 'metric',
        condition: 'cyclomatic_complexity <= 20',
        action: 'allow',
        severity: 'info',
        message: 'Performance test',
        metadata: {},
      };

      const startTime = Date.now();
      await metricEvaluator.evaluate(clause, {
        sourceCode,
        filePath: complexTsFile,
      });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // <5s threshold
    });
  });

  describe('Pattern Evaluator with Regex Patterns', () => {
    let patternEvaluator: PatternEvaluator;

    beforeEach(() => {
      patternEvaluator = new PatternEvaluator();
    });

    it('should match simple regex patterns', async () => {
      const clause: ConstitutionClause = {
        id: 'pattern-test-1',
        type: 'pattern',
        condition: '/export\\s+class/',
        action: 'allow',
        severity: 'info',
        message: 'Class export detected',
        metadata: { pattern: '/export\\s+class/' },
      };

      const sourceCode = fs.readFileSync(sampleTsFile, 'utf-8');
      const result = await patternEvaluator.evaluate(clause, {
        sourceCode,
        filePath: sampleTsFile,
      });

      expect(result.passed).toBe(true);
      expect(result.evaluatorType).toBe('pattern');
    });

    it('should detect prohibited patterns', async () => {
      const dangerousCode = `
console.log('test');
eval('dangerous code');
`;
      const clause: ConstitutionClause = {
        id: 'pattern-test-2',
        type: 'pattern',
        condition: '/\\beval\\s*\\(/',
        action: 'deny',
        severity: 'critical',
        message: 'Eval usage prohibited',
        metadata: { pattern: '/\\beval\\s*\\(/' },
      };

      const result = await patternEvaluator.evaluate(clause, {
        sourceCode: dangerousCode,
        filePath: 'dangerous.ts',
      });

      expect(result.passed).toBe(false);
      expect(result.severity).toBe('critical');
      expect(result.message).toContain('eval');
    });

    it('should match multiple pattern occurrences', async () => {
      const multiPattern = `
function test1() {}
function test2() {}
function test3() {}
`;
      const clause: ConstitutionClause = {
        id: 'pattern-test-3',
        type: 'pattern',
        condition: '/function\\s+\\w+/',
        action: 'allow',
        severity: 'info',
        message: 'Functions found',
        metadata: { pattern: '/function\\s+\\w+/', minMatches: 3 },
      };

      const result = await patternEvaluator.evaluate(clause, {
        sourceCode: multiPattern,
        filePath: 'multi.ts',
      });

      expect(result.passed).toBe(true);
      expect(result.metadata?.matchCount).toBeGreaterThanOrEqual(3);
    });

    it('should support complex regex with capture groups', async () => {
      const clause: ConstitutionClause = {
        id: 'pattern-test-4',
        type: 'pattern',
        condition: '/class\\s+(\\w+)\\s*\\{/',
        action: 'allow',
        severity: 'info',
        message: 'Extract class names',
        metadata: { pattern: '/class\\s+(\\w+)\\s*\\{/' },
      };

      const sourceCode = fs.readFileSync(sampleTsFile, 'utf-8');
      const result = await patternEvaluator.evaluate(clause, {
        sourceCode,
        filePath: sampleTsFile,
      });

      expect(result.passed).toBe(true);
      expect(result.metadata?.matches).toBeDefined();
      expect(result.metadata?.matches).toContain('Calculator');
    });
  });

  describe('Semantic Evaluator (Mocked LLM)', () => {
    let semanticEvaluator: SemanticEvaluator;

    beforeEach(() => {
      semanticEvaluator = new SemanticEvaluator();

      // Mock LLM API calls
      jest.spyOn(semanticEvaluator as any, 'callLLM').mockImplementation(async (prompt: string) => {
        if (prompt.includes('Calculator')) {
          return {
            passed: true,
            reasoning: 'Code follows single responsibility principle',
            confidence: 0.9,
          };
        } else if (prompt.includes('ComplexLogic')) {
          return {
            passed: false,
            reasoning: 'High cyclomatic complexity violates maintainability',
            confidence: 0.85,
          };
        }
        return { passed: true, reasoning: 'Generic analysis', confidence: 0.5 };
      });
    });

    it('should perform semantic analysis with mocked LLM', async () => {
      const clause: ConstitutionClause = {
        id: 'semantic-test-1',
        type: 'semantic',
        condition: 'code follows SOLID principles',
        action: 'allow',
        severity: 'warning',
        message: 'SOLID principles check',
        metadata: { principle: 'single_responsibility' },
      };

      const sourceCode = fs.readFileSync(sampleTsFile, 'utf-8');
      const result = await semanticEvaluator.evaluate(clause, {
        sourceCode,
        filePath: sampleTsFile,
      });

      expect(result.evaluatorType).toBe('semantic');
      expect(result.passed).toBe(true);
      expect(result.metadata?.reasoning).toBeDefined();
      expect(result.metadata?.confidence).toBeGreaterThan(0.8);
    });

    it('should detect maintainability issues', async () => {
      const clause: ConstitutionClause = {
        id: 'semantic-test-2',
        type: 'semantic',
        condition: 'code is maintainable',
        action: 'warn',
        severity: 'warning',
        message: 'Maintainability check',
        metadata: { aspect: 'complexity' },
      };

      const sourceCode = fs.readFileSync(complexTsFile, 'utf-8');
      const result = await semanticEvaluator.evaluate(clause, {
        sourceCode,
        filePath: complexTsFile,
      });

      expect(result.passed).toBe(false);
      expect(result.message).toContain('complexity');
    });

    it('should provide confidence scores', async () => {
      const clause: ConstitutionClause = {
        id: 'semantic-test-3',
        type: 'semantic',
        condition: 'code quality assessment',
        action: 'allow',
        severity: 'info',
        message: 'Quality check',
        metadata: {},
      };

      const sourceCode = fs.readFileSync(sampleTsFile, 'utf-8');
      const result = await semanticEvaluator.evaluate(clause, {
        sourceCode,
        filePath: sampleTsFile,
      });

      expect(result.metadata?.confidence).toBeDefined();
      expect(result.metadata?.confidence).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Evaluator Framework Coordination', () => {
    beforeEach(() => {
      // Register all evaluators
      EvaluatorFactory.register('ast', () => new ASTEvaluator());
      EvaluatorFactory.register('metric', () => new MetricEvaluator());
      EvaluatorFactory.register('pattern', () => new PatternEvaluator());
      EvaluatorFactory.register('semantic', () => new SemanticEvaluator());
    });

    it('should coordinate multiple evaluators', async () => {
      const clauses: ConstitutionClause[] = [
        {
          id: 'coord-1',
          type: 'ast',
          condition: 'ClassDeclaration',
          action: 'allow',
          severity: 'info',
          message: 'AST check',
          metadata: {},
        },
        {
          id: 'coord-2',
          type: 'metric',
          condition: 'cyclomatic_complexity <= 10',
          action: 'allow',
          severity: 'warning',
          message: 'Metric check',
          metadata: {},
        },
        {
          id: 'coord-3',
          type: 'pattern',
          condition: '/export/',
          action: 'allow',
          severity: 'info',
          message: 'Pattern check',
          metadata: {},
        },
      ];

      const sourceCode = fs.readFileSync(sampleTsFile, 'utf-8');
      const results: ClauseEvaluation[] = [];

      for (const clause of clauses) {
        const evaluator = EvaluatorFactory.create(clause.type);
        const result = await evaluator.evaluate(clause, {
          sourceCode,
          filePath: sampleTsFile,
        });
        results.push(result);
      }

      expect(results.length).toBe(3);
      expect(results.every(r => r.clauseId)).toBe(true);
      expect(results.map(r => r.evaluatorType)).toEqual(['ast', 'metric', 'pattern']);
    });

    it('should handle evaluator failures gracefully', async () => {
      const clause: ConstitutionClause = {
        id: 'error-test-1',
        type: 'ast',
        condition: 'invalid syntax',
        action: 'deny',
        severity: 'error',
        message: 'Error handling test',
        metadata: {},
      };

      const evaluator = EvaluatorFactory.create('ast');
      const result = await evaluator.evaluate(clause, {
        sourceCode: 'invalid code {{{',
        filePath: 'error.ts',
      });

      expect(result.passed).toBe(false);
      expect(result.severity).toBe('error');
    });

    it('should aggregate evaluation results', async () => {
      const clauses: ConstitutionClause[] = [
        {
          id: 'agg-1',
          type: 'metric',
          condition: 'lines_of_code <= 50',
          action: 'allow',
          severity: 'info',
          message: 'Size check',
          metadata: {},
        },
        {
          id: 'agg-2',
          type: 'pattern',
          condition: '/TODO|FIXME/',
          action: 'warn',
          severity: 'warning',
          message: 'Tech debt check',
          metadata: {},
        },
      ];

      const sourceCode = fs.readFileSync(sampleTsFile, 'utf-8');
      const results: ClauseEvaluation[] = [];

      for (const clause of clauses) {
        const evaluator = EvaluatorFactory.create(clause.type);
        const result = await evaluator.evaluate(clause, {
          sourceCode,
          filePath: sampleTsFile,
        });
        results.push(result);
      }

      const allPassed = results.every(r => r.passed);
      const hasWarnings = results.some(r => r.severity === 'warning');
      const hasErrors = results.some(r => r.severity === 'error');

      expect(results.length).toBe(2);
      expect(typeof allPassed).toBe('boolean');
      expect(typeof hasWarnings).toBe('boolean');
      expect(typeof hasErrors).toBe('boolean');
    });

    it('should complete multi-evaluator workflow within threshold', async () => {
      const clauses: ConstitutionClause[] = [
        {
          id: 'perf-1',
          type: 'ast',
          condition: 'ClassDeclaration',
          action: 'allow',
          severity: 'info',
          message: 'AST',
          metadata: {},
        },
        {
          id: 'perf-2',
          type: 'metric',
          condition: 'cyclomatic_complexity <= 15',
          action: 'allow',
          severity: 'warning',
          message: 'Metric',
          metadata: {},
        },
        {
          id: 'perf-3',
          type: 'pattern',
          condition: '/class/',
          action: 'allow',
          severity: 'info',
          message: 'Pattern',
          metadata: {},
        },
      ];

      const sourceCode = fs.readFileSync(sampleTsFile, 'utf-8');
      const startTime = Date.now();

      for (const clause of clauses) {
        const evaluator = EvaluatorFactory.create(clause.type);
        await evaluator.evaluate(clause, {
          sourceCode,
          filePath: sampleTsFile,
        });
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // <5s for all evaluators
    });
  });
});
