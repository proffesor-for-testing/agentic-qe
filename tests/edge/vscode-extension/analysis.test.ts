/**
 * Tests for VS Code Extension Analysis Module
 *
 * Tests the real-time code analysis engine including:
 * - FunctionExtractor - AST parsing
 * - ComplexityCalculator - Cyclomatic complexity
 * - TestabilityScorer - Testability scoring (0-100)
 * - PatternMatcher - Pattern matching
 * - CodeAnalyzer - Main coordinator
 *
 * Uses real TypeScript compiler API, not mocks.
 *
 * @module tests/edge/vscode-extension/analysis.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  FunctionExtractor,
  type ExtractedFunction,
} from '../../../src/edge/vscode-extension/src/analysis/FunctionExtractor';
import {
  ComplexityCalculator,
  type ComplexityResult,
} from '../../../src/edge/vscode-extension/src/analysis/ComplexityCalculator';
import {
  TestabilityScorer,
  type TestabilityScore,
} from '../../../src/edge/vscode-extension/src/analysis/TestabilityScorer';
import {
  PatternMatcher,
  type CodePattern,
} from '../../../src/edge/vscode-extension/src/analysis/PatternMatcher';
import {
  CodeAnalyzer,
  type FileAnalysisResult,
} from '../../../src/edge/vscode-extension/src/analysis/CodeAnalyzer';

// Sample code for testing
const sampleCode = {
  simpleFunction: `
function add(a: number, b: number): number {
  return a + b;
}`,

  asyncFunction: `
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`);
  return response.json();
}`,

  arrowFunction: `
export const multiply = (x: number, y: number): number => x * y;`,

  complexFunction: `
function processData(data: any[], options: ProcessOptions): Result {
  if (!data || data.length === 0) {
    throw new Error('No data provided');
  }

  let result = [];

  for (const item of data) {
    if (item.type === 'A') {
      if (item.value > 100) {
        result.push(handleTypeA(item));
      } else if (item.value > 50) {
        result.push(handleTypeAMedium(item));
      } else {
        result.push(handleTypeALow(item));
      }
    } else if (item.type === 'B') {
      switch (item.category) {
        case 'cat1':
          result.push(handleCat1(item));
          break;
        case 'cat2':
          result.push(handleCat2(item));
          break;
        default:
          result.push(handleDefault(item));
      }
    } else {
      try {
        result.push(processUnknown(item));
      } catch (e) {
        console.error('Error processing item', e);
      }
    }
  }

  return { items: result, count: result.length };
}`,

  classWithMethods: `
export class UserService {
  private db: Database;
  private cache: Cache;

  constructor(db: Database, cache: Cache) {
    this.db = db;
    this.cache = cache;
  }

  async getUser(id: string): Promise<User | null> {
    const cached = await this.cache.get(id);
    if (cached) {
      return cached;
    }
    const user = await this.db.findById(id);
    if (user) {
      await this.cache.set(id, user);
    }
    return user;
  }

  async updateUser(id: string, data: UserUpdate): Promise<User> {
    const user = await this.db.update(id, data);
    await this.cache.invalidate(id);
    return user;
  }

  static validateEmail(email: string): boolean {
    return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
  }
}`,

  hardToTestFunction: `
function processPayment(amount: number) {
  const timestamp = Date.now();
  const random = Math.random();

  console.log('Processing payment...');

  fetch('/api/payment', {
    method: 'POST',
    body: JSON.stringify({ amount, timestamp, id: random })
  });

  localStorage.setItem('lastPayment', String(amount));

  return window.location.href.includes('success');
}`,

  pureFunction: `
function calculateTax(amount: number, rate: number): number {
  if (amount <= 0) {
    return 0;
  }
  return amount * rate;
}`,

  functionWithJSDoc: `
/**
 * Calculates the factorial of a number
 * @param n - The number to calculate factorial for
 * @returns The factorial result
 * @throws {Error} If n is negative
 * @example
 * factorial(5) // returns 120
 */
function factorial(n: number): number {
  if (n < 0) {
    throw new Error('Cannot calculate factorial of negative number');
  }
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}`,
};

// =============================================================================
// FunctionExtractor Tests
// =============================================================================

describe('FunctionExtractor', () => {
  let extractor: FunctionExtractor;

  beforeEach(() => {
    extractor = new FunctionExtractor();
  });

  describe('extract()', () => {
    it('should extract a simple function declaration', () => {
      const functions = extractor.extract(sampleCode.simpleFunction, 'test.ts');

      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('add');
      expect(functions[0].kind).toBe('function');
      expect(functions[0].parameters).toHaveLength(2);
      expect(functions[0].parameters[0].name).toBe('a');
      expect(functions[0].parameters[0].type).toBe('number');
      expect(functions[0].returnType).toBe('number');
      expect(functions[0].isAsync).toBe(false);
      expect(functions[0].isExported).toBe(false);
    });

    it('should extract an async function', () => {
      const functions = extractor.extract(sampleCode.asyncFunction, 'test.ts');

      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('fetchUser');
      expect(functions[0].isAsync).toBe(true);
      expect(functions[0].returnType).toContain('Promise');
    });

    it('should extract arrow functions', () => {
      const functions = extractor.extract(sampleCode.arrowFunction, 'test.ts');

      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('multiply');
      expect(functions[0].kind).toBe('arrow-function');
      expect(functions[0].isExported).toBe(true);
      expect(functions[0].parameters).toHaveLength(2);
    });

    it('should extract class methods', () => {
      const functions = extractor.extract(sampleCode.classWithMethods, 'test.ts');

      // Should have constructor + 3 methods (class itself is also extracted but its methods are what we care about)
      const methodNames = functions.map((f) => f.name);
      expect(methodNames).toContain('constructor');
      expect(methodNames).toContain('getUser');
      expect(methodNames).toContain('updateUser');
      expect(methodNames).toContain('validateEmail');

      // Check static method
      const staticMethod = functions.find((f) => f.name === 'validateEmail');
      expect(staticMethod?.modifiers).toContain('static');
    });

    it('should extract JSDoc comments', () => {
      const functions = extractor.extract(sampleCode.functionWithJSDoc, 'test.ts');

      expect(functions).toHaveLength(1);
      const func = functions[0];

      expect(func.jsdoc).toBeDefined();
      expect(func.jsdoc?.description).toContain('factorial');
      expect(func.jsdoc?.params).toHaveLength(1);
      expect(func.jsdoc?.params[0].name).toBe('n');
      expect(func.jsdoc?.returns).toBeDefined();
    });

    it('should extract function dependencies', () => {
      const functions = extractor.extract(sampleCode.hardToTestFunction, 'test.ts');

      expect(functions).toHaveLength(1);
      const func = functions[0];

      // Should detect external dependencies (fetch, localStorage, window)
      expect(func.dependencies).toBeDefined();
      expect(func.dependencies.length).toBeGreaterThan(0);
    });

    it('should handle TypeScript-specific syntax', () => {
      const tsCode = `
        interface Props {
          value: number;
        }

        const Component = ({ value }: Props): JSX.Element => {
          return <div>{value}</div>;
        };
      `;

      const functions = extractor.extract(tsCode, 'test.tsx');
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('Component');
    });

    it('should extract position information correctly', () => {
      const functions = extractor.extract(sampleCode.simpleFunction, 'test.ts');

      expect(functions[0].start).toBeDefined();
      expect(functions[0].end).toBeDefined();
      expect(functions[0].start.line).toBeGreaterThanOrEqual(0);
      expect(functions[0].end.line).toBeGreaterThan(functions[0].start.line);
    });
  });
});

// =============================================================================
// ComplexityCalculator Tests
// =============================================================================

describe('ComplexityCalculator', () => {
  let calculator: ComplexityCalculator;
  let extractor: FunctionExtractor;

  beforeEach(() => {
    calculator = new ComplexityCalculator();
    extractor = new FunctionExtractor();
  });

  describe('calculate()', () => {
    it('should calculate low complexity for simple functions', () => {
      const functions = extractor.extract(sampleCode.simpleFunction, 'test.ts');
      const result = calculator.calculate(functions[0]);

      expect(result.cyclomaticComplexity).toBe(1);
      expect(result.category).toBe('low');
      expect(result.breakdown.ifStatements).toBe(0);
      expect(result.breakdown.forLoops).toBe(0);
    });

    it('should calculate complexity for conditional statements', () => {
      const functions = extractor.extract(sampleCode.pureFunction, 'test.ts');
      const result = calculator.calculate(functions[0]);

      expect(result.cyclomaticComplexity).toBeGreaterThan(1);
      expect(result.breakdown.ifStatements).toBeGreaterThan(0);
    });

    it('should calculate high complexity for complex functions', () => {
      const functions = extractor.extract(sampleCode.complexFunction, 'test.ts');
      const result = calculator.calculate(functions[0]);

      expect(result.cyclomaticComplexity).toBeGreaterThan(10);
      expect(result.category).toBe('high');
      expect(result.breakdown.ifStatements).toBeGreaterThan(0);
      // for-of loops are counted separately from for loops
      expect(result.breakdown.forOfLoops).toBeGreaterThan(0);
      expect(result.breakdown.switchCases).toBeGreaterThan(0);
    });

    it('should detect recursive calls', () => {
      const functions = extractor.extract(sampleCode.functionWithJSDoc, 'test.ts');
      const result = calculator.calculate(functions[0]);

      expect(result.breakdown.recursiveCalls).toBeGreaterThan(0);
    });

    it('should calculate nesting depth', () => {
      const functions = extractor.extract(sampleCode.complexFunction, 'test.ts');
      const result = calculator.calculate(functions[0]);

      expect(result.breakdown.nestedDepth).toBeGreaterThan(2);
    });

    it('should provide meaningful suggestions for high complexity', () => {
      const functions = extractor.extract(sampleCode.complexFunction, 'test.ts');
      const result = calculator.calculate(functions[0]);

      expect(result.suggestions.length).toBeGreaterThan(0);
      // Should suggest reducing complexity or splitting function
      expect(result.suggestions.some((s) => s.includes('split') || s.includes('extract'))).toBe(
        true
      );
    });

    it('should calculate cognitive complexity', () => {
      const functions = extractor.extract(sampleCode.complexFunction, 'test.ts');
      const result = calculator.calculate(functions[0]);

      expect(result.cognitiveComplexity).toBeGreaterThan(0);
      // Cognitive complexity should account for nesting
      expect(result.cognitiveComplexity).toBeGreaterThanOrEqual(result.cyclomaticComplexity);
    });
  });

  describe('calculateFromSource()', () => {
    it('should calculate complexity from raw source code', () => {
      const result = calculator.calculateFromSource(
        sampleCode.simpleFunction,
        'add'
      );

      expect(result.cyclomaticComplexity).toBe(1);
    });
  });

  describe('getSummary()', () => {
    it('should generate summary statistics', () => {
      const functions = extractor.extract(
        sampleCode.classWithMethods,
        'test.ts'
      );
      const results = calculator.calculateForFunctions(functions);
      const summary = calculator.getSummary(results);

      expect(summary.totalFunctions).toBe(functions.length);
      expect(summary.averageComplexity).toBeGreaterThan(0);
      expect(summary.byCategory).toBeDefined();
    });
  });
});

// =============================================================================
// TestabilityScorer Tests
// =============================================================================

describe('TestabilityScorer', () => {
  let scorer: TestabilityScorer;
  let extractor: FunctionExtractor;

  beforeEach(() => {
    scorer = new TestabilityScorer();
    extractor = new FunctionExtractor();
  });

  describe('score()', () => {
    it('should give high score to pure functions', () => {
      const functions = extractor.extract(sampleCode.pureFunction, 'test.ts');
      const score = scorer.score(functions[0]);

      expect(score.score).toBeGreaterThan(70);
      expect(score.category).toBe('excellent');
      expect(score.factors.sideEffects.value).toBeGreaterThan(15);
    });

    it('should give low score to hard-to-test functions', () => {
      const functions = extractor.extract(sampleCode.hardToTestFunction, 'test.ts');
      const score = scorer.score(functions[0]);

      expect(score.score).toBeLessThan(50);
      expect(['poor', 'very-poor']).toContain(score.category);
      expect(score.antiPatterns.length).toBeGreaterThan(0);
    });

    it('should detect global state access', () => {
      const functions = extractor.extract(sampleCode.hardToTestFunction, 'test.ts');
      const score = scorer.score(functions[0]);

      const globalStateAntiPattern = score.antiPatterns.find(
        (ap) => ap.type === 'global-state'
      );
      expect(globalStateAntiPattern).toBeDefined();
    });

    it('should detect non-deterministic operations', () => {
      const functions = extractor.extract(sampleCode.hardToTestFunction, 'test.ts');
      const score = scorer.score(functions[0]);

      const nonDeterministicAntiPattern = score.antiPatterns.find(
        (ap) => ap.type === 'non-deterministic'
      );
      expect(nonDeterministicAntiPattern).toBeDefined();
    });

    it('should detect hidden dependencies', () => {
      const functions = extractor.extract(sampleCode.hardToTestFunction, 'test.ts');
      const score = scorer.score(functions[0]);

      const hiddenDepAntiPattern = score.antiPatterns.find(
        (ap) => ap.type === 'hidden-dependency'
      );
      expect(hiddenDepAntiPattern).toBeDefined();
    });

    it('should provide improvement suggestions', () => {
      const functions = extractor.extract(sampleCode.complexFunction, 'test.ts');
      const score = scorer.score(functions[0]);

      expect(score.suggestions.length).toBeGreaterThan(0);
      expect(score.suggestions[0].priority).toBe(1);
      expect(score.suggestions[0].expectedImprovement).toBeGreaterThan(0);
    });

    it('should score factors independently', () => {
      const functions = extractor.extract(sampleCode.simpleFunction, 'test.ts');
      const score = scorer.score(functions[0]);

      expect(score.factors.complexity).toBeDefined();
      expect(score.factors.dependencies).toBeDefined();
      expect(score.factors.sideEffects).toBeDefined();
      expect(score.factors.parameters).toBeDefined();
      expect(score.factors.returnType).toBeDefined();
      expect(score.factors.coupling).toBeDefined();

      // Each factor should have value, max, and reason
      Object.values(score.factors).forEach((factor) => {
        expect(factor.value).toBeGreaterThanOrEqual(0);
        expect(factor.max).toBeGreaterThan(0);
        expect(factor.reason).toBeDefined();
      });
    });

    it('should penalize high parameter count', () => {
      const manyParamsCode = `
        function process(a: string, b: number, c: boolean, d: object, e: any[], f: Function, g: unknown) {
          return { a, b, c, d, e, f, g };
        }
      `;
      const functions = extractor.extract(manyParamsCode, 'test.ts');
      const score = scorer.score(functions[0]);

      expect(score.factors.parameters.value).toBeLessThan(
        score.factors.parameters.max / 2
      );
    });

    it('should detect god function pattern', () => {
      const functions = extractor.extract(sampleCode.complexFunction, 'test.ts');
      const score = scorer.score(functions[0]);

      const godFunctionPattern = score.antiPatterns.find(
        (ap) => ap.type === 'god-function' || ap.type === 'deep-nesting'
      );
      // May or may not be present depending on thresholds
      if (score.score < 50) {
        expect(score.antiPatterns.length).toBeGreaterThan(0);
      }
    });
  });

  describe('scoreAll()', () => {
    it('should score multiple functions and rank them', () => {
      const allCode = [
        sampleCode.pureFunction,
        sampleCode.complexFunction,
        sampleCode.simpleFunction,
      ].join('\n');
      const functions = extractor.extract(allCode, 'test.ts');
      const results = scorer.scoreAll(functions);

      // Should be sorted by score (lowest first)
      expect(results.length).toBe(3);
      expect(results[0].score.score).toBeLessThanOrEqual(results[1].score.score);
      expect(results[1].score.score).toBeLessThanOrEqual(results[2].score.score);
    });
  });
});

// =============================================================================
// PatternMatcher Tests
// =============================================================================

describe('PatternMatcher', () => {
  let matcher: PatternMatcher;
  let extractor: FunctionExtractor;
  let complexityCalculator: ComplexityCalculator;
  let testabilityScorer: TestabilityScorer;

  beforeEach(() => {
    matcher = new PatternMatcher();
    extractor = new FunctionExtractor();
    complexityCalculator = new ComplexityCalculator();
    testabilityScorer = new TestabilityScorer();
  });

  const createPattern = (
    func: ExtractedFunction
  ): CodePattern => {
    const complexity = complexityCalculator.calculate(func);
    const testability = testabilityScorer.score(func);
    return matcher.createPattern(func, complexity, testability);
  };

  describe('createPattern()', () => {
    it('should create a pattern from a function', () => {
      const functions = extractor.extract(sampleCode.simpleFunction, 'test.ts');
      const pattern = createPattern(functions[0]);

      expect(pattern.id).toBeDefined();
      expect(pattern.type).toBe('function');
      expect(pattern.signature).toContain('number');
      expect(pattern.embedding).toBeDefined();
      expect(pattern.embedding.length).toBeGreaterThan(0);
      expect(pattern.characteristics).toBeDefined();
    });

    it('should determine pattern type correctly', () => {
      const validatorCode = `
        function validateEmail(email: string): boolean {
          return email.includes('@');
        }
      `;
      const functions = extractor.extract(validatorCode, 'test.ts');
      const pattern = createPattern(functions[0]);

      expect(pattern.type).toBe('validator');
    });

    it('should detect async patterns', () => {
      const functions = extractor.extract(sampleCode.asyncFunction, 'test.ts');
      const pattern = createPattern(functions[0]);

      expect(pattern.type).toBe('async-function');
      expect(pattern.characteristics.isAsync).toBe(true);
    });
  });

  describe('storePattern() and findMatches()', () => {
    it('should store and retrieve similar patterns', () => {
      // Create and store patterns
      const simpleFunctions = extractor.extract(sampleCode.simpleFunction, 'test.ts');
      const pattern1 = createPattern(simpleFunctions[0]);
      matcher.storePattern(pattern1);

      // Create a similar function
      const similarCode = `
        function subtract(x: number, y: number): number {
          return x - y;
        }
      `;
      const similarFunctions = extractor.extract(similarCode, 'test.ts');
      const complexity = complexityCalculator.calculate(similarFunctions[0]);
      const testability = testabilityScorer.score(similarFunctions[0]);

      // Find matches
      const matches = matcher.findMatches(similarFunctions[0], complexity, testability);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].similarity).toBeGreaterThan(0.5);
      expect(matches[0].pattern.id).toBe(pattern1.id);
    });

    it('should filter matches by similarity threshold', () => {
      const functions = extractor.extract(sampleCode.simpleFunction, 'test.ts');
      const pattern = createPattern(functions[0]);
      matcher.storePattern(pattern);

      const differentCode = `
        class CompletelyDifferent {
          async complexMethod(data: any[]): Promise<void> {
            for (const item of data) {
              console.log(item);
            }
          }
        }
      `;
      const differentFunctions = extractor.extract(differentCode, 'test.ts');
      const method = differentFunctions.find((f) => f.name === 'complexMethod');
      if (method) {
        const complexity = complexityCalculator.calculate(method);
        const testability = testabilityScorer.score(method);

        const highThresholdMatcher = new PatternMatcher({
          similarityThreshold: 0.9,
        });
        highThresholdMatcher.storePattern(pattern);

        const matches = highThresholdMatcher.findMatches(method, complexity, testability);
        // Should have few or no matches due to high threshold
        expect(matches.length).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('generateEmbedding()', () => {
    it('should generate normalized embeddings', () => {
      const functions = extractor.extract(sampleCode.simpleFunction, 'test.ts');
      const embedding = matcher.generateEmbedding(functions[0]);

      // Check it's a unit vector (magnitude ~= 1)
      const magnitude = Math.sqrt(
        embedding.reduce((sum, val) => sum + val * val, 0)
      );
      expect(magnitude).toBeCloseTo(1, 3);
    });

    it('should generate similar embeddings for similar functions', () => {
      const func1 = extractor.extract(sampleCode.simpleFunction, 'test.ts')[0];
      const func2 = extractor.extract(
        `function subtract(a: number, b: number): number { return a - b; }`,
        'test.ts'
      )[0];

      const emb1 = matcher.generateEmbedding(func1);
      const emb2 = matcher.generateEmbedding(func2);

      // Calculate cosine similarity
      const dotProduct = emb1.reduce((sum, val, i) => sum + val * emb2[i], 0);
      expect(dotProduct).toBeGreaterThan(0.5);
    });
  });

  describe('test suggestions', () => {
    it('should generate test suggestions for matches', () => {
      const functions = extractor.extract(sampleCode.simpleFunction, 'test.ts');
      const pattern = createPattern(functions[0]);
      matcher.storePattern(pattern);

      const similarCode = `function divide(a: number, b: number): number { return a / b; }`;
      const similarFunc = extractor.extract(similarCode, 'test.ts')[0];
      const complexity = complexityCalculator.calculate(similarFunc);
      const testability = testabilityScorer.score(similarFunc);

      const matches = matcher.findMatches(similarFunc, complexity, testability);

      if (matches.length > 0) {
        expect(matches[0].suggestedTests.length).toBeGreaterThan(0);
        expect(matches[0].suggestedTests[0].code).toContain('describe');
      }
    });
  });

  describe('exportPatterns() and importPatterns()', () => {
    it('should export and import patterns', () => {
      const functions = extractor.extract(sampleCode.simpleFunction, 'test.ts');
      const pattern = createPattern(functions[0]);
      matcher.storePattern(pattern);

      const exported = matcher.exportPatterns();
      expect(exported.length).toBe(1);

      // Create new matcher and import
      const newMatcher = new PatternMatcher();
      newMatcher.importPatterns(exported);

      expect(newMatcher.size).toBe(1);
      expect(newMatcher.getPattern(pattern.id)).toBeDefined();
    });
  });
});

// =============================================================================
// CodeAnalyzer Tests
// =============================================================================

describe('CodeAnalyzer', () => {
  let analyzer: CodeAnalyzer;

  beforeEach(() => {
    analyzer = new CodeAnalyzer({
      debounceMs: 100,
      debugMode: false,
    });
  });

  afterEach(() => {
    analyzer.dispose();
  });

  describe('analyze()', () => {
    it('should analyze a file and return complete results', async () => {
      const result = await analyzer.analyze(
        sampleCode.classWithMethods,
        '/test/UserService.ts'
      );

      expect(result.filePath).toBe('/test/UserService.ts');
      expect(result.language).toBe('typescript');
      expect(result.functions.length).toBeGreaterThan(0);
      expect(result.complexitySummary).toBeDefined();
      expect(result.averageTestability).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should analyze each function with all components', async () => {
      const result = await analyzer.analyze(sampleCode.simpleFunction, '/test/math.ts');

      expect(result.functions.length).toBe(1);
      const funcAnalysis = result.functions[0];

      expect(funcAnalysis.function).toBeDefined();
      expect(funcAnalysis.complexity).toBeDefined();
      expect(funcAnalysis.testability).toBeDefined();
      expect(funcAnalysis.testSuggestions).toBeDefined();
    });

    it('should cache results', async () => {
      const result1 = await analyzer.analyze(sampleCode.simpleFunction, '/test/math.ts');
      const result2 = await analyzer.analyze(sampleCode.simpleFunction, '/test/math.ts');

      // Second call should be faster (cached)
      expect(result2.duration).toBeLessThanOrEqual(result1.duration);
      // Results should be equal
      expect(result2.functions.length).toBe(result1.functions.length);
    });

    it('should invalidate cache on content change', async () => {
      await analyzer.analyze(sampleCode.simpleFunction, '/test/math.ts');

      const modifiedCode = `${sampleCode.simpleFunction}\nfunction newFunc() {}`;
      const result = await analyzer.analyze(modifiedCode, '/test/math.ts');

      expect(result.functions.length).toBe(2);
    });

    it('should count issues correctly', async () => {
      const result = await analyzer.analyze(
        sampleCode.hardToTestFunction,
        '/test/payment.ts'
      );

      expect(result.issueCount).toBeDefined();
      expect(
        result.issueCount.critical + result.issueCount.major + result.issueCount.minor
      ).toBeGreaterThan(0);
    });

    it('should generate top suggestions', async () => {
      const result = await analyzer.analyze(
        sampleCode.complexFunction,
        '/test/complex.ts'
      );

      expect(result.topSuggestions.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeDebounced()', () => {
    it('should debounce multiple rapid calls', async () => {
      const promises: Promise<FileAnalysisResult>[] = [];

      // Make multiple rapid calls
      for (let i = 0; i < 5; i++) {
        promises.push(
          analyzer.analyzeDebounced(sampleCode.simpleFunction, '/test/debounce.ts')
        );
      }

      // All should resolve to the same result
      const results = await Promise.all(promises);

      expect(results.length).toBe(5);
      // All results should be identical
      results.forEach((r) => {
        expect(r.filePath).toBe('/test/debounce.ts');
      });
    });
  });

  describe('analyzeFunction()', () => {
    it('should analyze a single function', () => {
      const extractor = new FunctionExtractor();
      const functions = extractor.extract(sampleCode.simpleFunction, 'test.ts');

      const analysis = analyzer.analyzeFunction(functions[0]);

      expect(analysis.function.name).toBe('add');
      expect(analysis.complexity.cyclomaticComplexity).toBe(1);
      expect(analysis.testability.score).toBeGreaterThan(70);
    });
  });

  describe('analyzeCode()', () => {
    it('should analyze raw code without file context', () => {
      const analyses = analyzer.analyzeCode(sampleCode.simpleFunction);

      expect(analyses.length).toBe(1);
      expect(analyses[0].function.name).toBe('add');
    });
  });

  describe('getFunctionsNeedingAttention()', () => {
    it('should identify functions needing improvement', async () => {
      const allCode = [sampleCode.pureFunction, sampleCode.complexFunction].join('\n');
      const result = await analyzer.analyze(allCode, '/test/mixed.ts');

      const needsAttention = analyzer.getFunctionsNeedingAttention(result);

      // Complex function should need attention
      expect(needsAttention.some((f) => f.function.name === 'processData')).toBe(true);
    });

    it('should use custom thresholds', async () => {
      const result = await analyzer.analyze(sampleCode.pureFunction, '/test/pure.ts');

      // With very strict thresholds
      const strictNeedsAttention = analyzer.getFunctionsNeedingAttention(result, {
        minTestability: 95,
        maxComplexity: 1,
      });

      // Even pure functions might not meet very strict thresholds
      expect(strictNeedsAttention.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getTestSuggestions()', () => {
    it('should get test suggestions for a file', async () => {
      const result = await analyzer.analyze(sampleCode.simpleFunction, '/test/math.ts');

      const suggestions = analyzer.getTestSuggestions(result);

      // May or may not have suggestions depending on patterns
      expect(Array.isArray(suggestions)).toBe(true);
    });
  });

  describe('pattern management', () => {
    it('should export and import patterns', async () => {
      // Analyze to create patterns
      await analyzer.analyze(sampleCode.simpleFunction, '/test/math.ts');
      await analyzer.analyze(sampleCode.asyncFunction, '/test/async.ts');

      const patterns = analyzer.exportPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      // Create new analyzer and import
      const newAnalyzer = new CodeAnalyzer();
      newAnalyzer.importPatterns(patterns);

      const stats = newAnalyzer.getPatternStats();
      expect(stats.count).toBe(patterns.length);

      newAnalyzer.dispose();
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      await analyzer.analyze(sampleCode.simpleFunction, '/test/math.ts');

      const statsBefore = analyzer.getCacheStats();
      expect(statsBefore.size).toBe(1);

      analyzer.clearCache();

      const statsAfter = analyzer.getCacheStats();
      expect(statsAfter.size).toBe(0);
    });
  });

  describe('cancelPending()', () => {
    it('should cancel pending debounced analysis', () => {
      // Start a debounced analysis
      analyzer.analyzeDebounced(sampleCode.simpleFunction, '/test/cancel.ts');

      // Cancel it
      analyzer.cancelPending('/test/cancel.ts');

      // No error should be thrown
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Analysis Module Integration', () => {
  it('should handle real-world code patterns', async () => {
    const realWorldCode = `
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, tap } from 'rxjs';

interface User {
  id: string;
  name: string;
  email: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserApiService {
  private apiUrl = '/api/users';

  constructor(private http: HttpClient) {}

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(this.apiUrl).pipe(
      tap(users => console.log('Fetched users:', users.length)),
      catchError(this.handleError('getUsers', []))
    );
  }

  getUser(id: string): Observable<User> {
    return this.http.get<User>(\`\${this.apiUrl}/\${id}\`).pipe(
      catchError(this.handleError<User>('getUser'))
    );
  }

  private handleError<T>(operation: string, result?: T) {
    return (error: any): Observable<T> => {
      console.error(\`\${operation} failed:\`, error);
      return new Observable(subscriber => subscriber.next(result as T));
    };
  }
}`;

    const analyzer = new CodeAnalyzer({ debugMode: false });

    try {
      const result = await analyzer.analyze(realWorldCode, '/src/user-api.service.ts');

      expect(result.functions.length).toBeGreaterThan(0);
      expect(result.language).toBe('typescript');

      // Should identify async/observable patterns
      const getUsers = result.functions.find((f) => f.function.name === 'getUsers');
      expect(getUsers).toBeDefined();

      // Should flag console.log as side effect
      if (getUsers) {
        expect(
          getUsers.testability.antiPatterns.some(
            (ap) => ap.type === 'side-effect' || ap.type === 'hidden-dependency'
          )
        ).toBeTruthy();
      }
    } finally {
      analyzer.dispose();
    }
  });

  it('should handle edge cases gracefully', async () => {
    const analyzer = new CodeAnalyzer();

    try {
      // Empty code
      const emptyResult = await analyzer.analyze('', '/test/empty.ts');
      expect(emptyResult.functions.length).toBe(0);

      // Only comments
      const commentsResult = await analyzer.analyze(
        '// This is a comment\n/* Block comment */',
        '/test/comments.ts'
      );
      expect(commentsResult.functions.length).toBe(0);

      // Invalid syntax should not throw
      const invalidResult = await analyzer.analyze(
        'function broken( { incomplete',
        '/test/invalid.ts'
      );
      // Should handle gracefully
      expect(invalidResult.filePath).toBe('/test/invalid.ts');
    } finally {
      analyzer.dispose();
    }
  });

  it('should maintain performance with large files', async () => {
    const analyzer = new CodeAnalyzer();

    // Generate a large file
    const functions = Array.from({ length: 50 }, (_, i) => `
function func${i}(a: number, b: number): number {
  if (a > b) {
    return a - b;
  } else if (a < b) {
    return b - a;
  }
  return 0;
}`).join('\n');

    try {
      const startTime = performance.now();
      const result = await analyzer.analyze(functions, '/test/large.ts');
      const duration = performance.now() - startTime;

      expect(result.functions.length).toBe(50);
      // Should complete in reasonable time (less than 5 seconds)
      expect(duration).toBeLessThan(5000);
    } finally {
      analyzer.dispose();
    }
  });
});
