/**
 * TDD Pair Programmer Agent
 * Intelligent pair programmer supporting both London and Chicago schools of TDD
 */

import { QEAgent, AgentContext, AgentExecutionResult } from '../base/QEAgent';
import { QEAgentConfig } from '../../types';
import { QEMemory } from '../../memory/QEMemory';
import { HookManager } from '../../hooks';
import { Logger } from '../../utils/Logger';

/**
 * TDD styles supported by the agent
 */
export type TDDStyle = 'london' | 'chicago' | 'auto';

/**
 * Test suggestion from the pair programmer
 */
export interface TestSuggestion {
  id: string;
  description: string;
  testCode: string;
  reasoning: string;
  category: 'red' | 'green' | 'refactor';
  difficulty: 'simple' | 'medium' | 'complex';
  estimatedTime: number; // in minutes
  dependencies: string[];
  followUpTests: string[];
}

/**
 * Code analysis result
 */
export interface CodeAnalysis {
  coverage: {
    percentage: number;
    missingAreas: string[];
    redundantTests: string[];
  };
  complexity: {
    cyclomatic: number;
    cognitive: number;
    suggestions: string[];
  };
  testability: {
    score: number; // 0-1 scale
    issues: string[];
    improvements: string[];
  };
  smells: {
    code: string[];
    test: string[];
  };
}

/**
 * Refactoring suggestion
 */
export interface RefactoringSuggestion {
  id: string;
  type: 'extract_method' | 'extract_class' | 'rename' | 'simplify' | 'remove_duplication';
  description: string;
  target: string; // code location
  before: string;
  after: string;
  reasoning: string;
  safetyLevel: 'safe' | 'moderate' | 'risky';
  testImpact: string[];
}

/**
 * TDD cycle tracking
 */
export interface TDDCycle {
  id: string;
  phase: 'red' | 'green' | 'refactor';
  startTime: Date;
  endTime?: Date;
  testFile: string;
  codeFile: string;
  description: string;
  success: boolean;
  notes: string[];
  metrics: {
    testExecutionTime: number;
    codeChanges: number;
    testChanges: number;
  };
}

/**
 * Missing test case identification
 */
export interface MissingTestCase {
  id: string;
  area: string;
  scenario: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  type: 'edge_case' | 'error_handling' | 'integration' | 'performance' | 'security';
  suggestedTest: string;
  reasoning: string;
}

/**
 * TDD Pair Programmer Agent
 * Provides intelligent guidance for test-first development
 */
export class TDDPairProgrammer extends QEAgent {
  private currentCycle: TDDCycle | null = null;
  private cycleHistory: TDDCycle[] = [];
  private codeAnalysisCache: Map<string, CodeAnalysis> = new Map();

  constructor(
    config: QEAgentConfig,
    memory: QEMemory,
    hooks: HookManager,
    logger?: Logger
  ) {
    super(config, memory, hooks, logger);
  }

  protected async doExecute(context: AgentContext): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const artifacts: string[] = [];
    const metrics: Record<string, number> = {};

    try {
      this.logger.info('Starting TDD pair programming session', { context });

      // Store execution context in memory
      await this.storeMemory('execution_context', context, ['tdd', 'session']);

      // Analyze current code state and suggest next test
      const suggestion = await this.suggestNextTest([], '', 'auto');
      artifacts.push(`test-suggestion:${suggestion.id}`);

      // Track TDD cycle
      const cycle = await this.startTDDCycle('red', 'Suggested initial test', '', '');
      artifacts.push(`tdd-cycle:${cycle.id}`);
      metrics.cycles_started = 1;

      return {
        success: true,
        status: 'passed',
        message: `TDD session started with test suggestion: ${suggestion.description}`,
        artifacts,
        metrics,
        duration: Date.now() - startTime,
        metadata: { suggestionId: suggestion.id, cycleId: cycle.id }
      };

    } catch (error) {
      this.logger.error('Failed to execute TDD pair programming', { error });

      return {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error)),
        artifacts,
        metrics,
        duration: Date.now() - startTime,
        metadata: { error: true }
      };
    }
  }

  /**
   * Suggest the next test in the TDD cycle
   */
  public async suggestNextTest(
    existingTests: any[],
    codeContext: string,
    tddStyle: TDDStyle = 'auto'
  ): Promise<TestSuggestion> {
    const suggestionId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Analyze current state
    const analysis = await this.analyzeCode(codeContext);
    const missingTests = await this.identifyMissingTests(codeContext, existingTests);

    // Determine TDD style if auto
    const effectiveStyle = tddStyle === 'auto' ? this.determineTDDStyle(codeContext, existingTests) : tddStyle;

    // Generate test suggestion based on style and analysis
    const suggestion = this.generateTestSuggestion(
      suggestionId,
      analysis,
      missingTests,
      effectiveStyle,
      codeContext
    );

    // Store suggestion in memory
    await this.storeMemory(`suggestion:${suggestionId}`, suggestion, ['tdd', 'suggestion']);

    this.logger.info('Generated test suggestion', {
      suggestionId,
      style: effectiveStyle,
      category: suggestion.category
    });

    return suggestion;
  }

  /**
   * Identify missing test cases
   */
  public async identifyMissingTests(
    code: string,
    testSuite: any[]
  ): Promise<MissingTestCase[]> {
    const missingTests: MissingTestCase[] = [];

    // Analyze code for potential test scenarios
    const codeFeatures = this.extractCodeFeatures(code);
    const existingTestCoverage = this.analyzeTestCoverage(testSuite);

    // Identify gaps
    for (const feature of codeFeatures) {
      if (!this.isFeatureCovered(feature, existingTestCoverage)) {
        const missingTest = this.createMissingTestCase(feature);
        missingTests.push(missingTest);
      }
    }

    // Check for common missing patterns
    missingTests.push(...this.checkCommonMissingPatterns(code, testSuite));

    // Store missing tests analysis
    await this.storeMemory('missing_tests', missingTests, ['tdd', 'analysis']);

    this.logger.info('Identified missing test cases', {
      count: missingTests.length,
      criticalCount: missingTests.filter(t => t.priority === 'critical').length
    });

    return missingTests;
  }

  /**
   * Suggest refactoring opportunities
   */
  public async suggestRefactoring(
    code: string,
    tests: string
  ): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];

    // Analyze code for refactoring opportunities
    const codeSmells = this.detectCodeSmells(code);
    const testSmells = this.detectTestSmells(tests);

    // Generate refactoring suggestions
    suggestions.push(...this.generateCodeRefactorings(codeSmells, code));
    suggestions.push(...this.generateTestRefactorings(testSmells, tests));

    // Prioritize suggestions
    suggestions.sort((a, b) => this.calculateRefactoringPriority(b) - this.calculateRefactoringPriority(a));

    // Store refactoring suggestions
    await this.storeMemory('refactoring_suggestions', suggestions, ['tdd', 'refactoring']);

    this.logger.info('Generated refactoring suggestions', {
      count: suggestions.length,
      safeCount: suggestions.filter(s => s.safetyLevel === 'safe').length
    });

    return suggestions;
  }

  /**
   * Start a new TDD cycle
   */
  public async startTDDCycle(
    phase: 'red' | 'green' | 'refactor',
    description: string,
    testFile: string,
    codeFile: string
  ): Promise<TDDCycle> {
    // End current cycle if exists
    if (this.currentCycle) {
      await this.endTDDCycle(true);
    }

    const cycleId = `cycle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const cycle: TDDCycle = {
      id: cycleId,
      phase,
      startTime: new Date(),
      testFile,
      codeFile,
      description,
      success: false,
      notes: [],
      metrics: {
        testExecutionTime: 0,
        codeChanges: 0,
        testChanges: 0
      }
    };

    this.currentCycle = cycle;

    // Store cycle in memory
    await this.storeMemory(`cycle:${cycleId}`, cycle, ['tdd', 'cycle']);

    this.logger.info('Started TDD cycle', {
      cycleId,
      phase,
      description
    });

    return cycle;
  }

  /**
   * End the current TDD cycle
   */
  public async endTDDCycle(success: boolean, notes: string[] = []): Promise<void> {
    if (!this.currentCycle) {
      return;
    }

    this.currentCycle.endTime = new Date();
    this.currentCycle.success = success;
    this.currentCycle.notes = notes;

    // Move to history
    this.cycleHistory.push(this.currentCycle);

    // Update memory
    await this.storeMemory(`cycle:${this.currentCycle.id}`, this.currentCycle, ['tdd', 'cycle', 'completed']);

    this.logger.info('Ended TDD cycle', {
      cycleId: this.currentCycle.id,
      success,
      duration: this.currentCycle.endTime.getTime() - this.currentCycle.startTime.getTime()
    });

    this.currentCycle = null;
  }

  /**
   * Analyze code for various metrics
   */
  private async analyzeCode(code: string): Promise<CodeAnalysis> {
    // Check cache first
    const cacheKey = this.generateCodeHash(code);
    if (this.codeAnalysisCache.has(cacheKey)) {
      return this.codeAnalysisCache.get(cacheKey)!;
    }

    const analysis: CodeAnalysis = {
      coverage: this.analyzeCoverage(code),
      complexity: this.analyzeComplexity(code),
      testability: this.analyzeTestability(code),
      smells: {
        code: this.detectCodeSmells(code),
        test: this.detectTestSmells(code)
      }
    };

    // Cache the analysis
    this.codeAnalysisCache.set(cacheKey, analysis);

    return analysis;
  }

  /**
   * Determine appropriate TDD style based on context
   */
  private determineTDDStyle(codeContext: string, existingTests: any[]): TDDStyle {
    // Simple heuristics to determine style
    const hasExternalDependencies = codeContext.includes('fetch') ||
                                   codeContext.includes('http') ||
                                   codeContext.includes('database');

    const hasComplexInteractions = codeContext.includes('class') &&
                                  codeContext.includes('interface');

    // London school for complex interactions, Chicago for simpler code
    return (hasExternalDependencies || hasComplexInteractions) ? 'london' : 'chicago';
  }

  /**
   * Generate test suggestion based on analysis
   */
  private generateTestSuggestion(
    id: string,
    analysis: CodeAnalysis,
    missingTests: MissingTestCase[],
    style: TDDStyle,
    context: string
  ): TestSuggestion {
    // Prioritize missing critical tests
    const criticalMissing = missingTests.find(t => t.priority === 'critical');

    if (criticalMissing) {
      return this.createTestSuggestionFromMissing(id, criticalMissing, style);
    }

    // Generate based on current phase and style
    if (analysis.coverage.percentage < 80) {
      return this.createCoverageSuggestion(id, analysis, style);
    }

    // Suggest edge cases or refactoring tests
    return this.createEdgeCaseSuggestion(id, context, style);
  }

  /**
   * Create test suggestion from missing test case
   */
  private createTestSuggestionFromMissing(
    id: string,
    missingTest: MissingTestCase,
    style: TDDStyle
  ): TestSuggestion {
    const testCode = this.generateTestCode(missingTest, style);

    return {
      id,
      description: `Test ${missingTest.scenario} in ${missingTest.area}`,
      testCode,
      reasoning: missingTest.reasoning,
      category: 'red',
      difficulty: missingTest.priority === 'critical' ? 'complex' : 'medium',
      estimatedTime: this.estimateTestTime(missingTest.type),
      dependencies: [],
      followUpTests: this.suggestFollowUpTests(missingTest)
    };
  }

  /**
   * Create coverage-focused suggestion
   */
  private createCoverageSuggestion(
    id: string,
    analysis: CodeAnalysis,
    style: TDDStyle
  ): TestSuggestion {
    const uncoveredArea = analysis.coverage.missingAreas[0] || 'main functionality';

    return {
      id,
      description: `Test uncovered ${uncoveredArea}`,
      testCode: this.generateBasicTestCode(uncoveredArea, style),
      reasoning: `Current coverage is ${analysis.coverage.percentage}%. This test will improve coverage of ${uncoveredArea}.`,
      category: 'red',
      difficulty: 'simple',
      estimatedTime: 15,
      dependencies: [],
      followUpTests: [`Test error cases for ${uncoveredArea}`, `Test edge cases for ${uncoveredArea}`]
    };
  }

  /**
   * Create edge case suggestion
   */
  private createEdgeCaseSuggestion(
    id: string,
    context: string,
    style: TDDStyle
  ): TestSuggestion {
    const edgeCases = ['null input', 'empty string', 'boundary values', 'concurrent access'];
    const selectedCase = edgeCases[Math.floor(Math.random() * edgeCases.length)];

    return {
      id,
      description: `Test ${selectedCase} scenario`,
      testCode: this.generateEdgeCaseTest(selectedCase, style),
      reasoning: `Edge case testing for ${selectedCase} to ensure robust behavior.`,
      category: 'red',
      difficulty: 'medium',
      estimatedTime: 20,
      dependencies: [],
      followUpTests: []
    };
  }

  // Helper methods for code analysis
  private extractCodeFeatures(code: string): any[] {
    // Simple feature extraction - in real implementation, use AST parsing
    const features = [];
    const lines = code.split('\n');

    for (const line of lines) {
      if (line.includes('function') || line.includes('method')) {
        features.push({ type: 'function', name: this.extractFunctionName(line) });
      }
      if (line.includes('class')) {
        features.push({ type: 'class', name: this.extractClassName(line) });
      }
    }

    return features;
  }

  private analyzeTestCoverage(tests: any[]): any {
    // Analyze what the existing tests cover
    return {
      functions: tests.map(t => t.name),
      scenarios: tests.map(t => t.scenario || 'default'),
      coverage: tests.length * 10 // simplified
    };
  }

  private isFeatureCovered(feature: any, coverage: any): boolean {
    return coverage.functions.some((f: string) => f.includes(feature.name));
  }

  private createMissingTestCase(feature: any): MissingTestCase {
    return {
      id: `missing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      area: feature.type,
      scenario: `Test ${feature.name} functionality`,
      priority: 'medium',
      type: 'integration',
      suggestedTest: `should test ${feature.name} with valid input`,
      reasoning: `No existing test covers ${feature.name}`
    };
  }

  private checkCommonMissingPatterns(code: string, tests: any[]): MissingTestCase[] {
    const missing: MissingTestCase[] = [];

    // Check for error handling tests
    if (code.includes('throw') && !tests.some(t => t.name.includes('error'))) {
      missing.push({
        id: `error-${Date.now()}`,
        area: 'error_handling',
        scenario: 'Test error scenarios',
        priority: 'high',
        type: 'error_handling',
        suggestedTest: 'should handle errors gracefully',
        reasoning: 'Code contains error throwing but no error tests found'
      });
    }

    // Check for async operation tests
    if ((code.includes('async') || code.includes('Promise')) &&
        !tests.some(t => t.name.includes('async'))) {
      missing.push({
        id: `async-${Date.now()}`,
        area: 'async_operations',
        scenario: 'Test asynchronous behavior',
        priority: 'high',
        type: 'integration',
        suggestedTest: 'should handle async operations correctly',
        reasoning: 'Code uses async operations but no async tests found'
      });
    }

    return missing;
  }

  // Code analysis helper methods
  private analyzeCoverage(code: string): CodeAnalysis['coverage'] {
    // Simplified coverage analysis
    const lines = code.split('\n').filter(line => line.trim().length > 0);
    const functionCount = (code.match(/function|method/g) || []).length;

    return {
      percentage: Math.min(functionCount * 15, 100), // simplified
      missingAreas: ['error handling', 'edge cases'],
      redundantTests: []
    };
  }

  private analyzeComplexity(code: string): CodeAnalysis['complexity'] {
    const cyclomaticComplexity = (code.match(/if|while|for|switch|catch/g) || []).length + 1;
    const cognitiveComplexity = cyclomaticComplexity * 1.2; // simplified

    return {
      cyclomatic: cyclomaticComplexity,
      cognitive: cognitiveComplexity,
      suggestions: cyclomaticComplexity > 10 ? ['Consider breaking down complex functions'] : []
    };
  }

  private analyzeTestability(code: string): CodeAnalysis['testability'] {
    const hasHardDependencies = code.includes('new Date()') || code.includes('Math.random()');
    const hasPureFunctions = code.includes('return') && !code.includes('this.');

    const score = hasPureFunctions ? 0.8 : hasHardDependencies ? 0.3 : 0.6;

    return {
      score,
      issues: hasHardDependencies ? ['Hard dependencies make testing difficult'] : [],
      improvements: !hasPureFunctions ? ['Consider using pure functions'] : []
    };
  }

  private detectCodeSmells(code: string): string[] {
    const smells: string[] = [];

    if (code.length > 1000) smells.push('Long function');
    if ((code.match(/if/g) || []).length > 5) smells.push('Complex conditional logic');
    if (code.includes('// TODO')) smells.push('TODO comments');

    return smells;
  }

  private detectTestSmells(tests: string): string[] {
    const smells: string[] = [];

    if (tests.includes('sleep') || tests.includes('wait')) smells.push('Test waits');
    if ((tests.match(/assert/g) || []).length > 10) smells.push('Too many assertions');

    return smells;
  }

  // Test code generation methods
  private generateTestCode(missingTest: MissingTestCase, style: TDDStyle): string {
    const template = style === 'london' ? this.getLondonTestTemplate() : this.getChicagoTestTemplate();
    return template.replace('{{scenario}}', missingTest.scenario)
                  .replace('{{area}}', missingTest.area);
  }

  private generateBasicTestCode(area: string, style: TDDStyle): string {
    if (style === 'london') {
      return `describe('${area}', () => {
  it('should {{scenario}}', () => {
    // Arrange - mock dependencies
    const mockDependency = jest.fn();

    // Act
    const result = systemUnderTest.{{area}}();

    // Assert
    expect(mockDependency).toHaveBeenCalled();
  });
});`;
    } else {
      return `describe('${area}', () => {
  it('should {{scenario}}', () => {
    // Arrange
    const input = {};

    // Act
    const result = {{area}}(input);

    // Assert
    expect(result).toBeDefined();
  });
});`;
    }
  }

  private generateEdgeCaseTest(edgeCase: string, style: TDDStyle): string {
    return `it('should handle ${edgeCase}', () => {
  // Test ${edgeCase} scenario
  expect(() => functionUnderTest(${this.getEdgeCaseValue(edgeCase)})).not.toThrow();
});`;
  }

  private getLondonTestTemplate(): string {
    return `describe('{{area}}', () => {
  it('should {{scenario}}', () => {
    // Arrange - mock all dependencies

    // Act

    // Assert - verify interactions
  });
});`;
  }

  private getChicagoTestTemplate(): string {
    return `describe('{{area}}', () => {
  it('should {{scenario}}', () => {
    // Arrange - set up real objects

    // Act

    // Assert - verify final state
  });
});`;
  }

  // Utility methods
  private generateCodeHash(code: string): string {
    // Simple hash function for caching
    return btoa(code).substring(0, 16);
  }

  private extractFunctionName(line: string): string {
    const match = line.match(/function\s+(\w+)|(\w+)\s*\(/);
    return match ? (match[1] || match[2]) : 'unknown';
  }

  private extractClassName(line: string): string {
    const match = line.match(/class\s+(\w+)/);
    return match ? match[1] : 'unknown';
  }

  private estimateTestTime(type: string): number {
    const timeMap = {
      'edge_case': 10,
      'error_handling': 15,
      'integration': 25,
      'performance': 30,
      'security': 20
    };
    return timeMap[type as keyof typeof timeMap] || 15;
  }

  private suggestFollowUpTests(missingTest: MissingTestCase): string[] {
    return [
      `Test ${missingTest.area} with invalid input`,
      `Test ${missingTest.area} boundary conditions`,
      `Test ${missingTest.area} error scenarios`
    ];
  }

  private getEdgeCaseValue(edgeCase: string): string {
    const valueMap = {
      'null input': 'null',
      'empty string': '""',
      'boundary values': 'Number.MAX_VALUE',
      'concurrent access': '/* concurrent test setup */'
    };
    return valueMap[edgeCase as keyof typeof valueMap] || 'undefined';
  }

  private generateCodeRefactorings(smells: string[], code: string): RefactoringSuggestion[] {
    return smells.map((smell, index) => ({
      id: `refactor-${index}`,
      type: 'simplify' as const,
      description: `Address ${smell}`,
      target: smell,
      before: '// Code with smell',
      after: '// Refactored code',
      reasoning: `${smell} detected in code`,
      safetyLevel: 'moderate' as const,
      testImpact: ['May require test updates']
    }));
  }

  private generateTestRefactorings(smells: string[], tests: string): RefactoringSuggestion[] {
    return smells.map((smell, index) => ({
      id: `test-refactor-${index}`,
      type: 'simplify' as const,
      description: `Address test ${smell}`,
      target: smell,
      before: '// Test with smell',
      after: '// Refactored test',
      reasoning: `Test ${smell} detected`,
      safetyLevel: 'safe' as const,
      testImpact: ['Test improvement only']
    }));
  }

  private calculateRefactoringPriority(suggestion: RefactoringSuggestion): number {
    const safetyWeight = { safe: 3, moderate: 2, risky: 1 };
    const typeWeight = { extract_method: 3, simplify: 2, rename: 1, extract_class: 2, remove_duplication: 3 };

    return safetyWeight[suggestion.safetyLevel] + typeWeight[suggestion.type];
  }

  protected async onInitialize(): Promise<void> {
    this.logger.info('Initializing TDD Pair Programmer');
    // Load previous TDD sessions and patterns
  }

  public getCurrentCycle(): TDDCycle | null {
    return this.currentCycle;
  }

  public getCycleHistory(): TDDCycle[] {
    return [...this.cycleHistory];
  }
}