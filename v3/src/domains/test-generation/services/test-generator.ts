/**
 * Agentic QE v3 - Test Generation Service
 * Implements ITestGenerationService for AI-powered test generation
 *
 * Uses Strategy Pattern generators for framework-specific code generation
 * Uses TypeScript AST parser for code analysis
 * Delegates to specialized services for TDD, property tests, and test data
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
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
import type {
  TestFramework,
  TestType,
  FunctionInfo,
  ClassInfo,
  ParameterInfo,
  PropertyInfo,
  CodeAnalysis,
  TestGenerationContext,
} from '../interfaces';
import { TestGeneratorFactory } from '../factories/test-generator-factory';
import type { ITestGeneratorFactory } from '../interfaces';
import { TDDGeneratorService, type ITDDGeneratorService } from './tdd-generator';
import { PropertyTestGeneratorService, type IPropertyTestGeneratorService } from './property-test-generator';
import { TestDataGeneratorService, type ITestDataGeneratorService } from './test-data-generator';

// ADR-051: LLM Router for AI-enhanced test generation
import type { HybridRouter, ChatResponse } from '../../../shared/llm';

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
  defaultFramework: TestFramework;
  maxTestsPerFile: number;
  coverageTargetDefault: number;
  enableAIGeneration: boolean;
  /** ADR-051: Enable LLM enhancement for better test suggestions */
  enableLLMEnhancement: boolean;
  /** ADR-051: Model tier for LLM calls (1=Haiku, 2=Sonnet, 4=Opus) */
  llmModelTier: number;
  /** ADR-051: Max tokens for LLM responses */
  llmMaxTokens: number;
}

const DEFAULT_CONFIG: TestGeneratorConfig = {
  defaultFramework: 'vitest',
  maxTestsPerFile: 50,
  coverageTargetDefault: 80,
  enableAIGeneration: true,
  enableLLMEnhancement: true, // On by default - opt-out
  llmModelTier: 2, // Sonnet by default
  llmMaxTokens: 2048,
};

/**
 * Dependencies for TestGeneratorService
 * Enables dependency injection and testing
 */
export interface TestGeneratorDependencies {
  memory: MemoryBackend;
  generatorFactory?: ITestGeneratorFactory;
  tddGenerator?: ITDDGeneratorService;
  propertyTestGenerator?: IPropertyTestGeneratorService;
  testDataGenerator?: ITestDataGeneratorService;
  /** ADR-051: Optional LLM router for AI-enhanced test generation */
  llmRouter?: HybridRouter;
}

/**
 * Test Generation Service Implementation
 * Uses Strategy Pattern generators for framework-specific test generation
 * Delegates TDD, property testing, and test data to specialized services
 *
 * ADR-XXX: Refactored to use Dependency Injection for better testability and flexibility
 * ADR-051: Added LLM enhancement for AI-powered test suggestions
 */
export class TestGeneratorService implements ITestGenerationService {
  private readonly config: TestGeneratorConfig;
  private readonly memory: MemoryBackend;
  private readonly generatorFactory: ITestGeneratorFactory;
  private readonly tddGenerator: ITDDGeneratorService;
  private readonly propertyTestGenerator: IPropertyTestGeneratorService;
  private readonly testDataGenerator: ITestDataGeneratorService;
  private readonly llmRouter?: HybridRouter;

  constructor(
    dependencies: TestGeneratorDependencies,
    config: Partial<TestGeneratorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memory = dependencies.memory;
    this.generatorFactory = dependencies.generatorFactory || new TestGeneratorFactory();
    this.tddGenerator = dependencies.tddGenerator || new TDDGeneratorService();
    this.propertyTestGenerator = dependencies.propertyTestGenerator || new PropertyTestGeneratorService();
    this.testDataGenerator = dependencies.testDataGenerator || new TestDataGeneratorService();
    this.llmRouter = dependencies.llmRouter;
  }

  // ============================================================================
  // ADR-051: LLM Enhancement Methods
  // ============================================================================

  /**
   * Check if LLM enhancement is available and enabled
   */
  private isLLMEnhancementAvailable(): boolean {
    return this.config.enableLLMEnhancement && this.llmRouter !== undefined;
  }

  /**
   * Get model ID for the configured tier
   */
  private getModelForTier(tier: number): string {
    switch (tier) {
      case 1: return 'claude-3-5-haiku-20241022';
      case 2: return 'claude-sonnet-4-20250514';
      case 3: return 'claude-sonnet-4-20250514';
      case 4: return 'claude-opus-4-5-20251101';
      default: return 'claude-sonnet-4-20250514';
    }
  }

  /**
   * Enhance generated test code using LLM
   * Adds edge cases, improves assertions, and adds documentation
   */
  private async enhanceTestWithLLM(
    testCode: string,
    sourceCode: string,
    analysis: CodeAnalysis | null
  ): Promise<string> {
    if (!this.llmRouter) return testCode;

    try {
      const prompt = this.buildTestEnhancementPrompt(testCode, sourceCode, analysis);
      const modelId = this.getModelForTier(this.config.llmModelTier);

      const response: ChatResponse = await this.llmRouter.chat({
        messages: [
          {
            role: 'system',
            content: `You are an expert test engineer. Enhance the provided test code by:
1. Adding edge case tests (null, undefined, empty, boundary values)
2. Improving assertion specificity
3. Adding descriptive test names
4. Adding JSDoc comments explaining test purpose
Return ONLY the enhanced test code, no explanations.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: modelId,
        maxTokens: this.config.llmMaxTokens,
        temperature: 0.3, // Low temperature for consistent code generation
      });

      if (response.content && response.content.length > 0) {
        // Extract code from response, handling potential markdown fences
        let enhancedCode = response.content;
        const codeMatch = enhancedCode.match(/```(?:typescript|javascript|ts|js)?\n?([\s\S]*?)```/);
        if (codeMatch) {
          enhancedCode = codeMatch[1].trim();
        }
        return enhancedCode || testCode;
      }

      return testCode;
    } catch (error) {
      console.warn('[TestGenerator] LLM enhancement failed, using original:', error);
      return testCode;
    }
  }

  /**
   * Build prompt for test enhancement
   */
  private buildTestEnhancementPrompt(
    testCode: string,
    sourceCode: string,
    analysis: CodeAnalysis | null
  ): string {
    let prompt = `## Source Code to Test:\n\`\`\`typescript\n${sourceCode}\n\`\`\`\n\n`;
    prompt += `## Current Test Code:\n\`\`\`typescript\n${testCode}\n\`\`\`\n\n`;

    if (analysis) {
      if (analysis.functions.length > 0) {
        prompt += `## Functions to cover:\n`;
        for (const fn of analysis.functions) {
          prompt += `- ${fn.name}(${fn.parameters.map(p => `${p.name}: ${p.type || 'unknown'}`).join(', ')})`;
          if (fn.returnType) prompt += ` => ${fn.returnType}`;
          prompt += ` (complexity: ${fn.complexity})\n`;
        }
      }

      if (analysis.classes.length > 0) {
        prompt += `## Classes to cover:\n`;
        for (const cls of analysis.classes) {
          prompt += `- ${cls.name} with methods: ${cls.methods.map(m => m.name).join(', ')}\n`;
        }
      }
    }

    prompt += `\n## Requirements:\n`;
    prompt += `1. Add tests for edge cases (null, undefined, empty inputs, boundary values)\n`;
    prompt += `2. Improve assertion specificity (use toEqual, toContain, etc. appropriately)\n`;
    prompt += `3. Add descriptive test names that explain what is being tested\n`;
    prompt += `4. Add error handling tests if applicable\n`;
    prompt += `5. Keep the test framework style consistent\n`;

    return prompt;
  }

  /**
   * Generate test suggestions using LLM based on code analysis
   */
  private async generateLLMTestSuggestions(
    sourceCode: string,
    analysis: CodeAnalysis | null,
    framework: TestFramework
  ): Promise<string[]> {
    if (!this.llmRouter) return [];

    try {
      const modelId = this.getModelForTier(this.config.llmModelTier);

      const response: ChatResponse = await this.llmRouter.chat({
        messages: [
          {
            role: 'system',
            content: `You are an expert test engineer. Analyze the code and suggest specific test cases.
Return a JSON array of test suggestions, each with: { "name": "test name", "description": "what to test", "type": "unit|integration|edge" }`,
          },
          {
            role: 'user',
            content: `Analyze this ${framework} code and suggest test cases:\n\`\`\`typescript\n${sourceCode}\n\`\`\``,
          },
        ],
        model: modelId,
        maxTokens: 1024,
        temperature: 0.5,
      });

      if (response.content) {
        try {
          // Try to parse JSON from response
          const jsonMatch = response.content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const suggestions = JSON.parse(jsonMatch[0]);
            return suggestions.map((s: { name: string }) => s.name);
          }
        } catch {
          // Parse failure - return empty suggestions
        }
      }

      return [];
    } catch (error) {
      console.warn('[TestGenerator] LLM suggestion generation failed:', error);
      return [];
    }
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

      for (const sourceFile of sourceFiles) {
        const fileTests = await this.generateTestsForFile(
          sourceFile,
          testType,
          framework as TestFramework,
          patterns
        );

        if (fileTests.success) {
          tests.push(...fileTests.value.tests);
          patternsUsed.push(...fileTests.value.patternsUsed);
        }
      }

      const coverageEstimate = this.estimateCoverage(tests, coverageTarget);
      await this.storeGenerationMetadata(tests, patternsUsed);

      return ok({
        tests,
        coverageEstimate,
        patternsUsed: Array.from(new Set(patternsUsed)),
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

      const tests: GeneratedTest[] = [];
      const lineGroups = this.groupConsecutiveLines(uncoveredLines);
      const frameworkType = this.generatorFactory.supports(framework)
        ? framework as TestFramework
        : this.config.defaultFramework;

      for (const group of lineGroups) {
        const test = await this.generateTestForLines(file, group, frameworkType);
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
   * Generate tests following TDD workflow - delegates to TDDGeneratorService
   */
  async generateTDDTests(request: TDDRequest): Promise<Result<TDDResult, Error>> {
    try {
      const result = await this.tddGenerator.generateTDDTests(request);
      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate property-based tests - delegates to PropertyTestGeneratorService
   */
  async generatePropertyTests(request: PropertyTestRequest): Promise<Result<PropertyTests, Error>> {
    try {
      const result = await this.propertyTestGenerator.generatePropertyTests(request);
      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate test data based on schema - delegates to TestDataGeneratorService
   */
  async generateTestData(request: TestDataRequest): Promise<Result<TestData, Error>> {
    try {
      const result = await this.testDataGenerator.generateTestData(request);
      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Helper Methods - Core Test Generation
  // ============================================================================

  private async generateTestsForFile(
    sourceFile: string,
    testType: TestType,
    framework: TestFramework,
    patterns: string[]
  ): Promise<Result<{ tests: GeneratedTest[]; patternsUsed: string[] }, Error>> {
    const testFile = this.getTestFilePath(sourceFile, framework);
    const patternsUsed: string[] = [];

    const applicablePatterns = await this.findApplicablePatterns(sourceFile, patterns);
    patternsUsed.push(...applicablePatterns.map((p) => p.name));

    let codeAnalysis: CodeAnalysis | null = null;
    let sourceContent = '';
    try {
      sourceContent = fs.readFileSync(sourceFile, 'utf-8');
      codeAnalysis = this.analyzeSourceCode(sourceContent, sourceFile);
    } catch {
      // File doesn't exist or can't be read - use stub generation
    }

    const generator = this.generatorFactory.create(framework);
    const moduleName = this.extractModuleName(sourceFile);
    const importPath = this.getImportPath(sourceFile);

    const context: TestGenerationContext = {
      moduleName,
      importPath,
      testType,
      patterns: applicablePatterns,
      analysis: codeAnalysis ?? undefined,
    };

    let testCode = generator.generateTests(context);

    // ADR-051: Enhance with LLM if enabled and available
    if (this.isLLMEnhancementAvailable() && sourceContent) {
      testCode = await this.enhanceTestWithLLM(testCode, sourceContent, codeAnalysis);
    }

    const test: GeneratedTest = {
      id: uuidv4(),
      name: `${moduleName} tests`,
      sourceFile,
      testFile,
      testCode,
      type: testType,
      assertions: this.countAssertions(testCode),
      // ADR-051: Mark if LLM-enhanced
      llmEnhanced: this.isLLMEnhancementAvailable(),
    };

    return ok({ tests: [test], patternsUsed });
  }

  private async generateTestForLines(
    file: string,
    lines: number[],
    framework: TestFramework
  ): Promise<GeneratedTest | null> {
    if (lines.length === 0) return null;

    const testId = uuidv4();
    const testFile = this.getTestFilePath(file, framework);
    const moduleName = this.extractModuleName(file);
    const importPath = this.getImportPath(file);

    const generator = this.generatorFactory.create(framework);
    const testCode = generator.generateCoverageTests(moduleName, importPath, lines);

    return {
      id: testId,
      name: `Coverage test for lines ${lines[0]}-${lines[lines.length - 1]}`,
      sourceFile: file,
      testFile,
      testCode,
      type: 'unit',
      assertions: this.countAssertions(testCode),
    };
  }

  // ============================================================================
  // Private Helper Methods - AST Analysis
  // ============================================================================

  private analyzeSourceCode(content: string, fileName: string): CodeAnalysis {
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
      if (ts.isFunctionDeclaration(node) && node.name) {
        functions.push(this.extractFunctionInfo(node, sourceFile));
      } else if (ts.isVariableStatement(node)) {
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
      } else if (ts.isClassDeclaration(node) && node.name) {
        classes.push(this.extractClassInfo(node, sourceFile));
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return { functions, classes };
  }

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

  // ============================================================================
  // Private Helper Methods - Utility Functions
  // ============================================================================

  private async findApplicablePatterns(
    sourceFile: string,
    requestedPatterns: string[]
  ): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    for (const patternName of requestedPatterns) {
      const stored = await this.memory.get<Pattern>(`pattern:${patternName}`);
      if (stored) {
        patterns.push(stored);
      }
    }

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

  private getTestFilePath(sourceFile: string, framework: TestFramework): string {
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
    const totalAssertions = tests.reduce((sum, t) => sum + t.assertions, 0);
    const totalTests = tests.length;

    const testBasedCoverage = totalTests * 4;
    const assertionCoverage = totalAssertions * 1.5;

    const typeMultiplier = tests.reduce((mult, t) => {
      if (t.type === 'integration') return mult + 0.1;
      if (t.type === 'e2e') return mult + 0.15;
      return mult;
    }, 1);

    const rawEstimate = (testBasedCoverage + assertionCoverage) * typeMultiplier;
    const diminishedEstimate = rawEstimate * (1 - rawEstimate / 200);

    const estimatedCoverage = Math.min(target, Math.max(0, diminishedEstimate));
    return Math.round(estimatedCoverage * 10) / 10;
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
      { namespace: 'test-generation', ttl: 86400 * 7 }
    );
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a TestGeneratorService instance with default dependencies
 * Maintains backward compatibility with existing code
 *
 * @param memory - Memory backend for pattern storage
 * @param config - Optional configuration overrides
 * @returns Configured TestGeneratorService instance
 */
export function createTestGeneratorService(
  memory: MemoryBackend,
  config: Partial<TestGeneratorConfig> = {}
): TestGeneratorService {
  return new TestGeneratorService({ memory }, config);
}

/**
 * Create a TestGeneratorService instance with custom dependencies
 * Used for testing or when custom implementations are needed
 *
 * @param dependencies - All service dependencies
 * @param config - Optional configuration overrides
 * @returns Configured TestGeneratorService instance
 */
export function createTestGeneratorServiceWithDependencies(
  dependencies: TestGeneratorDependencies,
  config: Partial<TestGeneratorConfig> = {}
): TestGeneratorService {
  return new TestGeneratorService(dependencies, config);
}
