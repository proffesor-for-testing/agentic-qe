/**
 * Agentic QE v3 - Test Generation Service
 * Implements ITestGenerationService for AI-powered test generation
 *
 * Uses @faker-js/faker for realistic test data generation
 * Uses TypeScript AST parser for code analysis
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { faker } from '@faker-js/faker';
import { Result, ok, err } from '../../../shared/types';
import { MemoryBackend } from '../../../kernel/interfaces';
import {
  GenerateTestsRequest,
  GeneratedTests,
  GeneratedTest,
  TDDRequest,
  TDDResult,
  PropertyTestRequest,
  PropertyTests,
  TestDataRequest,
  TestData,
  Pattern,
} from '../interfaces';

/**
 * Interface for the test generation service
 */
export interface ITestGenerationService {
  generateTests(request: GenerateTestsRequest): Promise<Result<GeneratedTests, Error>>;
  generateForCoverageGap(
    file: string,
    uncoveredLines: number[],
    framework: string
  ): Promise<Result<GeneratedTest[], Error>>;
  generateTDDTests(request: TDDRequest): Promise<Result<TDDResult, Error>>;
  generatePropertyTests(request: PropertyTestRequest): Promise<Result<PropertyTests, Error>>;
  generateTestData(request: TestDataRequest): Promise<Result<TestData, Error>>;
}

/**
 * Configuration for the test generator
 */
export interface TestGeneratorConfig {
  defaultFramework: 'jest' | 'vitest' | 'mocha' | 'pytest';
  maxTestsPerFile: number;
  coverageTargetDefault: number;
  enableAIGeneration: boolean;
}

const DEFAULT_CONFIG: TestGeneratorConfig = {
  defaultFramework: 'jest',
  maxTestsPerFile: 50,
  coverageTargetDefault: 80,
  enableAIGeneration: true,
};

/**
 * Information about a function extracted from AST
 */
interface FunctionInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType: string | undefined;
  isAsync: boolean;
  isExported: boolean;
  complexity: number;
  startLine: number;
  endLine: number;
  body?: string;
}

/**
 * Information about a class extracted from AST
 */
interface ClassInfo {
  name: string;
  methods: FunctionInfo[];
  properties: PropertyInfo[];
  isExported: boolean;
  hasConstructor: boolean;
  constructorParams?: ParameterInfo[];
}

/**
 * Information about a parameter
 */
interface ParameterInfo {
  name: string;
  type: string | undefined;
  optional: boolean;
  defaultValue: string | undefined;
}

/**
 * Information about a class property
 */
interface PropertyInfo {
  name: string;
  type: string | undefined;
  isPrivate: boolean;
  isReadonly: boolean;
}

/**
 * Test case definition
 */
interface TestCase {
  description: string;
  type: 'happy-path' | 'edge-case' | 'error-handling' | 'boundary';
  setup?: string;
  action: string;
  assertion: string;
}

/**
 * Data schema field definition
 */
interface SchemaField {
  type: string;
  faker?: string;
  min?: number;
  max?: number;
  enum?: string[];
  pattern?: string;
  reference?: string;
}

/**
 * Test Generation Service Implementation
 * Uses AI prompts (stubbed) to generate test cases from source code
 */
export class TestGeneratorService implements ITestGenerationService {
  private readonly config: TestGeneratorConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<TestGeneratorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate tests for given source files
   */
  async generateTests(request: GenerateTestsRequest): Promise<Result<GeneratedTests, Error>> {
    try {
      const {
        sourceFiles,
        testType,
        framework,
        coverageTarget = this.config.coverageTargetDefault,
        patterns = [],
      } = request;

      if (sourceFiles.length === 0) {
        return err(new Error('No source files provided'));
      }

      const tests: GeneratedTest[] = [];
      const patternsUsed: string[] = [];

      // Process each source file
      for (const sourceFile of sourceFiles) {
        const fileTests = await this.generateTestsForFile(
          sourceFile,
          testType,
          framework,
          patterns
        );

        if (fileTests.success) {
          tests.push(...fileTests.value.tests);
          patternsUsed.push(...fileTests.value.patternsUsed);
        }
      }

      // Calculate coverage estimate based on test count and complexity
      const coverageEstimate = this.estimateCoverage(tests, coverageTarget);

      // Store generation metadata in memory
      await this.storeGenerationMetadata(tests, patternsUsed);

      return ok({
        tests,
        coverageEstimate,
        patternsUsed: [...new Set(patternsUsed)],
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate tests specifically targeting coverage gaps
   */
  async generateForCoverageGap(
    file: string,
    uncoveredLines: number[],
    framework: string
  ): Promise<Result<GeneratedTest[], Error>> {
    try {
      if (uncoveredLines.length === 0) {
        return ok([]);
      }

      // Analyze uncovered lines and generate targeted tests
      // Groups consecutive lines and generates tests for each block
      const tests: GeneratedTest[] = [];

      // Group uncovered lines into logical blocks
      const lineGroups = this.groupConsecutiveLines(uncoveredLines);

      for (const group of lineGroups) {
        const test = await this.generateTestForLines(file, group, framework);
        if (test) {
          tests.push(test);
        }
      }

      return ok(tests);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate tests following TDD workflow
   */
  async generateTDDTests(request: TDDRequest): Promise<Result<TDDResult, Error>> {
    try {
      const { feature, behavior, framework, phase } = request;

      switch (phase) {
        case 'red':
          // Generate failing test first
          return ok(await this.generateRedPhaseTest(feature, behavior, framework));

        case 'green':
          // Generate minimal implementation to make test pass
          return ok(await this.generateGreenPhaseCode(feature, behavior, framework));

        case 'refactor':
          // Suggest refactoring improvements
          return ok(await this.generateRefactoringSuggestions(feature, behavior));

        default:
          return err(new Error(`Unknown TDD phase: ${phase}`));
      }
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate property-based tests
   */
  async generatePropertyTests(
    request: PropertyTestRequest
  ): Promise<Result<PropertyTests, Error>> {
    try {
      const { function: funcName, properties, constraints = {} } = request;

      // Generate property-based tests using fast-check generators
      const tests = properties.map((property) => ({
        property,
        testCode: this.generatePropertyTestCode(funcName, property, constraints),
        generators: this.inferGenerators(property, constraints),
      }));

      return ok({
        tests,
        arbitraries: this.collectArbitraries(tests),
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate test data based on schema
   */
  async generateTestData(request: TestDataRequest): Promise<Result<TestData, Error>> {
    try {
      const { schema, count, locale = 'en', preserveRelationships = false } = request;

      // Generate test data using @faker-js/faker with seeded randomness
      const seed = Date.now();
      const records: unknown[] = [];

      for (let i = 0; i < count; i++) {
        const record = this.generateRecordFromSchema(schema, seed + i, locale);
        records.push(record);
      }

      // Handle relationships if needed
      if (preserveRelationships) {
        this.linkRelatedRecords(records, schema);
      }

      return ok({
        records,
        schema,
        seed,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async generateTestsForFile(
    sourceFile: string,
    testType: 'unit' | 'integration' | 'e2e',
    framework: string,
    patterns: string[]
  ): Promise<Result<{ tests: GeneratedTest[]; patternsUsed: string[] }, Error>> {
    const testFile = this.getTestFilePath(sourceFile, framework);
    const patternsUsed: string[] = [];

    // Look for applicable patterns from memory
    const applicablePatterns = await this.findApplicablePatterns(sourceFile, patterns);
    patternsUsed.push(...applicablePatterns.map((p) => p.name));

    // Try to read and parse the source file for real AST analysis
    let codeAnalysis: { functions: FunctionInfo[]; classes: ClassInfo[] } | null = null;
    try {
      const content = fs.readFileSync(sourceFile, 'utf-8');
      codeAnalysis = this.analyzeSourceCode(content, sourceFile);
    } catch {
      // File doesn't exist or can't be read - use stub generation
    }

    // Generate test code based on analysis or fall back to stub
    let testCode: string;
    if (codeAnalysis && (codeAnalysis.functions.length > 0 || codeAnalysis.classes.length > 0)) {
      testCode = this.generateRealTestCode(
        sourceFile,
        testType,
        framework,
        codeAnalysis,
        applicablePatterns
      );
    } else {
      testCode = this.generateStubTestCode(sourceFile, testType, framework, applicablePatterns);
    }

    const test: GeneratedTest = {
      id: uuidv4(),
      name: `${this.extractModuleName(sourceFile)} tests`,
      sourceFile,
      testFile,
      testCode,
      type: testType,
      assertions: this.countAssertions(testCode),
    };

    return ok({ tests: [test], patternsUsed });
  }

  /**
   * Analyze source code using TypeScript AST
   */
  private analyzeSourceCode(
    content: string,
    fileName: string
  ): { functions: FunctionInfo[]; classes: ClassInfo[] } {
    const sourceFile = ts.createSourceFile(
      path.basename(fileName),
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );

    const functions: FunctionInfo[] = [];
    const classes: ClassInfo[] = [];

    const visit = (node: ts.Node): void => {
      // Extract function declarations
      if (ts.isFunctionDeclaration(node) && node.name) {
        functions.push(this.extractFunctionInfo(node, sourceFile));
      }
      // Extract arrow functions assigned to variables
      else if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (
            ts.isVariableDeclaration(declaration) &&
            declaration.initializer &&
            (ts.isArrowFunction(declaration.initializer) ||
              ts.isFunctionExpression(declaration.initializer))
          ) {
            const name = declaration.name.getText(sourceFile);
            functions.push(
              this.extractArrowFunctionInfo(name, declaration.initializer, sourceFile, node)
            );
          }
        }
      }
      // Extract class declarations
      else if (ts.isClassDeclaration(node) && node.name) {
        classes.push(this.extractClassInfo(node, sourceFile));
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return { functions, classes };
  }

  /**
   * Extract function information from AST
   */
  private extractFunctionInfo(
    node: ts.FunctionDeclaration,
    sourceFile: ts.SourceFile
  ): FunctionInfo {
    const name = node.name?.getText(sourceFile) || 'anonymous';
    const parameters = this.extractParameters(node.parameters, sourceFile);
    const returnType = node.type?.getText(sourceFile);
    const isAsync = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
    const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    return {
      name,
      parameters,
      returnType,
      isAsync,
      isExported,
      complexity: this.calculateComplexity(node),
      startLine: startLine + 1,
      endLine: endLine + 1,
      body: node.body?.getText(sourceFile),
    };
  }

  /**
   * Extract arrow function information from AST
   */
  private extractArrowFunctionInfo(
    name: string,
    node: ts.ArrowFunction | ts.FunctionExpression,
    sourceFile: ts.SourceFile,
    parentNode: ts.Node
  ): FunctionInfo {
    const parameters = this.extractParameters(node.parameters, sourceFile);
    const returnType = node.type?.getText(sourceFile);
    const isAsync = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
    const isExported =
      ts.isVariableStatement(parentNode) &&
      (parentNode.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false);

    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    return {
      name,
      parameters,
      returnType,
      isAsync,
      isExported,
      complexity: this.calculateComplexity(node),
      startLine: startLine + 1,
      endLine: endLine + 1,
      body: node.body?.getText(sourceFile),
    };
  }

  /**
   * Extract class information from AST
   */
  private extractClassInfo(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): ClassInfo {
    const name = node.name?.getText(sourceFile) || 'AnonymousClass';
    const methods: FunctionInfo[] = [];
    const properties: PropertyInfo[] = [];
    let hasConstructor = false;
    let constructorParams: ParameterInfo[] | undefined;

    const isExported =
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

    for (const member of node.members) {
      if (ts.isMethodDeclaration(member)) {
        const methodName = member.name.getText(sourceFile);
        const parameters = this.extractParameters(member.parameters, sourceFile);
        const returnType = member.type?.getText(sourceFile);
        const isAsync =
          member.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;

        const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(
          member.getStart(sourceFile)
        );
        const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(member.getEnd());

        methods.push({
          name: methodName,
          parameters,
          returnType,
          isAsync,
          isExported: false,
          complexity: this.calculateComplexity(member),
          startLine: startLine + 1,
          endLine: endLine + 1,
          body: member.body?.getText(sourceFile),
        });
      } else if (ts.isConstructorDeclaration(member)) {
        hasConstructor = true;
        constructorParams = this.extractParameters(member.parameters, sourceFile);
      } else if (ts.isPropertyDeclaration(member)) {
        const propName = member.name.getText(sourceFile);
        const propType = member.type?.getText(sourceFile);
        const isPrivate =
          member.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword) ?? false;
        const isReadonly =
          member.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) ?? false;

        properties.push({
          name: propName,
          type: propType,
          isPrivate,
          isReadonly,
        });
      }
    }

    return {
      name,
      methods,
      properties,
      isExported,
      hasConstructor,
      constructorParams,
    };
  }

  /**
   * Extract parameters from a function
   */
  private extractParameters(
    params: ts.NodeArray<ts.ParameterDeclaration>,
    sourceFile: ts.SourceFile
  ): ParameterInfo[] {
    return params.map((param) => ({
      name: param.name.getText(sourceFile),
      type: param.type?.getText(sourceFile),
      optional: param.questionToken !== undefined,
      defaultValue: param.initializer?.getText(sourceFile),
    }));
  }

  /**
   * Calculate cyclomatic complexity of a node
   */
  private calculateComplexity(node: ts.Node): number {
    let complexity = 1;

    const visit = (n: ts.Node): void => {
      switch (n.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.CaseClause:
        case ts.SyntaxKind.CatchClause:
        case ts.SyntaxKind.ConditionalExpression:
          complexity++;
          break;
        case ts.SyntaxKind.BinaryExpression: {
          const binary = n as ts.BinaryExpression;
          if (
            binary.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
            binary.operatorToken.kind === ts.SyntaxKind.BarBarToken
          ) {
            complexity++;
          }
          break;
        }
      }
      ts.forEachChild(n, visit);
    };

    ts.forEachChild(node, visit);
    return complexity;
  }

  /**
   * Generate real test code based on AST analysis
   */
  private generateRealTestCode(
    sourceFile: string,
    testType: 'unit' | 'integration' | 'e2e',
    framework: string,
    analysis: { functions: FunctionInfo[]; classes: ClassInfo[] },
    patterns: Pattern[]
  ): string {
    const moduleName = this.extractModuleName(sourceFile);
    const importPath = this.getImportPath(sourceFile);

    switch (framework) {
      case 'jest':
      case 'vitest':
        return this.generateRealJestVitestTest(
          moduleName,
          importPath,
          testType,
          analysis,
          patterns,
          framework
        );
      case 'mocha':
        return this.generateRealMochaTest(moduleName, importPath, testType, analysis, patterns);
      case 'pytest':
        return this.generateRealPytestTest(moduleName, importPath, testType, analysis, patterns);
      default:
        return this.generateRealJestVitestTest(
          moduleName,
          importPath,
          testType,
          analysis,
          patterns,
          'vitest'
        );
    }
  }

  /**
   * Generate real Jest/Vitest test code
   */
  private generateRealJestVitestTest(
    moduleName: string,
    importPath: string,
    testType: string,
    analysis: { functions: FunctionInfo[]; classes: ClassInfo[] },
    patterns: Pattern[],
    framework: string
  ): string {
    const patternComment =
      patterns.length > 0
        ? `// Applied patterns: ${patterns.map((p) => p.name).join(', ')}\n`
        : '';

    // Collect all exports to import
    const exports: string[] = [];
    for (const fn of analysis.functions) {
      if (fn.isExported) exports.push(fn.name);
    }
    for (const cls of analysis.classes) {
      if (cls.isExported) exports.push(cls.name);
    }

    const importStatement =
      exports.length > 0
        ? `import { ${exports.join(', ')} } from '${importPath}';`
        : `import * as ${moduleName} from '${importPath}';`;

    let testCode = `${patternComment}import { describe, it, expect, beforeEach${framework === 'vitest' ? ', vi' : ''} } from '${framework}';
${importStatement}

`;

    // Generate tests for each function
    for (const fn of analysis.functions) {
      testCode += this.generateFunctionTests(fn, testType);
    }

    // Generate tests for each class
    for (const cls of analysis.classes) {
      testCode += this.generateClassTests(cls, testType);
    }

    return testCode;
  }

  /**
   * Generate tests for a function
   */
  private generateFunctionTests(fn: FunctionInfo, _testType: string): string {
    const testCases = this.generateTestCasesForFunction(fn);

    let code = `describe('${fn.name}', () => {\n`;

    for (const testCase of testCases) {
      if (testCase.setup) {
        code += `  ${testCase.setup}\n\n`;
      }

      const asyncPrefix = fn.isAsync ? 'async ' : '';
      code += `  it('${testCase.description}', ${asyncPrefix}() => {\n`;
      code += `    ${testCase.action}\n`;
      code += `    ${testCase.assertion}\n`;
      code += `  });\n\n`;
    }

    code += `});\n\n`;
    return code;
  }

  /**
   * Generate test cases for a function
   */
  private generateTestCasesForFunction(fn: FunctionInfo): TestCase[] {
    const testCases: TestCase[] = [];

    // Generate valid input test
    const validParams = fn.parameters.map((p) => this.generateTestValue(p)).join(', ');
    const fnCall = fn.isAsync ? `await ${fn.name}(${validParams})` : `${fn.name}(${validParams})`;

    testCases.push({
      description: 'should handle valid input correctly',
      type: 'happy-path',
      action: `const result = ${fnCall};`,
      assertion: 'expect(result).toBeDefined();',
    });

    // Generate tests for each parameter
    for (const param of fn.parameters) {
      if (!param.optional) {
        // Test with undefined
        const paramsWithUndefined = fn.parameters
          .map((p) => (p.name === param.name ? 'undefined' : this.generateTestValue(p)))
          .join(', ');

        testCases.push({
          description: `should handle undefined ${param.name}`,
          type: 'error-handling',
          action: fn.isAsync
            ? `const action = async () => await ${fn.name}(${paramsWithUndefined});`
            : `const action = () => ${fn.name}(${paramsWithUndefined});`,
          assertion: 'expect(action).toThrow();',
        });
      }

      // Type-specific boundary tests
      if (param.type?.includes('string')) {
        const paramsWithEmpty = fn.parameters
          .map((p) => (p.name === param.name ? "''" : this.generateTestValue(p)))
          .join(', ');
        const emptyCall = fn.isAsync
          ? `await ${fn.name}(${paramsWithEmpty})`
          : `${fn.name}(${paramsWithEmpty})`;

        testCases.push({
          description: `should handle empty string for ${param.name}`,
          type: 'boundary',
          action: `const result = ${emptyCall};`,
          assertion: 'expect(result).toBeDefined();',
        });
      }

      if (param.type?.includes('number')) {
        const paramsWithZero = fn.parameters
          .map((p) => (p.name === param.name ? '0' : this.generateTestValue(p)))
          .join(', ');
        const zeroCall = fn.isAsync
          ? `await ${fn.name}(${paramsWithZero})`
          : `${fn.name}(${paramsWithZero})`;

        testCases.push({
          description: `should handle zero for ${param.name}`,
          type: 'boundary',
          action: `const result = ${zeroCall};`,
          assertion: 'expect(result).toBeDefined();',
        });

        const paramsWithNegative = fn.parameters
          .map((p) => (p.name === param.name ? '-1' : this.generateTestValue(p)))
          .join(', ');
        const negativeCall = fn.isAsync
          ? `await ${fn.name}(${paramsWithNegative})`
          : `${fn.name}(${paramsWithNegative})`;

        testCases.push({
          description: `should handle negative value for ${param.name}`,
          type: 'edge-case',
          action: `const result = ${negativeCall};`,
          assertion: 'expect(result).toBeDefined();',
        });
      }

      if (param.type?.includes('[]') || param.type?.includes('Array')) {
        const paramsWithEmpty = fn.parameters
          .map((p) => (p.name === param.name ? '[]' : this.generateTestValue(p)))
          .join(', ');
        const emptyCall = fn.isAsync
          ? `await ${fn.name}(${paramsWithEmpty})`
          : `${fn.name}(${paramsWithEmpty})`;

        testCases.push({
          description: `should handle empty array for ${param.name}`,
          type: 'boundary',
          action: `const result = ${emptyCall};`,
          assertion: 'expect(result).toBeDefined();',
        });
      }
    }

    // Async rejection test
    if (fn.isAsync) {
      testCases.push({
        description: 'should handle async rejection gracefully',
        type: 'error-handling',
        action: `// Mock or setup to cause rejection`,
        assertion: `// await expect(${fn.name}(invalidParams)).rejects.toThrow();`,
      });
    }

    return testCases;
  }

  /**
   * Generate tests for a class
   */
  private generateClassTests(cls: ClassInfo, testType: string): string {
    let code = `describe('${cls.name}', () => {\n`;
    code += `  let instance: ${cls.name};\n\n`;

    // Setup
    if (cls.hasConstructor && cls.constructorParams) {
      const constructorArgs = cls.constructorParams
        .map((p) => this.generateTestValue(p))
        .join(', ');
      code += `  beforeEach(() => {\n`;
      code += `    instance = new ${cls.name}(${constructorArgs});\n`;
      code += `  });\n\n`;
    } else {
      code += `  beforeEach(() => {\n`;
      code += `    instance = new ${cls.name}();\n`;
      code += `  });\n\n`;
    }

    // Constructor test
    code += `  it('should instantiate correctly', () => {\n`;
    code += `    expect(instance).toBeInstanceOf(${cls.name});\n`;
    code += `  });\n\n`;

    // Generate tests for each public method
    for (const method of cls.methods) {
      if (!method.name.startsWith('_') && !method.name.startsWith('#')) {
        code += this.generateMethodTests(method, cls.name, testType);
      }
    }

    code += `});\n\n`;
    return code;
  }

  /**
   * Generate tests for a class method
   */
  private generateMethodTests(method: FunctionInfo, _className: string, _testType: string): string {
    let code = `  describe('${method.name}', () => {\n`;

    const validParams = method.parameters.map((p) => this.generateTestValue(p)).join(', ');
    const methodCall = method.isAsync
      ? `await instance.${method.name}(${validParams})`
      : `instance.${method.name}(${validParams})`;

    // Happy path
    const asyncPrefix = method.isAsync ? 'async ' : '';
    code += `    it('should execute successfully', ${asyncPrefix}() => {\n`;
    code += `      const result = ${methodCall};\n`;
    code += `      expect(result).toBeDefined();\n`;
    code += `    });\n`;

    // Error handling for non-optional params
    for (const param of method.parameters) {
      if (!param.optional) {
        const paramsWithUndefined = method.parameters
          .map((p) => (p.name === param.name ? 'undefined as any' : this.generateTestValue(p)))
          .join(', ');

        code += `\n    it('should handle invalid ${param.name}', () => {\n`;
        code += `      expect(() => instance.${method.name}(${paramsWithUndefined})).toThrow();\n`;
        code += `    });\n`;
      }
    }

    code += `  });\n\n`;
    return code;
  }

  /**
   * Generate a test value for a parameter
   */
  private generateTestValue(param: ParameterInfo): string {
    if (param.defaultValue) {
      return param.defaultValue;
    }

    const type = param.type?.toLowerCase() || 'unknown';
    const name = param.name.toLowerCase();

    // Infer from param name first
    if (name.includes('id')) return `'${faker.string.uuid()}'`;
    if (name.includes('email')) return `'${faker.internet.email()}'`;
    if (name.includes('name')) return `'${faker.person.fullName()}'`;
    if (name.includes('url')) return `'${faker.internet.url()}'`;
    if (name.includes('date')) return `new Date('${faker.date.recent().toISOString()}')`;

    // Then by type
    if (type.includes('string')) return `'${faker.lorem.word()}'`;
    if (type.includes('number')) return String(faker.number.int({ min: 1, max: 100 }));
    if (type.includes('boolean')) return 'true';
    if (type.includes('[]') || type.includes('array')) return '[]';
    if (type.includes('object') || type.includes('{')) return '{}';
    if (type.includes('function')) return '() => {}';
    if (type.includes('promise')) return 'Promise.resolve()';
    if (type.includes('date')) return 'new Date()';

    // Default
    return `mock${param.name.charAt(0).toUpperCase() + param.name.slice(1)}`;
  }

  /**
   * Generate real Mocha test code
   */
  private generateRealMochaTest(
    moduleName: string,
    importPath: string,
    testType: string,
    analysis: { functions: FunctionInfo[]; classes: ClassInfo[] },
    patterns: Pattern[]
  ): string {
    const patternComment =
      patterns.length > 0
        ? `// Applied patterns: ${patterns.map((p) => p.name).join(', ')}\n`
        : '';

    const exports: string[] = [];
    for (const fn of analysis.functions) {
      if (fn.isExported) exports.push(fn.name);
    }
    for (const cls of analysis.classes) {
      if (cls.isExported) exports.push(cls.name);
    }

    const importStatement =
      exports.length > 0
        ? `import { ${exports.join(', ')} } from '${importPath}';`
        : `import * as ${moduleName} from '${importPath}';`;

    let code = `${patternComment}import { expect } from 'chai';
${importStatement}

describe('${moduleName} - ${testType} tests', function() {
`;

    for (const fn of analysis.functions) {
      code += this.generateMochaFunctionTests(fn);
    }

    for (const cls of analysis.classes) {
      code += this.generateMochaClassTests(cls);
    }

    code += `});\n`;
    return code;
  }

  /**
   * Generate Mocha tests for a function
   */
  private generateMochaFunctionTests(fn: FunctionInfo): string {
    const validParams = fn.parameters.map((p) => this.generateTestValue(p)).join(', ');
    const fnCall = fn.isAsync ? `await ${fn.name}(${validParams})` : `${fn.name}(${validParams})`;

    let code = `  describe('${fn.name}', function() {\n`;
    code += `    it('should handle valid input', ${fn.isAsync ? 'async ' : ''}function() {\n`;
    code += `      const result = ${fnCall};\n`;
    code += `      expect(result).to.not.be.undefined;\n`;
    code += `    });\n`;
    code += `  });\n\n`;

    return code;
  }

  /**
   * Generate Mocha tests for a class
   */
  private generateMochaClassTests(cls: ClassInfo): string {
    const constructorArgs =
      cls.constructorParams?.map((p) => this.generateTestValue(p)).join(', ') || '';

    let code = `  describe('${cls.name}', function() {\n`;
    code += `    let instance;\n\n`;
    code += `    beforeEach(function() {\n`;
    code += `      instance = new ${cls.name}(${constructorArgs});\n`;
    code += `    });\n\n`;
    code += `    it('should instantiate correctly', function() {\n`;
    code += `      expect(instance).to.be.instanceOf(${cls.name});\n`;
    code += `    });\n`;

    for (const method of cls.methods) {
      if (!method.name.startsWith('_')) {
        const methodParams = method.parameters.map((p) => this.generateTestValue(p)).join(', ');
        code += `\n    it('${method.name} should work', ${method.isAsync ? 'async ' : ''}function() {\n`;
        code += `      const result = ${method.isAsync ? 'await ' : ''}instance.${method.name}(${methodParams});\n`;
        code += `      expect(result).to.not.be.undefined;\n`;
        code += `    });\n`;
      }
    }

    code += `  });\n\n`;
    return code;
  }

  /**
   * Generate real Pytest test code
   */
  private generateRealPytestTest(
    moduleName: string,
    importPath: string,
    testType: string,
    analysis: { functions: FunctionInfo[]; classes: ClassInfo[] },
    patterns: Pattern[]
  ): string {
    const patternComment =
      patterns.length > 0
        ? `# Applied patterns: ${patterns.map((p) => p.name).join(', ')}\n`
        : '';

    const exports: string[] = [];
    for (const fn of analysis.functions) {
      if (fn.isExported) exports.push(fn.name);
    }
    for (const cls of analysis.classes) {
      if (cls.isExported) exports.push(cls.name);
    }

    const pythonImport = importPath.replace(/\//g, '.').replace(/\.(ts|js)$/, '');
    const importStatement =
      exports.length > 0
        ? `from ${pythonImport} import ${exports.join(', ')}`
        : `import ${pythonImport} as ${moduleName}`;

    let code = `${patternComment}import pytest
${importStatement}


class Test${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}:
    """${testType} tests for ${moduleName}"""

`;

    for (const fn of analysis.functions) {
      code += this.generatePytestFunctionTests(fn);
    }

    for (const cls of analysis.classes) {
      code += this.generatePytestClassTests(cls);
    }

    return code;
  }

  /**
   * Generate Pytest tests for a function
   */
  private generatePytestFunctionTests(fn: FunctionInfo): string {
    const validParams = fn.parameters.map((p) => this.generatePythonTestValue(p)).join(', ');

    let code = `    def test_${fn.name}_valid_input(self):\n`;
    code += `        """Test ${fn.name} with valid input"""\n`;
    code += `        result = ${fn.name}(${validParams})\n`;
    code += `        assert result is not None\n\n`;

    return code;
  }

  /**
   * Generate Pytest tests for a class
   */
  private generatePytestClassTests(cls: ClassInfo): string {
    const constructorArgs =
      cls.constructorParams?.map((p) => this.generatePythonTestValue(p)).join(', ') || '';

    let code = `\nclass Test${cls.name}:\n`;
    code += `    """Tests for ${cls.name}"""\n\n`;
    code += `    @pytest.fixture\n`;
    code += `    def instance(self):\n`;
    code += `        return ${cls.name}(${constructorArgs})\n\n`;
    code += `    def test_instantiation(self, instance):\n`;
    code += `        assert isinstance(instance, ${cls.name})\n\n`;

    for (const method of cls.methods) {
      if (!method.name.startsWith('_')) {
        const methodParams = method.parameters.map((p) => this.generatePythonTestValue(p)).join(', ');
        code += `    def test_${method.name}(self, instance):\n`;
        code += `        result = instance.${method.name}(${methodParams})\n`;
        code += `        assert result is not None\n\n`;
      }
    }

    return code;
  }

  /**
   * Generate a Python test value for a parameter
   */
  private generatePythonTestValue(param: ParameterInfo): string {
    const type = param.type?.toLowerCase() || 'unknown';
    const name = param.name.toLowerCase();

    if (name.includes('id')) return `"${faker.string.uuid()}"`;
    if (name.includes('name')) return `"${faker.person.fullName()}"`;
    if (name.includes('email')) return `"${faker.internet.email()}"`;

    if (type.includes('str')) return `"${faker.lorem.word()}"`;
    if (type.includes('int') || type.includes('number')) {
      return String(faker.number.int({ min: 1, max: 100 }));
    }
    if (type.includes('bool')) return 'True';
    if (type.includes('list') || type.includes('[]')) return '[]';
    if (type.includes('dict') || type.includes('{}')) return '{}';

    return 'None';
  }

  private async findApplicablePatterns(
    sourceFile: string,
    requestedPatterns: string[]
  ): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    // Check memory for stored patterns
    for (const patternName of requestedPatterns) {
      const stored = await this.memory.get<Pattern>(`pattern:${patternName}`);
      if (stored) {
        patterns.push(stored);
      }
    }

    // Also search for patterns by file type
    const extension = sourceFile.split('.').pop() || '';
    const searchResults = await this.memory.search(`pattern:*:${extension}`, 5);
    for (const key of searchResults) {
      const pattern = await this.memory.get<Pattern>(key);
      if (pattern && !patterns.some((p) => p.id === pattern.id)) {
        patterns.push(pattern);
      }
    }

    return patterns;
  }

  private generateStubTestCode(
    sourceFile: string,
    testType: 'unit' | 'integration' | 'e2e',
    framework: string,
    patterns: Pattern[]
  ): string {
    const moduleName = this.extractModuleName(sourceFile);
    const importPath = this.getImportPath(sourceFile);

    // Generate framework-specific test template
    switch (framework) {
      case 'jest':
      case 'vitest':
        return this.generateJestVitestTest(moduleName, importPath, testType, patterns);
      case 'mocha':
        return this.generateMochaTest(moduleName, importPath, testType, patterns);
      case 'pytest':
        return this.generatePytestTest(moduleName, importPath, testType, patterns);
      default:
        return this.generateJestVitestTest(moduleName, importPath, testType, patterns);
    }
  }

  private generateJestVitestTest(
    moduleName: string,
    importPath: string,
    testType: string,
    patterns: Pattern[]
  ): string {
    const patternComment =
      patterns.length > 0
        ? `// Applied patterns: ${patterns.map((p) => p.name).join(', ')}\n`
        : '';

    return `${patternComment}import { ${moduleName} } from '${importPath}';

describe('${moduleName}', () => {
  describe('${testType} tests', () => {
    // TODO: AI-generated test implementations

    it('should be defined', () => {
      expect(${moduleName}).toBeDefined();
    });

    it('should handle basic operations', () => {
      // Stub: Replace with actual test logic
      expect(true).toBe(true);
    });

    it('should handle edge cases', () => {
      // Stub: Add edge case tests
      expect(true).toBe(true);
    });

    it('should handle error conditions', () => {
      // Stub: Add error handling tests
      expect(true).toBe(true);
    });
  });
});
`;
  }

  private generateMochaTest(
    moduleName: string,
    importPath: string,
    testType: string,
    patterns: Pattern[]
  ): string {
    const patternComment =
      patterns.length > 0
        ? `// Applied patterns: ${patterns.map((p) => p.name).join(', ')}\n`
        : '';

    return `${patternComment}import { expect } from 'chai';
import { ${moduleName} } from '${importPath}';

describe('${moduleName}', function() {
  describe('${testType} tests', function() {
    it('should be defined', function() {
      expect(${moduleName}).to.not.be.undefined;
    });

    it('should handle basic operations', function() {
      expect(true).to.be.true;
    });
  });
});
`;
  }

  private generatePytestTest(
    moduleName: string,
    importPath: string,
    testType: string,
    patterns: Pattern[]
  ): string {
    const patternComment =
      patterns.length > 0
        ? `# Applied patterns: ${patterns.map((p) => p.name).join(', ')}\n`
        : '';

    return `${patternComment}import pytest
from ${importPath} import ${moduleName}


class Test${moduleName}:
    """${testType} tests for ${moduleName}"""

    def test_is_defined(self):
        assert ${moduleName} is not None

    def test_basic_operations(self):
        # Stub: Replace with actual test logic
        assert True

    def test_edge_cases(self):
        # Stub: Add edge case tests
        assert True
`;
  }

  private async generateRedPhaseTest(
    feature: string,
    behavior: string,
    _framework: string
  ): Promise<TDDResult> {
    // Generate TDD RED phase: failing test that defines expected behavior
    const testCode = `describe('${feature}', () => {
  it('${behavior}', () => {
    // Red phase: This test should fail initially
    const result = ${this.camelCase(feature)}();
    expect(result).toBeDefined();
    // TODO: Add specific assertions for the behavior
  });
});`;

    return {
      phase: 'red',
      testCode,
      nextStep: 'Write the minimal implementation to make this test pass',
    };
  }

  private async generateGreenPhaseCode(
    feature: string,
    behavior: string,
    _framework: string
  ): Promise<TDDResult> {
    // Generate TDD GREEN phase: minimal implementation to pass the test
    const implementationCode = `/**
 * ${feature}
 * Behavior: ${behavior}
 */
export function ${this.camelCase(feature)}() {
  // Minimal implementation to pass the test
  // TODO: Replace with actual implementation
  return {};
}`;

    return {
      phase: 'green',
      implementationCode,
      nextStep: 'Refactor the code while keeping tests green',
    };
  }

  private async generateRefactoringSuggestions(
    _feature: string,
    _behavior: string
  ): Promise<TDDResult> {
    return {
      phase: 'refactor',
      refactoringChanges: [
        'Extract common logic into helper functions',
        'Apply single responsibility principle',
        'Consider adding type safety improvements',
        'Review naming conventions',
        'Optimize performance if needed',
      ],
      nextStep: 'Apply refactoring changes and ensure all tests still pass',
    };
  }

  private generatePropertyTestCode(
    funcName: string,
    property: string,
    _constraints: Record<string, unknown>
  ): string {
    return `import * as fc from 'fast-check';

describe('${funcName} property tests', () => {
  it('${property}', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = ${funcName}(input);
        // Property: ${property}
        // TODO: Implement property assertion
        return result !== undefined;
      })
    );
  });
});`;
  }

  private inferGenerators(
    property: string,
    constraints: Record<string, unknown>
  ): string[] {
    const generators: string[] = [];
    const propertyLower = property.toLowerCase();

    // Analyze property description to infer appropriate generators
    // String-related properties
    if (
      propertyLower.includes('string') ||
      propertyLower.includes('text') ||
      propertyLower.includes('name') ||
      propertyLower.includes('email')
    ) {
      if (constraints.minLength || constraints.maxLength) {
        const min = constraints.minLength ?? 0;
        const max = constraints.maxLength ?? 100;
        generators.push(`fc.string({ minLength: ${min}, maxLength: ${max} })`);
      } else {
        generators.push('fc.string()');
      }
      if (propertyLower.includes('email')) {
        generators.push('fc.emailAddress()');
      }
    }

    // Number-related properties
    if (
      propertyLower.includes('number') ||
      propertyLower.includes('count') ||
      propertyLower.includes('amount') ||
      propertyLower.includes('integer') ||
      propertyLower.includes('positive') ||
      propertyLower.includes('negative')
    ) {
      if (propertyLower.includes('positive')) {
        generators.push('fc.nat()');
      } else if (propertyLower.includes('negative')) {
        generators.push('fc.integer({ max: -1 })');
      } else if (constraints.min !== undefined || constraints.max !== undefined) {
        const min = constraints.min ?? Number.MIN_SAFE_INTEGER;
        const max = constraints.max ?? Number.MAX_SAFE_INTEGER;
        generators.push(`fc.integer({ min: ${min}, max: ${max} })`);
      } else {
        generators.push('fc.integer()');
      }
      if (propertyLower.includes('float') || propertyLower.includes('decimal')) {
        generators.push('fc.float()');
      }
    }

    // Boolean properties
    if (propertyLower.includes('boolean') || propertyLower.includes('flag')) {
      generators.push('fc.boolean()');
    }

    // Array-related properties
    if (
      propertyLower.includes('array') ||
      propertyLower.includes('list') ||
      propertyLower.includes('collection')
    ) {
      const itemType = constraints.itemType as string || 'anything';
      const itemGen = this.getGeneratorForType(itemType);
      if (constraints.minItems || constraints.maxItems) {
        const min = constraints.minItems ?? 0;
        const max = constraints.maxItems ?? 10;
        generators.push(`fc.array(${itemGen}, { minLength: ${min}, maxLength: ${max} })`);
      } else {
        generators.push(`fc.array(${itemGen})`);
      }
    }

    // Object-related properties
    if (propertyLower.includes('object') || propertyLower.includes('record')) {
      generators.push('fc.object()');
      generators.push('fc.dictionary(fc.string(), fc.anything())');
    }

    // Date-related properties
    if (propertyLower.includes('date') || propertyLower.includes('time')) {
      generators.push('fc.date()');
    }

    // UUID properties
    if (propertyLower.includes('uuid') || propertyLower.includes('id')) {
      generators.push('fc.uuid()');
    }

    // Default fallback if no specific type detected
    if (generators.length === 0) {
      generators.push('fc.anything()');
    }

    return generators;
  }

  private getGeneratorForType(type: string): string {
    const typeGenerators: Record<string, string> = {
      string: 'fc.string()',
      number: 'fc.integer()',
      integer: 'fc.integer()',
      float: 'fc.float()',
      boolean: 'fc.boolean()',
      date: 'fc.date()',
      uuid: 'fc.uuid()',
      anything: 'fc.anything()',
    };
    return typeGenerators[type.toLowerCase()] || 'fc.anything()';
  }

  private collectArbitraries(tests: { generators: string[] }[]): string[] {
    const arbitraries = new Set<string>();
    for (const test of tests) {
      test.generators.forEach((g) => arbitraries.add(g));
    }
    return Array.from(arbitraries);
  }

  private generateRecordFromSchema(
    schema: Record<string, unknown>,
    seed: number,
    locale: string
  ): Record<string, unknown> {
    // Set faker locale and seed for reproducibility
    faker.seed(seed);
    if (locale && locale !== 'en') {
      // Note: faker v8+ uses different locale handling
      // For now, we use the default locale
    }

    const record: Record<string, unknown> = {};

    for (const [key, fieldDef] of Object.entries(schema)) {
      record[key] = this.generateValueForField(key, fieldDef, seed);
    }

    return record;
  }

  private generateValueForField(
    fieldName: string,
    fieldDef: unknown,
    _seed: number
  ): unknown {
    // Handle simple type strings
    if (typeof fieldDef === 'string') {
      return this.generateValueForType(fieldDef, fieldName);
    }

    // Handle complex field definitions
    if (typeof fieldDef === 'object' && fieldDef !== null) {
      const field = fieldDef as SchemaField;

      // Use explicit faker method if specified
      if (field.faker) {
        return this.callFakerMethod(field.faker);
      }

      return this.generateValueForType(field.type, fieldName, field);
    }

    return null;
  }

  private generateValueForType(
    type: string,
    fieldName: string,
    options?: SchemaField
  ): unknown {
    const normalizedType = type.toLowerCase();

    // Try to infer the best faker method based on field name and type
    switch (normalizedType) {
      case 'string':
        return this.generateStringValue(fieldName, options);
      case 'number':
      case 'int':
      case 'integer':
        return this.generateNumberValue(options);
      case 'float':
      case 'decimal':
        return faker.number.float({ min: options?.min ?? 0, max: options?.max ?? 1000, fractionDigits: 2 });
      case 'boolean':
      case 'bool':
        return faker.datatype.boolean();
      case 'date':
      case 'datetime':
        return faker.date.recent().toISOString();
      case 'email':
        return faker.internet.email();
      case 'uuid':
      case 'id':
        return faker.string.uuid();
      case 'url':
        return faker.internet.url();
      case 'phone':
        return faker.phone.number();
      case 'address':
        return this.generateAddress();
      case 'name':
      case 'fullname':
        return faker.person.fullName();
      case 'firstname':
        return faker.person.firstName();
      case 'lastname':
        return faker.person.lastName();
      case 'username':
        return faker.internet.username();
      case 'password':
        return faker.internet.password();
      case 'company':
        return faker.company.name();
      case 'jobtitle':
        return faker.person.jobTitle();
      case 'text':
      case 'paragraph':
        return faker.lorem.paragraph();
      case 'sentence':
        return faker.lorem.sentence();
      case 'word':
      case 'words':
        return faker.lorem.word();
      case 'avatar':
      case 'image':
        return faker.image.avatar();
      case 'color':
        return faker.color.rgb();
      case 'ipaddress':
      case 'ip':
        return faker.internet.ipv4();
      case 'mac':
        return faker.internet.mac();
      case 'latitude':
        return faker.location.latitude();
      case 'longitude':
        return faker.location.longitude();
      case 'country':
        return faker.location.country();
      case 'city':
        return faker.location.city();
      case 'zipcode':
      case 'postalcode':
        return faker.location.zipCode();
      case 'creditcard':
        return faker.finance.creditCardNumber();
      case 'currency':
        return faker.finance.currencyCode();
      case 'amount':
      case 'price':
        return faker.finance.amount();
      case 'json':
      case 'object':
        return { key: faker.lorem.word(), value: faker.lorem.sentence() };
      case 'array':
        return [faker.lorem.word(), faker.lorem.word(), faker.lorem.word()];
      case 'enum':
        if (options?.enum && options.enum.length > 0) {
          return faker.helpers.arrayElement(options.enum);
        }
        return faker.lorem.word();
      default:
        // Try to infer from field name
        return this.inferValueFromFieldName(fieldName);
    }
  }

  private generateStringValue(fieldName: string, options?: SchemaField): string {
    const lowerName = fieldName.toLowerCase();

    // Infer type from field name
    if (lowerName.includes('email')) return faker.internet.email();
    if (lowerName.includes('name') && lowerName.includes('first')) return faker.person.firstName();
    if (lowerName.includes('name') && lowerName.includes('last')) return faker.person.lastName();
    if (lowerName.includes('name')) return faker.person.fullName();
    if (lowerName.includes('phone')) return faker.phone.number();
    if (lowerName.includes('address')) return faker.location.streetAddress();
    if (lowerName.includes('city')) return faker.location.city();
    if (lowerName.includes('country')) return faker.location.country();
    if (lowerName.includes('zip') || lowerName.includes('postal')) return faker.location.zipCode();
    if (lowerName.includes('url') || lowerName.includes('website')) return faker.internet.url();
    if (lowerName.includes('username') || lowerName.includes('user')) return faker.internet.username();
    if (lowerName.includes('password')) return faker.internet.password();
    if (lowerName.includes('description') || lowerName.includes('bio')) return faker.lorem.paragraph();
    if (lowerName.includes('title')) return faker.lorem.sentence();
    if (lowerName.includes('company')) return faker.company.name();
    if (lowerName.includes('job')) return faker.person.jobTitle();
    if (lowerName.includes('avatar') || lowerName.includes('image')) return faker.image.avatar();

    // Apply pattern if provided
    if (options?.pattern) {
      return faker.helpers.fromRegExp(options.pattern);
    }

    // Default string generation
    return faker.lorem.words(3);
  }

  private generateNumberValue(options?: SchemaField): number {
    const min = options?.min ?? 0;
    const max = options?.max ?? 10000;
    return faker.number.int({ min, max });
  }

  private generateAddress(): Record<string, string> {
    return {
      street: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state(),
      zipCode: faker.location.zipCode(),
      country: faker.location.country(),
    };
  }

  private inferValueFromFieldName(fieldName: string): unknown {
    const lowerName = fieldName.toLowerCase();

    if (lowerName.includes('id')) return faker.string.uuid();
    if (lowerName.includes('email')) return faker.internet.email();
    if (lowerName.includes('name')) return faker.person.fullName();
    if (lowerName.includes('phone')) return faker.phone.number();
    if (lowerName.includes('date') || lowerName.includes('time')) return faker.date.recent().toISOString();
    if (lowerName.includes('url')) return faker.internet.url();
    if (lowerName.includes('count') || lowerName.includes('amount')) return faker.number.int({ min: 0, max: 100 });
    if (lowerName.includes('price')) return faker.finance.amount();
    if (lowerName.includes('active') || lowerName.includes('enabled') || lowerName.includes('is')) {
      return faker.datatype.boolean();
    }

    // Default to a random string
    return faker.lorem.word();
  }

  private callFakerMethod(methodPath: string): unknown {
    try {
      const parts = methodPath.split('.');
      let result: unknown = faker;

      for (const part of parts) {
        if (result && typeof result === 'object' && part in result) {
          const next = (result as Record<string, unknown>)[part];
          if (typeof next === 'function') {
            result = (next as () => unknown)();
          } else {
            result = next;
          }
        } else {
          return faker.lorem.word();
        }
      }

      return result;
    } catch {
      return faker.lorem.word();
    }
  }

  private linkRelatedRecords(
    records: unknown[],
    schema: Record<string, unknown>
  ): void {
    // Find fields with references and link them
    const referenceFields: Array<{ field: string; reference: string }> = [];

    for (const [key, fieldDef] of Object.entries(schema)) {
      if (typeof fieldDef === 'object' && fieldDef !== null) {
        const field = fieldDef as SchemaField;
        if (field.reference) {
          referenceFields.push({ field: key, reference: field.reference });
        }
      }
    }

    // If we have reference fields, link records
    if (referenceFields.length > 0) {
      for (let i = 0; i < records.length; i++) {
        const record = records[i] as Record<string, unknown>;
        for (const { field, reference } of referenceFields) {
          // Link to a random previous record's ID or create a new one
          if (i > 0 && reference === 'id') {
            const prevRecord = records[Math.floor(Math.random() * i)] as Record<string, unknown>;
            record[field] = prevRecord['id'] ?? faker.string.uuid();
          } else {
            record[field] = faker.string.uuid();
          }
        }
      }
    }
  }

  private async generateTestForLines(
    file: string,
    lines: number[],
    framework: string
  ): Promise<GeneratedTest | null> {
    if (lines.length === 0) return null;

    const testId = uuidv4();
    const testFile = this.getTestFilePath(file, framework);

    return {
      id: testId,
      name: `Coverage test for lines ${lines[0]}-${lines[lines.length - 1]}`,
      sourceFile: file,
      testFile,
      testCode: `// Generated to cover lines ${lines.join(', ')}\nit('should cover lines ${lines[0]}-${lines[lines.length - 1]}', () => {\n  // TODO: Implement coverage test\n});`,
      type: 'unit',
      assertions: 1,
    };
  }

  private groupConsecutiveLines(lines: number[]): number[][] {
    if (lines.length === 0) return [];

    const sorted = [...lines].sort((a, b) => a - b);
    const groups: number[][] = [[sorted[0]]];

    for (let i = 1; i < sorted.length; i++) {
      const currentGroup = groups[groups.length - 1];
      if (sorted[i] - currentGroup[currentGroup.length - 1] <= 3) {
        currentGroup.push(sorted[i]);
      } else {
        groups.push([sorted[i]]);
      }
    }

    return groups;
  }

  private getTestFilePath(sourceFile: string, framework: string): string {
    const ext = sourceFile.split('.').pop() || 'ts';
    const base = sourceFile.replace(`.${ext}`, '');

    if (framework === 'pytest') {
      return `test_${base.split('/').pop()}.py`;
    }

    return `${base}.test.${ext}`;
  }

  private extractModuleName(sourceFile: string): string {
    const filename = sourceFile.split('/').pop() || sourceFile;
    return filename.replace(/\.(ts|js|tsx|jsx|py)$/, '');
  }

  private getImportPath(sourceFile: string): string {
    return sourceFile.replace(/\.(ts|js|tsx|jsx)$/, '');
  }

  private countAssertions(testCode: string): number {
    const assertPatterns = [
      /expect\(/g,
      /assert/g,
      /\.to\./g,
      /\.toBe/g,
      /\.toEqual/g,
    ];

    let count = 0;
    for (const pattern of assertPatterns) {
      const matches = testCode.match(pattern);
      count += matches ? matches.length : 0;
    }

    return Math.max(1, count);
  }

  private estimateCoverage(tests: GeneratedTest[], target: number): number {
    // Estimate coverage based on test characteristics
    const totalAssertions = tests.reduce((sum, t) => sum + t.assertions, 0);
    const totalTests = tests.length;

    // Base coverage from test count (each test covers ~3-5% typically)
    const testBasedCoverage = totalTests * 4;

    // Additional coverage from assertions (each assertion ~1-2%)
    const assertionCoverage = totalAssertions * 1.5;

    // Test type multipliers (integration tests cover more)
    const typeMultiplier = tests.reduce((mult, t) => {
      if (t.type === 'integration') return mult + 0.1;
      if (t.type === 'e2e') return mult + 0.15;
      return mult;
    }, 1);

    // Calculate estimated coverage with diminishing returns
    const rawEstimate = (testBasedCoverage + assertionCoverage) * typeMultiplier;
    const diminishedEstimate = rawEstimate * (1 - rawEstimate / 200); // Diminishing returns above 100%

    // Cap at target and round
    const estimatedCoverage = Math.min(target, Math.max(0, diminishedEstimate));
    return Math.round(estimatedCoverage * 10) / 10;
  }

  private camelCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
      .replace(/^./, (chr) => chr.toLowerCase());
  }

  private async storeGenerationMetadata(
    tests: GeneratedTest[],
    patterns: string[]
  ): Promise<void> {
    const metadata = {
      generatedAt: new Date().toISOString(),
      testCount: tests.length,
      patterns,
      testIds: tests.map((t) => t.id),
    };

    await this.memory.set(
      `test-generation:metadata:${Date.now()}`,
      metadata,
      { namespace: 'test-generation', ttl: 86400 * 7 } // 7 days
    );
  }
}
