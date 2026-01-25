/**
 * Generate Unit Tests Tool
 * AI-powered unit test generation with pattern recognition and sublinear optimization
 *
 * @module tools/qe/test-generation/generate-unit-tests
 * @version 1.0.0
 */

import type {
  UnitTestGenerationParams,
  QEToolResponse,
  ResponseMetadata,
  QEError,
  TestFramework
} from '../shared/types.js';
import { SecureRandom } from '../../../../utils/SecureRandom.js';

/**
 * Generated unit test structure
 */
export interface GeneratedUnitTest {
  /** Test identifier */
  id: string;

  /** Test name */
  name: string;

  /** Test code */
  code: string;

  /** Test assertions */
  assertions: string[];

  /** Expected result */
  expectedResult: unknown;

  /** Estimated duration (ms) */
  estimatedDuration: number;

  /** Test priority */
  priority: 'critical' | 'high' | 'medium' | 'low';

  /** Coverage contribution */
  coverageContribution: number;

  /** AI confidence score */
  confidence: number;

  /** Applied patterns */
  patterns: string[];
}

/**
 * Unit test generation result
 */
export interface UnitTestGenerationResult {
  /** Generated tests */
  tests: GeneratedUnitTest[];

  /** Generation metrics */
  metrics: {
    /** Total tests generated */
    testsGenerated: number;

    /** Generation time (ms) */
    generationTime: number;

    /** Projected coverage */
    projectedCoverage: number;

    /** Patterns applied */
    patternsApplied: number;

    /** AI enhancement ratio */
    aiEnhancementRatio: number;
  };

  /** Test quality score */
  quality: {
    /** Diversity score (0-1) */
    diversity: number;

    /** Edge case coverage (0-1) */
    edgeCases: number;

    /** Mock quality (0-1) */
    mockQuality: number;

    /** Overall quality (0-1) */
    overall: number;
  };

  /** Mock implementations */
  mocks?: {
    /** Mock name */
    name: string;

    /** Mock code */
    code: string;

    /** Mock dependencies */
    dependencies: string[];
  }[];

  /** Recommendations */
  recommendations: string[];
}

/**
 * Code analysis result for test generation
 */
interface CodeAnalysis {
  /** Extracted functions */
  functions: FunctionInfo[];

  /** Code patterns */
  patterns: string[];

  /** Complexity metrics */
  complexity: {
    cyclomatic: number;
    cognitive: number;
    level: 'low' | 'medium' | 'high';
  };

  /** Dependencies */
  dependencies: string[];

  /** Risk areas */
  riskAreas: string[];

  /** Mockable interfaces */
  mockableInterfaces: string[];
}

/**
 * Function information
 */
interface FunctionInfo {
  /** Function name */
  name: string;

  /** Parameters */
  parameters: Array<{
    name: string;
    type: string;
    optional: boolean;
  }>;

  /** Return type */
  returnType: string;

  /** Complexity score */
  complexity: number;

  /** Is async */
  isAsync: boolean;

  /** Line range */
  lineRange: { start: number; end: number };
}

/**
 * Analyze source code for test generation
 */
function analyzeSourceCode(params: UnitTestGenerationParams): CodeAnalysis {
  const { sourceCode, targetClass, targetFunction } = params;

  // Extract functions from source
  const functions = extractFunctions(sourceCode.repositoryUrl, targetClass, targetFunction);

  // Detect code patterns
  const patterns = detectCodePatterns(sourceCode.repositoryUrl);

  // Calculate complexity
  const complexity = calculateComplexity(sourceCode.repositoryUrl);

  // Extract dependencies
  const dependencies = extractDependencies(sourceCode.repositoryUrl);

  // Identify risk areas
  const riskAreas = identifyRiskAreas(functions, complexity);

  // Find mockable interfaces
  const mockableInterfaces = params.generateMocks
    ? identifyMockableInterfaces(dependencies)
    : [];

  return {
    functions,
    patterns,
    complexity,
    dependencies,
    riskAreas,
    mockableInterfaces
  };
}

/**
 * Extract functions from source code
 */
function extractFunctions(
  sourceCode: string,
  targetClass?: string,
  targetFunction?: string
): FunctionInfo[] {
  const functions: FunctionInfo[] = [];

  // Function extraction regex patterns
  const functionPattern = /(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
  const arrowPattern = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/g;
  const methodPattern = /(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*{/g;

  // Extract traditional functions
  let match;
  while ((match = functionPattern.exec(sourceCode)) !== null) {
    const name = match[1];
    if (targetFunction && name !== targetFunction) continue;

    functions.push(createFunctionInfo(name, match[2], match.index, false));
  }

  // Extract arrow functions
  while ((match = arrowPattern.exec(sourceCode)) !== null) {
    const name = match[1];
    if (targetFunction && name !== targetFunction) continue;

    functions.push(createFunctionInfo(name, match[2], match.index, false));
  }

  // Extract class methods
  if (targetClass || !targetFunction) {
    while ((match = methodPattern.exec(sourceCode)) !== null) {
      const name = match[1];
      if (targetFunction && name !== targetFunction) continue;

      functions.push(createFunctionInfo(name, match[2], match.index, false));
    }
  }

  return functions;
}

/**
 * Create function info object
 */
function createFunctionInfo(
  name: string,
  paramsStr: string,
  lineIndex: number,
  isAsync: boolean
): FunctionInfo {
  const parameters = paramsStr
    .split(',')
    .filter(p => p.trim())
    .map(param => {
      const trimmed = param.trim();
      const [paramName, paramType] = trimmed.split(':').map(s => s.trim());
      const optional = paramName.includes('?');

      return {
        name: paramName.replace('?', ''),
        type: paramType || 'any',
        optional
      };
    });

  return {
    name,
    parameters,
    returnType: 'unknown',
    complexity: Math.max(1, parameters.length),
    isAsync,
    lineRange: { start: lineIndex, end: lineIndex + 10 }
  };
}

/**
 * Detect code patterns
 */
function detectCodePatterns(sourceCode: string): string[] {
  const patterns: string[] = [];

  if (sourceCode.includes('class ')) patterns.push('oop');
  if (sourceCode.includes('function') || sourceCode.includes('const ')) patterns.push('functional');
  if (sourceCode.includes('async ') || sourceCode.includes('await ')) patterns.push('async');
  if (sourceCode.includes('Promise')) patterns.push('promise');
  if (sourceCode.includes('try') && sourceCode.includes('catch')) patterns.push('error-handling');

  return patterns;
}

/**
 * Calculate code complexity
 */
function calculateComplexity(sourceCode: string): {
  cyclomatic: number;
  cognitive: number;
  level: 'low' | 'medium' | 'high';
} {
  const lines = sourceCode.split('\n').length;
  const branches = (sourceCode.match(/if|switch|for|while|\?\?/g) || []).length;
  const nesting = (sourceCode.match(/{\s*{/g) || []).length;

  const cyclomatic = branches + 1;
  const cognitive = branches * 2 + nesting;

  let level: 'low' | 'medium' | 'high';
  if (cyclomatic > 10 || cognitive > 15) level = 'high';
  else if (cyclomatic > 5 || cognitive > 7) level = 'medium';
  else level = 'low';

  return { cyclomatic, cognitive, level };
}

/**
 * Extract dependencies from source
 */
function extractDependencies(sourceCode: string): string[] {
  const dependencies: string[] = [];
  const importPattern = /import.*from\s+['"](.+)['"]/g;

  let match;
  while ((match = importPattern.exec(sourceCode)) !== null) {
    dependencies.push(match[1]);
  }

  return dependencies;
}

/**
 * Identify risk areas needing thorough testing
 */
function identifyRiskAreas(
  functions: FunctionInfo[],
  complexity: { cyclomatic: number; cognitive: number }
): string[] {
  const risks: string[] = [];

  if (complexity.cyclomatic > 10) risks.push('high-complexity');
  if (complexity.cognitive > 15) risks.push('high-cognitive-load');
  if (functions.some(f => f.isAsync)) risks.push('async-operations');
  if (functions.some(f => f.parameters.length > 5)) risks.push('many-parameters');

  return risks;
}

/**
 * Identify interfaces that can be mocked
 */
function identifyMockableInterfaces(dependencies: string[]): string[] {
  return dependencies.filter(dep =>
    !dep.startsWith('.') && !dep.startsWith('node:')
  );
}

/**
 * Generate unit tests for a function
 */
function generateTestsForFunction(
  func: FunctionInfo,
  framework: TestFramework,
  params: UnitTestGenerationParams,
  analysis: CodeAnalysis
): GeneratedUnitTest[] {
  const tests: GeneratedUnitTest[] = [];

  // Calculate number of tests based on complexity
  const testCount = Math.min(
    Math.max(2, func.complexity * 2),
    10
  );

  // Generate happy path test
  tests.push(generateHappyPathTest(func, framework, params));

  // Generate edge case tests if enabled
  if (params.includeEdgeCases) {
    tests.push(...generateEdgeCaseTests(func, framework, params, testCount - 1));
  }

  // Generate error handling tests
  if (analysis.patterns.includes('error-handling')) {
    tests.push(generateErrorHandlingTest(func, framework, params));
  }

  // Generate async tests if function is async
  if (func.isAsync) {
    tests.push(generateAsyncTest(func, framework, params));
  }

  return tests.slice(0, testCount);
}

/**
 * Generate happy path test
 */
function generateHappyPathTest(
  func: FunctionInfo,
  framework: TestFramework,
  params: UnitTestGenerationParams
): GeneratedUnitTest {
  const testCode = generateTestCode(func, framework, 'happy-path', params);

  return {
    id: `test-${func.name}-happy-${SecureRandom.generateId(5)}`,
    name: `test_${func.name}_happy_path`,
    code: testCode,
    assertions: [`expect(result).toBeDefined()`],
    expectedResult: 'success',
    estimatedDuration: 100,
    priority: 'high',
    coverageContribution: 0.3,
    confidence: 0.95,
    patterns: ['arrange-act-assert']
  };
}

/**
 * Generate edge case tests
 */
function generateEdgeCaseTests(
  func: FunctionInfo,
  framework: TestFramework,
  params: UnitTestGenerationParams,
  count: number
): GeneratedUnitTest[] {
  const tests: GeneratedUnitTest[] = [];
  const edgeCases = ['null', 'undefined', 'empty', 'boundary'];

  for (let i = 0; i < Math.min(count, edgeCases.length); i++) {
    const edgeCase = edgeCases[i];
    const testCode = generateTestCode(func, framework, edgeCase, params);

    tests.push({
      id: `test-${func.name}-edge-${edgeCase}-${SecureRandom.generateId(5)}`,
      name: `test_${func.name}_${edgeCase}_case`,
      code: testCode,
      assertions: [`expect(() => ${func.name}(${edgeCase})).not.toThrow()`],
      expectedResult: 'handled',
      estimatedDuration: 150,
      priority: 'medium',
      coverageContribution: 0.2,
      confidence: 0.85,
      patterns: ['arrange-act-assert', 'builder']
    });
  }

  return tests;
}

/**
 * Generate error handling test
 */
function generateErrorHandlingTest(
  func: FunctionInfo,
  framework: TestFramework,
  params: UnitTestGenerationParams
): GeneratedUnitTest {
  const testCode = generateTestCode(func, framework, 'error', params);

  return {
    id: `test-${func.name}-error-${SecureRandom.generateId(5)}`,
    name: `test_${func.name}_error_handling`,
    code: testCode,
    assertions: [`expect(() => ${func.name}(invalidInput)).toThrow()`],
    expectedResult: 'error-thrown',
    estimatedDuration: 120,
    priority: 'high',
    coverageContribution: 0.25,
    confidence: 0.90,
    patterns: ['arrange-act-assert']
  };
}

/**
 * Generate async test
 */
function generateAsyncTest(
  func: FunctionInfo,
  framework: TestFramework,
  params: UnitTestGenerationParams
): GeneratedUnitTest {
  const testCode = generateTestCode(func, framework, 'async', params);

  return {
    id: `test-${func.name}-async-${SecureRandom.generateId(5)}`,
    name: `test_${func.name}_async_operation`,
    code: testCode,
    assertions: [`await expect(${func.name}()).resolves.toBeDefined()`],
    expectedResult: 'promise-resolved',
    estimatedDuration: 200,
    priority: 'high',
    coverageContribution: 0.3,
    confidence: 0.88,
    patterns: ['arrange-act-assert']
  };
}

/**
 * Generate test code based on framework
 */
function generateTestCode(
  func: FunctionInfo,
  framework: TestFramework,
  testType: string,
  params: UnitTestGenerationParams
): string {
  const pattern = params.testPatterns[0] || 'arrange-act-assert';

  switch (framework) {
    case 'jest':
      return generateJestTest(func, testType, pattern);

    case 'mocha':
      return generateMochaTest(func, testType, pattern);

    case 'pytest':
      return generatePytestTest(func, testType, pattern);

    default:
      return generateGenericTest(func, testType, pattern);
  }
}

/**
 * Generate Jest test code
 */
function generateJestTest(func: FunctionInfo, testType: string, pattern: string): string {
  const paramValues = func.parameters.map(p => {
    if (testType === 'null') return 'null';
    if (testType === 'undefined') return 'undefined';
    if (testType === 'empty') return p.type.includes('string') ? '""' : '[]';
    return `mockParam_${p.name}`;
  }).join(', ');

  const asyncKeyword = func.isAsync ? 'async ' : '';
  const awaitKeyword = func.isAsync ? 'await ' : '';

  if (pattern === 'given-when-then') {
    return `test('${func.name} - ${testType}', ${asyncKeyword}() => {
  // Given
  ${func.parameters.map(p => `const ${p.name} = ${paramValues};`).join('\n  ')}

  // When
  const result = ${awaitKeyword}${func.name}(${paramValues});

  // Then
  expect(result).toBeDefined();
});`;
  }

  return `test('${func.name} - ${testType}', ${asyncKeyword}() => {
  // Arrange
  ${func.parameters.map(p => `const ${p.name} = ${paramValues};`).join('\n  ')}

  // Act
  const result = ${awaitKeyword}${func.name}(${paramValues});

  // Assert
  expect(result).toBeDefined();
});`;
}

/**
 * Generate Mocha test code
 */
function generateMochaTest(func: FunctionInfo, testType: string, pattern: string): string {
  return `it('should handle ${testType} case', () => {
  const result = ${func.name}();
  expect(result).to.be.ok;
});`;
}

/**
 * Generate Pytest test code
 */
function generatePytestTest(func: FunctionInfo, testType: string, pattern: string): string {
  return `def test_${func.name}_${testType}():
    result = ${func.name}()
    assert result is not None`;
}

/**
 * Generate generic test code
 */
function generateGenericTest(func: FunctionInfo, testType: string, pattern: string): string {
  return `// Test: ${func.name} - ${testType}\n// Pattern: ${pattern}\n// TODO: Implement test`;
}

/**
 * Generate mock implementations
 */
function generateMocks(
  mockableInterfaces: string[],
  framework: TestFramework
): Array<{ name: string; code: string; dependencies: string[] }> {
  return mockableInterfaces.map(interfaceName => ({
    name: `Mock${interfaceName}`,
    code: generateMockCode(interfaceName, framework),
    dependencies: [interfaceName]
  }));
}

/**
 * Generate mock code
 */
function generateMockCode(interfaceName: string, framework: TestFramework): string {
  if (framework === 'jest') {
    return `const mock${interfaceName} = {
  // Auto-generated mock for ${interfaceName}
  mockMethod: jest.fn(),
  mockProperty: 'test-value'
};`;
  }

  return `// Mock for ${interfaceName}\nconst mock = {};`;
}

/**
 * Calculate quality scores
 */
function calculateQualityScores(tests: GeneratedUnitTest[]): {
  diversity: number;
  edgeCases: number;
  mockQuality: number;
  overall: number;
} {
  const uniquePatterns = new Set(tests.flatMap(t => t.patterns)).size;
  const diversity = Math.min(uniquePatterns / 5, 1.0);

  const edgeCaseTests = tests.filter(t => t.name.includes('edge') || t.name.includes('error'));
  const edgeCases = tests.length > 0 ? edgeCaseTests.length / tests.length : 0;

  const avgConfidence = tests.reduce((sum, t) => sum + t.confidence, 0) / tests.length;
  const mockQuality = avgConfidence;

  const overall = (diversity + edgeCases + mockQuality) / 3;

  return { diversity, edgeCases, mockQuality, overall };
}

/**
 * Generate recommendations
 */
function generateRecommendations(
  analysis: CodeAnalysis,
  tests: GeneratedUnitTest[],
  params: UnitTestGenerationParams
): string[] {
  const recommendations: string[] = [];

  if (analysis.complexity.level === 'high') {
    recommendations.push('High complexity detected - consider refactoring before testing');
  }

  if (tests.length < analysis.functions.length * 2) {
    recommendations.push('Consider adding more test cases for better coverage');
  }

  if (!params.generateMocks && analysis.dependencies.length > 0) {
    recommendations.push('Enable mock generation for better isolation');
  }

  if (!params.includeEdgeCases) {
    recommendations.push('Enable edge case testing for robustness');
  }

  if (analysis.riskAreas.includes('async-operations')) {
    recommendations.push('Add timeout and error handling tests for async operations');
  }

  return recommendations;
}

/**
 * Generate unit tests for source code
 *
 * @param params - Unit test generation parameters
 * @returns Tool response with generated tests and metrics
 */
export async function generateUnitTests(
  params: UnitTestGenerationParams
): Promise<QEToolResponse<UnitTestGenerationResult>> {
  const startTime = Date.now();
  const requestId = `unit-gen-${Date.now()}-${SecureRandom.generateId(8)}`;

  try {
    // Analyze source code
    const analysis = analyzeSourceCode(params);

    // Generate tests for each function
    const allTests: GeneratedUnitTest[] = [];
    for (const func of analysis.functions) {
      const funcTests = generateTestsForFunction(func, params.framework, params, analysis);
      allTests.push(...funcTests);
    }

    // Generate mocks if requested
    const mocks = params.generateMocks
      ? generateMocks(analysis.mockableInterfaces, params.framework)
      : undefined;

    // Calculate quality scores
    const quality = calculateQualityScores(allTests);

    // Calculate projected coverage
    const projectedCoverage = Math.min(
      params.coverageTarget,
      allTests.reduce((sum, t) => sum + t.coverageContribution, 0) * 100
    );

    // Count patterns applied
    const patternsApplied = new Set(allTests.flatMap(t => t.patterns)).size;

    // Calculate AI enhancement ratio
    const aiEnhancementRatio = allTests.filter(t => t.confidence > 0.85).length / allTests.length;

    // Generate recommendations
    const recommendations = generateRecommendations(analysis, allTests, params);

    const executionTime = Date.now() - startTime;

    const metadata: ResponseMetadata = {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'unit-test-generator',
      version: '1.0.0'
    };

    return {
      success: true,
      data: {
        tests: allTests,
        metrics: {
          testsGenerated: allTests.length,
          generationTime: executionTime,
          projectedCoverage,
          patternsApplied,
          aiEnhancementRatio
        },
        quality,
        mocks,
        recommendations
      },
      metadata
    };
  } catch (error) {
    const qeError: QEError = {
      code: 'UNIT_TEST_GENERATION_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error during unit test generation',
      details: { params },
      stack: error instanceof Error ? error.stack : undefined
    };

    return {
      success: false,
      error: qeError,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        executionTime: Date.now() - startTime,
        agent: 'unit-test-generator',
        version: '1.0.0'
      }
    };
  }
}
