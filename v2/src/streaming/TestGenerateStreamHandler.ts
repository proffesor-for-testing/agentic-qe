/**
 * Test Generation Streaming Handler
 *
 * Provides real-time progress updates for AI-powered test generation.
 * Emits progress for each function/module as tests are generated.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseStreamHandler, StreamEvent } from './BaseStreamHandler';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

export interface TestGenerateParams {
  sourceFile: string;
  framework: 'jest' | 'mocha' | 'vitest';
  testType?: 'unit' | 'integration' | 'e2e';
  coverage?: number; // Target coverage (0-100)
  includeEdgeCases?: boolean;
  generateMocks?: boolean;
}

export interface FunctionAnalysis {
  name: string;
  params: string[];
  returnType?: string;
  complexity: number;
  isAsync: boolean;
  isExported: boolean;
  lineStart: number;
  lineEnd: number;
}

export interface GeneratedTest {
  functionName: string;
  testCode: string;
  testCount: number;
  coverageEstimate: number;
  includesEdgeCases: boolean;
  includesMocks: boolean;
}

export interface TestGenerateResult {
  sourceFile: string;
  framework: string;
  tests: GeneratedTest[];
  totalTests: number;
  estimatedCoverage: number;
  generationTime: number;
  outputFile: string;
}

/**
 * Streaming handler for test generation with real-time progress
 */
export class TestGenerateStreamHandler extends BaseStreamHandler {
  /**
   * Process test generation task with incremental progress updates
   */
  protected async *processTask(params: TestGenerateParams): AsyncGenerator<StreamEvent> {
    const {
      sourceFile,
      framework,
      testType = 'unit',
      coverage = 80,
      includeEdgeCases = true,
      generateMocks = true
    } = params;

    // Validate source file exists
    yield this.progressEvent(5, `Validating source file: ${sourceFile}`);
    await this.validateSourceFile(sourceFile);

    // Analyze source file
    yield this.progressEvent(10, 'Analyzing source file...');
    const analysis = await this.analyzeSourceFile(sourceFile);

    yield this.progressEvent(20, `Found ${analysis.functions.length} functions to test`, {
      functionsFound: analysis.functions.length,
      totalLines: analysis.totalLines
    });

    // Generate tests for each function
    const tests: GeneratedTest[] = [];
    const totalFunctions = analysis.functions.length;

    for (let i = 0; i < totalFunctions; i++) {
      if (this.isCancelled()) {
        throw new Error('Test generation cancelled');
      }

      const func = analysis.functions[i];
      const progress = 20 + ((i / totalFunctions) * 60);

      yield this.progressEvent(
        progress,
        `Generating tests for ${func.name}...`,
        {
          currentFunction: func.name,
          functionsCompleted: i,
          functionsTotal: totalFunctions
        }
      );

      const generatedTest = await this.generateTestForFunction(
        func,
        framework,
        { includeEdgeCases, generateMocks, coverage }
      );

      tests.push(generatedTest);

      // Emit intermediate result
      yield this.resultEvent(generatedTest, {
        type: 'intermediate',
        progress: i + 1,
        total: totalFunctions
      });

      // Small delay to simulate AI generation (in real impl, this would be LLM call)
      await this.sleep(100);
    }

    // Generate output file
    yield this.progressEvent(85, 'Generating test file...');
    const outputFile = await this.generateTestFile(sourceFile, tests, framework);

    yield this.progressEvent(95, 'Calculating coverage estimate...');
    const estimatedCoverage = this.calculateCoverageEstimate(tests, analysis.totalLines);

    // Final result
    const result: TestGenerateResult = {
      sourceFile,
      framework,
      tests,
      totalTests: tests.reduce((sum, t) => sum + t.testCount, 0),
      estimatedCoverage,
      generationTime: Date.now() - this.startTime,
      outputFile
    };

    yield this.progressEvent(100, `Generated ${result.totalTests} tests in ${outputFile}`);
    yield this.resultEvent(result, { type: 'final' });
  }

  /**
   * Validate source file exists and is readable
   */
  private async validateSourceFile(sourceFile: string): Promise<void> {
    try {
      await fs.access(sourceFile, fs.constants.R_OK);
    } catch (error) {
      throw new Error(`Source file not found or not readable: ${sourceFile}`);
    }
  }

  /**
   * Analyze source file to extract functions
   */
  private async analyzeSourceFile(sourceFile: string): Promise<{
    functions: FunctionAnalysis[];
    totalLines: number;
  }> {
    const code = await fs.readFile(sourceFile, 'utf-8');
    const functions: FunctionAnalysis[] = [];

    try {
      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx']
      });

      // Use @babel/traverse default export
      const traverseFunc = typeof traverse === 'function' ? traverse : (traverse as any).default;

      traverseFunc(ast, {
        FunctionDeclaration(path: any) {
          functions.push(this.extractFunctionInfo(path));
        },
        ArrowFunctionExpression(path: any) {
          if (path.parent.type === 'VariableDeclarator') {
            functions.push(this.extractFunctionInfo(path));
          }
        },
        ClassMethod(path: any) {
          functions.push(this.extractFunctionInfo(path));
        }
      });

      return {
        functions,
        totalLines: code.split('\n').length
      };
    } catch (error) {
      // If parsing fails, return empty analysis
      return {
        functions: [],
        totalLines: code.split('\n').length
      };
    }
  }

  /**
   * Extract function information from AST node
   */
  private extractFunctionInfo(path: any): FunctionAnalysis {
    const node = path.node;
    const name = node.id?.name || node.key?.name || 'anonymous';

    return {
      name,
      params: node.params?.map((p: any) => p.name || 'param') || [],
      complexity: this.estimateComplexity(node),
      isAsync: node.async || false,
      isExported: this.isExported(path),
      lineStart: node.loc?.start.line || 0,
      lineEnd: node.loc?.end.line || 0
    };
  }

  /**
   * Estimate cyclomatic complexity
   */
  private estimateComplexity(node: any): number {
    // Simplified complexity estimation
    let complexity = 1;

    if (node.body) {
      const bodyStr = JSON.stringify(node.body);
      complexity += (bodyStr.match(/if|while|for|case|\&\&|\|\|/g) || []).length;
    }

    return complexity;
  }

  /**
   * Check if function is exported
   */
  private isExported(path: any): boolean {
    let parent = path.parentPath;
    while (parent) {
      if (parent.node.type === 'ExportNamedDeclaration' ||
          parent.node.type === 'ExportDefaultDeclaration') {
        return true;
      }
      parent = parent.parentPath;
    }
    return false;
  }

  /**
   * Generate test for a single function
   */
  private async generateTestForFunction(
    func: FunctionAnalysis,
    framework: string,
    options: {
      includeEdgeCases: boolean;
      generateMocks: boolean;
      coverage: number;
    }
  ): Promise<GeneratedTest> {
    // In real implementation, this would use LLM to generate tests
    // For now, generate template-based tests

    const tests: string[] = [];

    // Basic happy path test
    tests.push(this.generateHappyPathTest(func, framework));

    // Edge cases based on complexity
    if (options.includeEdgeCases) {
      tests.push(...this.generateEdgeCaseTests(func, framework));
    }

    // Error handling tests
    if (func.complexity > 2) {
      tests.push(this.generateErrorTest(func, framework));
    }

    const testCode = tests.join('\n\n');

    return {
      functionName: func.name,
      testCode,
      testCount: tests.length,
      coverageEstimate: Math.min(95, 50 + (tests.length * 15)),
      includesEdgeCases: options.includeEdgeCases,
      includesMocks: options.generateMocks
    };
  }

  /**
   * Generate happy path test
   */
  private generateHappyPathTest(func: FunctionAnalysis, framework: string): string {
    const testFn = framework === 'jest' ? 'test' : 'it';
    const expectFn = framework === 'mocha' ? 'expect' : 'expect';

    return `${testFn}('${func.name} should work with valid input', ${func.isAsync ? 'async ' : ''}() => {
  // Arrange
  const input = {}; // TODO: Provide valid input

  // Act
  const result = ${func.isAsync ? 'await ' : ''}${func.name}(input);

  // Assert
  ${expectFn}(result).toBeDefined();
});`;
  }

  /**
   * Generate edge case tests
   */
  private generateEdgeCaseTests(func: FunctionAnalysis, framework: string): string[] {
    const testFn = framework === 'jest' ? 'test' : 'it';
    const tests: string[] = [];

    // Null/undefined test
    tests.push(`${testFn}('${func.name} should handle null/undefined', () => {
  expect(() => ${func.name}(null)).not.toThrow();
});`);

    // Empty input test
    if (func.params.length > 0) {
      tests.push(`${testFn}('${func.name} should handle empty input', () => {
  const result = ${func.name}({});
  expect(result).toBeDefined();
});`);
    }

    return tests;
  }

  /**
   * Generate error handling test
   */
  private generateErrorTest(func: FunctionAnalysis, framework: string): string {
    const testFn = framework === 'jest' ? 'test' : 'it';

    return `${testFn}('${func.name} should handle errors gracefully', ${func.isAsync ? 'async ' : ''}() => {
  const invalidInput = undefined;

  ${func.isAsync ?
    'await expect(' + func.name + '(invalidInput)).rejects.toThrow();' :
    'expect(() => ' + func.name + '(invalidInput)).toThrow();'
  }
});`;
  }

  /**
   * Generate test file with all tests
   */
  private async generateTestFile(
    sourceFile: string,
    tests: GeneratedTest[],
    framework: string
  ): Promise<string> {
    const dir = path.dirname(sourceFile);
    const basename = path.basename(sourceFile, path.extname(sourceFile));
    const outputFile = path.join(dir, `${basename}.test.ts`);

    const imports = this.generateImports(sourceFile, tests, framework);
    const testSuites = tests.map(t => t.testCode).join('\n\n');

    const fileContent = `${imports}\n\ndescribe('${basename}', () => {\n${testSuites}\n});\n`;

    await fs.writeFile(outputFile, fileContent, 'utf-8');

    return outputFile;
  }

  /**
   * Generate import statements
   */
  private generateImports(
    sourceFile: string,
    tests: GeneratedTest[],
    framework: string
  ): string {
    const functionNames = tests.map(t => t.functionName).join(', ');
    const relativePath = './' + path.basename(sourceFile, path.extname(sourceFile));

    let imports = `import { ${functionNames} } from '${relativePath}';\n`;

    if (framework === 'jest') {
      imports += `import { describe, test, expect } from '@jest/globals';\n`;
    } else if (framework === 'mocha') {
      imports += `import { describe, it } from 'mocha';\nimport { expect } from 'chai';\n`;
    }

    return imports;
  }

  /**
   * Calculate estimated coverage
   */
  private calculateCoverageEstimate(tests: GeneratedTest[], totalLines: number): number {
    const avgCoverage = tests.reduce((sum, t) => sum + t.coverageEstimate, 0) / tests.length;
    return Math.min(95, avgCoverage);
  }
}
