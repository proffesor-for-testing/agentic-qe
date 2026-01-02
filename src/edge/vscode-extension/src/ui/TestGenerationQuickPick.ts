/**
 * TestGenerationQuickPick - Multi-Step Quick Pick for Test Generation
 *
 * Provides a multi-step quick pick UI for test generation:
 * 1. Select test type (unit, integration, e2e)
 * 2. Select test framework (jest, vitest, mocha)
 * 3. Select coverage targets
 * 4. Generate and insert test file
 *
 * @module vscode-extension/ui/TestGenerationQuickPick
 * @version 0.1.0
 */

import * as vscode from 'vscode';
import type { AnalysisService, FunctionInfo, TestSuggestion } from '../services/AnalysisService';

/**
 * Test type options
 */
export type TestType = 'unit' | 'integration' | 'e2e' | 'property-based';

/**
 * Test framework options
 */
export type TestFramework = 'jest' | 'vitest' | 'mocha' | 'playwright' | 'cypress';

/**
 * Coverage target options
 */
export interface CoverageTarget {
  id: string;
  label: string;
  description: string;
  selected: boolean;
}

/**
 * Test generation options
 */
export interface TestGenerationOptions {
  /**
   * Test type
   */
  testType: TestType;

  /**
   * Test framework
   */
  framework: TestFramework;

  /**
   * Coverage targets to include
   */
  coverageTargets: string[];

  /**
   * Target function code
   */
  code: string;

  /**
   * Target function name
   */
  functionName: string;

  /**
   * Source file path
   */
  sourceFile: string;

  /**
   * Include async tests
   */
  includeAsync: boolean;

  /**
   * Include mocking
   */
  includeMocking: boolean;

  /**
   * Include edge cases
   */
  includeEdgeCases: boolean;
}

/**
 * Quick pick item with additional data
 */
interface ExtendedQuickPickItem<T> extends vscode.QuickPickItem {
  value: T;
}

/**
 * TestGenerationQuickPick
 *
 * Multi-step quick pick for configuring test generation.
 */
export class TestGenerationQuickPick implements vscode.Disposable {
  /**
   * Current quick pick instance
   */
  private quickPick: vscode.QuickPick<ExtendedQuickPickItem<unknown>> | undefined;

  /**
   * Current step (1-4)
   */
  private currentStep = 1;

  /**
   * Total steps
   */
  private readonly totalSteps = 4;

  /**
   * Selected options
   */
  private selectedOptions: Partial<TestGenerationOptions> = {};

  /**
   * Promise resolver for completion
   */
  private resolvePromise: ((options: TestGenerationOptions | undefined) => void) | undefined;

  /**
   * Disposables
   */
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly analysisService: AnalysisService) {}

  /**
   * Show the multi-step quick pick
   */
  async show(
    code: string,
    functionName: string,
    sourceFile: string
  ): Promise<TestGenerationOptions | undefined> {
    // Initialize options
    this.selectedOptions = {
      code,
      functionName,
      sourceFile,
      includeAsync: true,
      includeMocking: true,
      includeEdgeCases: true,
    };

    this.currentStep = 1;

    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.showStep1TestType();
    });
  }

  /**
   * Step 1: Select test type
   */
  private showStep1TestType(): void {
    this.quickPick = vscode.window.createQuickPick<ExtendedQuickPickItem<TestType>>();
    this.quickPick.title = 'Generate Tests';
    this.quickPick.step = 1;
    this.quickPick.totalSteps = this.totalSteps;
    this.quickPick.placeholder = 'Select test type';
    this.quickPick.ignoreFocusOut = true;

    this.quickPick.items = [
      {
        label: '$(beaker) Unit Test',
        description: 'Test individual functions in isolation',
        detail: 'Fast, isolated tests with mocked dependencies',
        value: 'unit' as TestType,
      },
      {
        label: '$(plug) Integration Test',
        description: 'Test multiple components together',
        detail: 'Verify components work correctly when integrated',
        value: 'integration' as TestType,
      },
      {
        label: '$(browser) End-to-End Test',
        description: 'Test complete user flows',
        detail: 'Full browser automation testing',
        value: 'e2e' as TestType,
      },
      {
        label: '$(symbol-property) Property-Based Test',
        description: 'Test with generated inputs',
        detail: 'Verify properties hold for many random inputs',
        value: 'property-based' as TestType,
      },
    ];

    this.quickPick.onDidAccept(() => {
      const selection = this.quickPick?.selectedItems[0];
      if (selection) {
        this.selectedOptions.testType = selection.value;
        this.quickPick?.dispose();
        this.showStep2Framework();
      }
    });

    this.quickPick.onDidHide(() => {
      if (this.currentStep === 1) {
        this.cancel();
      }
    });

    this.quickPick.show();
  }

  /**
   * Step 2: Select test framework
   */
  private showStep2Framework(): void {
    this.currentStep = 2;

    this.quickPick = vscode.window.createQuickPick<ExtendedQuickPickItem<TestFramework>>();
    this.quickPick.title = 'Generate Tests';
    this.quickPick.step = 2;
    this.quickPick.totalSteps = this.totalSteps;
    this.quickPick.placeholder = 'Select test framework';
    this.quickPick.ignoreFocusOut = true;

    // Show different frameworks based on test type
    const items = this.getFrameworksForTestType(this.selectedOptions.testType!);
    this.quickPick.items = items;

    // Add back button
    this.quickPick.buttons = [vscode.QuickInputButtons.Back];

    this.quickPick.onDidTriggerButton((button) => {
      if (button === vscode.QuickInputButtons.Back) {
        this.quickPick?.dispose();
        this.showStep1TestType();
      }
    });

    this.quickPick.onDidAccept(() => {
      const selection = this.quickPick?.selectedItems[0];
      if (selection) {
        this.selectedOptions.framework = selection.value;
        this.quickPick?.dispose();
        this.showStep3CoverageTargets();
      }
    });

    this.quickPick.onDidHide(() => {
      if (this.currentStep === 2) {
        this.cancel();
      }
    });

    this.quickPick.show();
  }

  /**
   * Step 3: Select coverage targets
   */
  private showStep3CoverageTargets(): void {
    this.currentStep = 3;

    this.quickPick = vscode.window.createQuickPick<ExtendedQuickPickItem<string>>();
    this.quickPick.title = 'Generate Tests';
    this.quickPick.step = 3;
    this.quickPick.totalSteps = this.totalSteps;
    this.quickPick.placeholder = 'Select coverage targets (Space to toggle, Enter to confirm)';
    this.quickPick.canSelectMany = true;
    this.quickPick.ignoreFocusOut = true;

    // Generate coverage targets based on function
    const targets = this.generateCoverageTargets();
    this.quickPick.items = targets;

    // Pre-select recommended targets
    const recommended = targets.filter((t) => t.picked);
    this.quickPick.selectedItems = recommended as unknown as readonly ExtendedQuickPickItem<string>[];

    // Add back button
    this.quickPick.buttons = [vscode.QuickInputButtons.Back];

    this.quickPick.onDidTriggerButton((button) => {
      if (button === vscode.QuickInputButtons.Back) {
        this.quickPick?.dispose();
        this.showStep2Framework();
      }
    });

    this.quickPick.onDidAccept(() => {
      const selections = this.quickPick?.selectedItems || [];
      this.selectedOptions.coverageTargets = selections.map((s) => s.value);
      this.quickPick?.dispose();
      this.showStep4Options();
    });

    this.quickPick.onDidHide(() => {
      if (this.currentStep === 3) {
        this.cancel();
      }
    });

    this.quickPick.show();
  }

  /**
   * Step 4: Additional options and generate
   */
  private showStep4Options(): void {
    this.currentStep = 4;

    this.quickPick = vscode.window.createQuickPick<ExtendedQuickPickItem<string>>();
    this.quickPick.title = 'Generate Tests';
    this.quickPick.step = 4;
    this.quickPick.totalSteps = this.totalSteps;
    this.quickPick.placeholder = 'Select additional options (Space to toggle, Enter to generate)';
    this.quickPick.canSelectMany = true;
    this.quickPick.ignoreFocusOut = true;

    const items: (ExtendedQuickPickItem<string> & { picked?: boolean })[] = [
      {
        label: '$(sync) Include Async Tests',
        description: 'Test async/await patterns',
        value: 'async',
        picked: this.selectedOptions.includeAsync,
      },
      {
        label: '$(package) Include Mocking',
        description: 'Mock external dependencies',
        value: 'mocking',
        picked: this.selectedOptions.includeMocking,
      },
      {
        label: '$(symbol-array) Include Edge Cases',
        description: 'Test boundary conditions',
        value: 'edge-cases',
        picked: this.selectedOptions.includeEdgeCases,
      },
      {
        label: '$(error) Include Error Tests',
        description: 'Test error handling paths',
        value: 'errors',
        picked: true,
      },
      {
        label: '$(type-hierarchy) Include Type Tests',
        description: 'Verify type correctness',
        value: 'types',
        picked: false,
      },
    ];

    this.quickPick.items = items;

    // Pre-select items
    const preselected = items.filter((i) => i.picked);
    this.quickPick.selectedItems = preselected as unknown as readonly ExtendedQuickPickItem<string>[];

    // Add back button
    this.quickPick.buttons = [vscode.QuickInputButtons.Back];

    this.quickPick.onDidTriggerButton((button) => {
      if (button === vscode.QuickInputButtons.Back) {
        this.quickPick?.dispose();
        this.showStep3CoverageTargets();
      }
    });

    this.quickPick.onDidAccept(() => {
      const selections = this.quickPick?.selectedItems || [];
      const selectedValues = new Set(selections.map((s) => s.value));

      this.selectedOptions.includeAsync = selectedValues.has('async');
      this.selectedOptions.includeMocking = selectedValues.has('mocking');
      this.selectedOptions.includeEdgeCases = selectedValues.has('edge-cases');

      this.quickPick?.dispose();
      this.complete();
    });

    this.quickPick.onDidHide(() => {
      if (this.currentStep === 4) {
        this.cancel();
      }
    });

    this.quickPick.show();
  }

  /**
   * Get frameworks for a test type
   */
  private getFrameworksForTestType(testType: TestType): ExtendedQuickPickItem<TestFramework>[] {
    const allFrameworks: ExtendedQuickPickItem<TestFramework>[] = [
      {
        label: '$(star) Jest',
        description: 'Popular testing framework with built-in mocking',
        detail: 'Recommended for unit and integration tests',
        value: 'jest',
      },
      {
        label: '$(zap) Vitest',
        description: 'Fast Vite-native testing framework',
        detail: 'Great for Vite projects, Jest-compatible API',
        value: 'vitest',
      },
      {
        label: '$(coffee) Mocha',
        description: 'Flexible testing framework',
        detail: 'Requires separate assertion library (chai)',
        value: 'mocha',
      },
      {
        label: '$(play-circle) Playwright',
        description: 'Modern end-to-end testing',
        detail: 'Cross-browser automation by Microsoft',
        value: 'playwright',
      },
      {
        label: '$(window) Cypress',
        description: 'Developer-friendly E2E testing',
        detail: 'Real-time browser testing',
        value: 'cypress',
      },
    ];

    // Filter based on test type
    switch (testType) {
      case 'unit':
      case 'property-based':
        return allFrameworks.filter((f) => ['jest', 'vitest', 'mocha'].includes(f.value));

      case 'integration':
        return allFrameworks.filter((f) => ['jest', 'vitest', 'mocha', 'playwright'].includes(f.value));

      case 'e2e':
        return allFrameworks.filter((f) => ['playwright', 'cypress'].includes(f.value));

      default:
        return allFrameworks;
    }
  }

  /**
   * Generate coverage targets based on function code
   */
  private generateCoverageTargets(): (ExtendedQuickPickItem<string> & { picked?: boolean })[] {
    const code = this.selectedOptions.code || '';
    const targets: (ExtendedQuickPickItem<string> & { picked?: boolean })[] = [];

    // Happy path - always include
    targets.push({
      label: '$(check) Happy Path',
      description: 'Test normal execution flow',
      value: 'happy-path',
      picked: true,
    });

    // Error handling
    if (code.includes('throw') || code.includes('catch') || code.includes('Error')) {
      targets.push({
        label: '$(error) Error Handling',
        description: 'Test error conditions',
        value: 'error-handling',
        picked: true,
      });
    }

    // Boundary conditions
    if (code.includes('length') || /[\<\>]=?/.test(code) || code.includes('Math.')) {
      targets.push({
        label: '$(symbol-ruler) Boundary Conditions',
        description: 'Test min/max values',
        value: 'boundary',
        picked: true,
      });
    }

    // Null/undefined handling
    if (code.includes('null') || code.includes('undefined') || code.includes('?')) {
      targets.push({
        label: '$(question) Null/Undefined',
        description: 'Test null safety',
        value: 'null-safety',
        picked: true,
      });
    }

    // Async behavior
    if (code.includes('async') || code.includes('await') || code.includes('Promise')) {
      targets.push({
        label: '$(sync) Async Behavior',
        description: 'Test async/await patterns',
        value: 'async',
        picked: true,
      });
    }

    // Array/collection handling
    if (code.includes('[]') || code.includes('Array') || code.includes('map') || code.includes('filter')) {
      targets.push({
        label: '$(list-ordered) Collections',
        description: 'Test arrays and collections',
        value: 'collections',
        picked: false,
      });
    }

    // Conditional branches
    const conditionalCount = (code.match(/if\s*\(/g) || []).length;
    if (conditionalCount > 1) {
      targets.push({
        label: '$(git-branch) All Branches',
        description: `Test all ${conditionalCount} conditional branches`,
        value: 'branches',
        picked: conditionalCount <= 5,
      });
    }

    // Return value types
    if (code.includes('return')) {
      targets.push({
        label: '$(symbol-type-parameter) Return Types',
        description: 'Verify return value types',
        value: 'return-types',
        picked: false,
      });
    }

    return targets;
  }

  /**
   * Complete the quick pick and resolve promise
   */
  private complete(): void {
    if (this.resolvePromise) {
      this.resolvePromise(this.selectedOptions as TestGenerationOptions);
      this.resolvePromise = undefined;
    }
  }

  /**
   * Cancel the quick pick
   */
  private cancel(): void {
    if (this.resolvePromise) {
      this.resolvePromise(undefined);
      this.resolvePromise = undefined;
    }

    this.quickPick?.dispose();
    this.quickPick = undefined;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.cancel();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

/**
 * Generate test code from options
 */
export function generateTestFromOptions(options: TestGenerationOptions): string {
  const { testType, framework, functionName, coverageTargets, includeAsync, includeMocking, includeEdgeCases } =
    options;

  // Build import statement based on framework
  const imports = getFrameworkImports(framework);

  // Build describe block
  const tests: string[] = [];

  // Happy path test
  if (coverageTargets.includes('happy-path')) {
    tests.push(generateHappyPathTest(functionName, includeAsync, framework));
  }

  // Error handling test
  if (coverageTargets.includes('error-handling')) {
    tests.push(generateErrorHandlingTest(functionName, includeAsync, framework));
  }

  // Boundary conditions test
  if (coverageTargets.includes('boundary')) {
    tests.push(generateBoundaryTest(functionName, includeAsync, framework));
  }

  // Null safety test
  if (coverageTargets.includes('null-safety')) {
    tests.push(generateNullSafetyTest(functionName, includeAsync, framework));
  }

  // Async test
  if (coverageTargets.includes('async')) {
    tests.push(generateAsyncTest(functionName, framework));
  }

  // Edge cases
  if (includeEdgeCases) {
    tests.push(generateEdgeCasesTest(functionName, includeAsync, framework));
  }

  // Build final test file
  const mocking = includeMocking ? getFrameworkMocking(framework, functionName) : '';

  return `${imports}

${mocking}

describe('${functionName}', () => {
${tests.map((t) => indentCode(t, 2)).join('\n\n')}
});
`;
}

/**
 * Get import statements for framework
 */
function getFrameworkImports(framework: TestFramework): string {
  switch (framework) {
    case 'jest':
      return `import { describe, it, expect, jest } from '@jest/globals';`;

    case 'vitest':
      return `import { describe, it, expect, vi } from 'vitest';`;

    case 'mocha':
      return `import { describe, it } from 'mocha';
import { expect } from 'chai';`;

    case 'playwright':
      return `import { test, expect } from '@playwright/test';`;

    case 'cypress':
      return `// Cypress tests use global cy object`;

    default:
      return `import { describe, it, expect } from 'jest';`;
  }
}

/**
 * Get mocking setup for framework
 */
function getFrameworkMocking(framework: TestFramework, functionName: string): string {
  switch (framework) {
    case 'jest':
      return `// Mock dependencies
jest.mock('../dependencies', () => ({
  dependency: jest.fn(),
}));`;

    case 'vitest':
      return `// Mock dependencies
vi.mock('../dependencies', () => ({
  dependency: vi.fn(),
}));`;

    default:
      return '';
  }
}

/**
 * Generate happy path test
 */
function generateHappyPathTest(functionName: string, isAsync: boolean, framework: TestFramework): string {
  const asyncKeyword = isAsync ? 'async ' : '';
  const awaitKeyword = isAsync ? 'await ' : '';

  return `it('should execute successfully with valid input', ${asyncKeyword}() => {
  // Arrange
  const input = /* valid input */;

  // Act
  const result = ${awaitKeyword}${functionName}(input);

  // Assert
  expect(result).toBeDefined();
});`;
}

/**
 * Generate error handling test
 */
function generateErrorHandlingTest(functionName: string, isAsync: boolean, framework: TestFramework): string {
  const asyncKeyword = isAsync ? 'async ' : '';

  if (isAsync) {
    return `it('should handle errors gracefully', async () => {
  // Arrange
  const invalidInput = /* invalid input */;

  // Act & Assert
  await expect(${functionName}(invalidInput)).rejects.toThrow();
});`;
  }

  return `it('should handle errors gracefully', () => {
  // Arrange
  const invalidInput = /* invalid input */;

  // Act & Assert
  expect(() => ${functionName}(invalidInput)).toThrow();
});`;
}

/**
 * Generate boundary test
 */
function generateBoundaryTest(functionName: string, isAsync: boolean, framework: TestFramework): string {
  const asyncKeyword = isAsync ? 'async ' : '';
  const awaitKeyword = isAsync ? 'await ' : '';

  return `it('should handle boundary values', ${asyncKeyword}() => {
  // Test minimum value
  const minResult = ${awaitKeyword}${functionName}(/* min value */);
  expect(minResult).toBeDefined();

  // Test maximum value
  const maxResult = ${awaitKeyword}${functionName}(/* max value */);
  expect(maxResult).toBeDefined();
});`;
}

/**
 * Generate null safety test
 */
function generateNullSafetyTest(functionName: string, isAsync: boolean, framework: TestFramework): string {
  const asyncKeyword = isAsync ? 'async ' : '';

  return `it('should handle null and undefined', ${asyncKeyword}() => {
  // Test null
  expect(() => ${functionName}(null)).not.toThrow();

  // Test undefined
  expect(() => ${functionName}(undefined)).not.toThrow();
});`;
}

/**
 * Generate async test
 */
function generateAsyncTest(functionName: string, framework: TestFramework): string {
  return `it('should resolve async operations', async () => {
  // Arrange
  const input = /* input */;

  // Act
  const result = await ${functionName}(input);

  // Assert
  expect(result).toBeDefined();
});

it('should reject with timeout if too slow', async () => {
  // Arrange
  const slowInput = /* slow input */;

  // Act & Assert
  await expect(
    Promise.race([
      ${functionName}(slowInput),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
    ])
  ).resolves.toBeDefined();
});`;
}

/**
 * Generate edge cases test
 */
function generateEdgeCasesTest(functionName: string, isAsync: boolean, framework: TestFramework): string {
  const asyncKeyword = isAsync ? 'async ' : '';
  const awaitKeyword = isAsync ? 'await ' : '';

  return `describe('edge cases', () => {
  it('should handle empty input', ${asyncKeyword}() => {
    const result = ${awaitKeyword}${functionName}(/* empty */);
    expect(result).toBeDefined();
  });

  it('should handle special characters', ${asyncKeyword}() => {
    const result = ${awaitKeyword}${functionName}(/* special chars */);
    expect(result).toBeDefined();
  });

  it('should handle very large input', ${asyncKeyword}() => {
    const result = ${awaitKeyword}${functionName}(/* large input */);
    expect(result).toBeDefined();
  });
});`;
}

/**
 * Indent code by spaces
 */
function indentCode(code: string, spaces: number): string {
  const indent = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => (line.trim() ? indent + line : ''))
    .join('\n');
}
