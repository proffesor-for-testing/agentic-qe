/**
 * Agentic QE v3 - Test Generator Factory
 * Factory for creating framework-specific test generators
 *
 * Implements the Abstract Factory pattern to provide a unified interface
 * for obtaining the correct test generator based on the target framework.
 *
 * @module test-generation/factories
 */

import type {
  ITestGenerator,
  ITestGeneratorFactory,
} from '../interfaces';
import type { TestFramework } from '../../../shared/types/test-frameworks.js';
import { FRAMEWORK_ALIASES, ALL_TEST_FRAMEWORKS, resolveFrameworkAlias } from '../../../shared/types/test-frameworks.js';
import {
  JestVitestGenerator,
  MochaGenerator,
  PytestGenerator,
  NodeTestGenerator,
  JUnit5Generator,
  XUnitGenerator,
  GoTestGenerator,
  RustTestGenerator,
  SwiftTestingGenerator,
  KotlinJUnitGenerator,
  FlutterTestGenerator,
  JestRNGenerator,
} from '../generators';

/**
 * Supported test frameworks
 */
const SUPPORTED_FRAMEWORKS: readonly TestFramework[] = ALL_TEST_FRAMEWORKS;

/**
 * Default framework when none is specified
 */
const DEFAULT_FRAMEWORK: TestFramework = 'vitest';

/**
 * TestGeneratorFactory - Factory for creating test generators
 *
 * Provides a clean interface for obtaining the appropriate test generator
 * based on the target framework, with caching for performance.
 *
 * @example
 * ```typescript
 * const factory = new TestGeneratorFactory();
 *
 * // Get a generator for vitest
 * const vitestGen = factory.create('vitest');
 *
 * // Get a generator for pytest
 * const pytestGen = factory.create('pytest');
 *
 * // Check if a framework is supported
 * if (factory.supports('jest')) {
 *   const jestGen = factory.create('jest');
 * }
 * ```
 */
export class TestGeneratorFactory implements ITestGeneratorFactory {
  /**
   * Cache of created generators for reuse
   */
  private readonly cache = new Map<TestFramework, ITestGenerator>();

  /**
   * Create a test generator for the specified framework
   *
   * @param framework - Target test framework
   * @returns Test generator instance
   * @throws Error if framework is not supported
   */
  create(framework: TestFramework): ITestGenerator {
    // Resolve aliases (e.g., 'junit' -> 'junit5')
    const resolved = resolveFrameworkAlias(framework) ?? framework as TestFramework;

    // Check cache first
    const cached = this.cache.get(resolved);
    if (cached) {
      return cached;
    }

    // Create new generator
    const generator = this.createGenerator(resolved);
    this.cache.set(resolved, generator);
    return generator;
  }

  /**
   * Check if a framework is supported
   *
   * @param framework - Framework to check
   * @returns True if supported, with type narrowing
   */
  supports(framework: string): framework is TestFramework {
    const resolved = resolveFrameworkAlias(framework);
    return resolved !== undefined;
  }

  /**
   * Get the default framework
   *
   * @returns Default test framework (vitest)
   */
  getDefault(): TestFramework {
    return DEFAULT_FRAMEWORK;
  }

  /**
   * Get all supported frameworks
   *
   * @returns Array of supported framework names
   */
  getSupportedFrameworks(): TestFramework[] {
    return [...SUPPORTED_FRAMEWORKS];
  }

  /**
   * Create a generator instance for the framework
   */
  private createGenerator(framework: TestFramework): ITestGenerator {
    switch (framework) {
      case 'jest':
        return new JestVitestGenerator('jest');
      case 'vitest':
        return new JestVitestGenerator('vitest');
      case 'mocha':
        return new MochaGenerator();
      case 'pytest':
        return new PytestGenerator();
      case 'node-test':
        return new NodeTestGenerator();
      case 'junit5':
      case 'testng': // Aliased to JUnit5 — TestNG-specific annotations (@DataProvider) not yet supported
        return new JUnit5Generator();
      case 'xunit':
      case 'nunit': // Aliased to xUnit — NUnit-specific attributes ([TestCase]) not yet supported
        return new XUnitGenerator();
      case 'go-test':
        return new GoTestGenerator();
      case 'rust-test':
        return new RustTestGenerator();
      case 'swift-testing':
      case 'xctest':
        return new SwiftTestingGenerator();
      case 'kotlin-junit':
        return new KotlinJUnitGenerator();
      case 'flutter-test':
        return new FlutterTestGenerator();
      case 'jest-rn':
        return new JestRNGenerator();
      case 'playwright':
      case 'cypress':
        throw new Error(`Generator for '${framework}' not yet implemented`);
      default:
        // This should never happen due to type constraints,
        // but provides a fallback for runtime safety
        throw new Error(`Unsupported test framework: ${framework}`);
    }
  }

  /**
   * Clear the generator cache
   * Useful for testing or when memory needs to be freed
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Singleton factory instance for convenience
 * Most applications can use this shared instance
 */
export const testGeneratorFactory = new TestGeneratorFactory();

/**
 * Convenience function to create a generator
 *
 * @param framework - Target test framework (defaults to vitest)
 * @returns Test generator instance
 *
 * @example
 * ```typescript
 * const generator = createTestGenerator('jest');
 * const testCode = generator.generateTests(context);
 * ```
 */
export function createTestGenerator(framework?: TestFramework): ITestGenerator {
  return testGeneratorFactory.create(framework ?? DEFAULT_FRAMEWORK);
}

/**
 * Type guard for checking framework support
 *
 * @param framework - Framework string to check
 * @returns True if the framework is supported
 *
 * @example
 * ```typescript
 * const userInput = 'jest';
 * if (isValidTestFramework(userInput)) {
 *   const generator = createTestGenerator(userInput);
 * }
 * ```
 */
export function isValidTestFramework(framework: string): framework is TestFramework {
  return resolveFrameworkAlias(framework) !== undefined;
}
