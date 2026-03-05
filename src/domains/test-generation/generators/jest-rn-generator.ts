/**
 * Agentic QE v3 - Jest React Native Test Generator (M4.4)
 * Strategy implementation for React Native test generation using Jest + @testing-library/react-native
 *
 * Generates test code with:
 * - @testing-library/react-native (render, fireEvent, screen, waitFor)
 * - @testing-library/react-hooks (renderHook, act)
 * - Native module mocking (react-native, @react-navigation, AsyncStorage)
 * - Platform-specific test utilities
 * - Snapshot testing support
 *
 * @module test-generation/generators
 */

import { BaseTestGenerator } from './base-test-generator.js';
import type {
  TestFramework,
  TestType,
  FunctionInfo,
  ClassInfo,
  TestGenerationContext,
  CodeAnalysis,
  Pattern,
} from '../interfaces.js';
import type { ParsedFile } from '../../../shared/parsers/interfaces.js';

/**
 * JestRNGenerator - Test generator for React Native projects using Jest
 *
 * Produces idiomatic RN tests leveraging:
 * - @testing-library/react-native for component rendering and interaction
 * - @testing-library/react-hooks for custom hook testing
 * - jest.mock() for native module isolation
 * - Platform-specific mock utilities
 *
 * @example
 * ```typescript
 * const generator = new JestRNGenerator();
 * const testCode = generator.generateTests({
 *   moduleName: 'ProfileScreen',
 *   importPath: './ProfileScreen',
 *   testType: 'unit',
 *   patterns: [],
 *   analysis: { functions: [...], classes: [...] }
 * });
 * ```
 */
export class JestRNGenerator extends BaseTestGenerator {
  readonly framework: TestFramework = 'jest-rn';

  /**
   * Detect whether a function represents a React hook (name starts with "use")
   */
  private isHook(fn: FunctionInfo): boolean {
    return /^use[A-Z]/.test(fn.name);
  }

  /**
   * Detect whether a class/function looks like a React component
   * (PascalCase name or has JSX-related return type)
   */
  private isComponent(name: string, returnType?: string): boolean {
    const isPascal = /^[A-Z]/.test(name);
    const hasJsxReturn =
      returnType !== undefined &&
      /jsx|react\.?element|react\.?node|reactnode/i.test(returnType);
    return isPascal || hasJsxReturn;
  }

  /**
   * Determine which RN-specific mocks are needed based on analysis
   */
  private detectRequiredMocks(context: TestGenerationContext): string[] {
    const mocks: string[] = [];
    const deps = context.dependencies?.imports ?? [];

    if (deps.some((d) => d.includes('react-navigation') || d.includes('@react-navigation'))) {
      mocks.push('navigation');
    }
    if (deps.some((d) => d.includes('async-storage') || d.includes('AsyncStorage'))) {
      mocks.push('async-storage');
    }
    if (deps.some((d) => d.includes('react-native-reanimated'))) {
      mocks.push('reanimated');
    }
    if (deps.some((d) => d.includes('react-native-gesture-handler'))) {
      mocks.push('gesture-handler');
    }

    return mocks;
  }

  /**
   * Build mock declarations string for detected dependencies
   */
  private buildMockDeclarations(requiredMocks: string[]): string {
    let mocks = '';

    // Always mock react-native core
    mocks += `jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return {
    ...RN,
    Platform: { OS: 'ios', select: jest.fn((obj) => obj.ios) },
    Alert: { alert: jest.fn() },
    Linking: { openURL: jest.fn(), canOpenURL: jest.fn().mockResolvedValue(true) },
    Dimensions: { get: jest.fn(() => ({ width: 375, height: 812 })) },
  };
});\n\n`;

    if (requiredMocks.includes('navigation')) {
      mocks += `jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: jest.fn(),
}));\n\n`;
    }

    if (requiredMocks.includes('async-storage')) {
      mocks += `jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  getAllKeys: jest.fn().mockResolvedValue([]),
}));\n\n`;
    }

    if (requiredMocks.includes('reanimated')) {
      mocks += `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));\n\n`;
    }

    if (requiredMocks.includes('gesture-handler')) {
      mocks += `jest.mock('react-native-gesture-handler', () => ({
  Swipeable: 'Swipeable',
  GestureHandlerRootView: ({ children }: any) => children,
}));\n\n`;
    }

    return mocks;
  }

  // ============================================================================
  // Abstract Method Implementations
  // ============================================================================

  /**
   * Generate complete test file from analysis context
   */
  generateTests(context: TestGenerationContext): string {
    const { moduleName, importPath, testType, patterns, analysis, dependencies } = context;

    if (!analysis || (analysis.functions.length === 0 && analysis.classes.length === 0)) {
      return this.generateStubTests(context);
    }

    const patternComment = this.generatePatternComment(patterns);
    const exports = this.extractExports(analysis.functions, analysis.classes);

    // Determine what testing-library imports are needed
    const hasComponents = analysis.classes.some((c) => this.isComponent(c.name));
    const hasHooks = analysis.functions.some((f) => this.isHook(f));
    const hasFunctions = analysis.functions.some((f) => !this.isHook(f));

    let testCode = patternComment;

    // React Native testing library imports
    if (hasComponents || analysis.classes.length > 0) {
      testCode += `import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';\n`;
    }
    if (hasHooks) {
      testCode += `import { renderHook, act } from '@testing-library/react-hooks';\n`;
    }

    // Import the module under test
    const importStatement = this.generateImportStatement(exports, importPath, moduleName);
    testCode += `${importStatement}\n`;

    // Mock declarations
    const requiredMocks = this.detectRequiredMocks(context);
    testCode += `\n`;
    testCode += this.buildMockDeclarations(requiredMocks);

    // External dependency mocks (non-relative)
    if (dependencies && dependencies.imports.length > 0) {
      const externalDeps = dependencies.imports.filter((dep) => !dep.startsWith('.'));
      // Filter out deps already mocked by buildMockDeclarations
      const alreadyMocked = [
        'react-native',
        '@react-navigation/native',
        '@react-native-async-storage/async-storage',
        'react-native-reanimated',
        'react-native-gesture-handler',
      ];
      const remainingDeps = externalDeps.filter(
        (dep) => !alreadyMocked.some((m) => dep.includes(m))
      );
      if (remainingDeps.length > 0) {
        testCode += `// Auto-generated mocks from Knowledge Graph dependency analysis\n`;
        for (const dep of remainingDeps.slice(0, 10)) {
          testCode += `jest.mock('${dep}', () => ({ default: jest.fn() }));\n`;
        }
        testCode += `\n`;
      }
    }

    // Only generate tests for exported items
    const exportedFns = analysis.functions.filter((fn) => fn.isExported);
    const exportedClasses = analysis.classes.filter((cls) => cls.isExported);

    for (const fn of exportedFns) {
      testCode += this.generateFunctionTests(fn, testType);
    }

    for (const cls of exportedClasses) {
      testCode += this.generateClassTests(cls, testType);
    }

    return testCode;
  }

  /**
   * Generate tests for a standalone function or custom hook
   */
  generateFunctionTests(fn: FunctionInfo, _testType: TestType): string {
    if (this.isHook(fn)) {
      return this.generateHookTests(fn);
    }

    // Standard function tests using base class utilities
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
   * Generate tests for a React Native component class
   */
  generateClassTests(cls: ClassInfo, testType: TestType): string {
    if (this.isComponent(cls.name)) {
      return this.generateComponentTests(cls, testType);
    }

    // Non-component class: fall back to standard class tests
    let code = `describe('${cls.name}', () => {\n`;
    code += `  let instance: ${cls.name};\n\n`;

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

    code += `  it('should instantiate correctly', () => {\n`;
    code += `    expect(instance).toBeInstanceOf(${cls.name});\n`;
    code += `  });\n\n`;

    for (const method of cls.methods) {
      if (!method.name.startsWith('_') && !method.name.startsWith('#')) {
        code += this.generateMethodTests(method);
      }
    }

    code += `});\n\n`;
    return code;
  }

  /**
   * Generate stub tests when no AST analysis is available
   */
  generateStubTests(context: TestGenerationContext): string {
    const { moduleName, importPath, testType, patterns } = context;
    const patternComment = this.generatePatternComment(patterns);
    const isComponent = this.isComponent(moduleName);

    let code = patternComment;

    if (isComponent) {
      code += `import { render, screen, fireEvent } from '@testing-library/react-native';\n`;
      code += `import React from 'react';\n`;
    }
    code += `import { ${moduleName} } from '${importPath}';\n\n`;

    // Mock react-native core
    code += `jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return {
    ...RN,
    Platform: { OS: 'ios', select: jest.fn((obj) => obj.ios) },
  };
});\n\n`;

    code += `describe('${moduleName}', () => {\n`;
    code += `  describe('${testType} tests', () => {\n`;
    code += `    it('should be defined', () => {\n`;
    code += `      expect(${moduleName}).toBeDefined();\n`;
    code += `    });\n\n`;

    if (isComponent) {
      code += `    it('should render without crashing', () => {\n`;
      code += `      const { toJSON } = render(<${moduleName} />);\n`;
      code += `      expect(toJSON()).toMatchSnapshot();\n`;
      code += `    });\n\n`;
      code += `    it('should handle user interaction', () => {\n`;
      code += `      render(<${moduleName} />);\n`;
      code += `      // Add interaction tests based on component behavior\n`;
      code += `      expect(screen.toJSON()).toBeTruthy();\n`;
      code += `    });\n`;
    } else {
      code += `    it('should handle basic operations', () => {\n`;
      code += `      const moduleType = typeof ${moduleName};\n`;
      code += `      expect(['function', 'object']).toContain(moduleType);\n`;
      code += `    });\n\n`;
      code += `    it('should handle edge cases', () => {\n`;
      code += `      expect(() => JSON.stringify(${moduleName})).not.toThrow();\n`;
      code += `    });\n\n`;
      code += `    it('should handle error conditions', () => {\n`;
      code += `      expect(() => Object.keys(${moduleName})).not.toThrow();\n`;
      code += `    });\n`;
    }

    code += `  });\n`;
    code += `});\n`;
    return code;
  }

  /**
   * Generate coverage-focused tests for specific lines
   */
  generateCoverageTests(
    moduleName: string,
    importPath: string,
    lines: number[]
  ): string {
    const funcName = this.camelCase(moduleName);
    const lineRange = this.formatLineRange(lines);
    const isComponent = this.isComponent(moduleName);

    let code = `// Coverage test for ${lineRange} in ${moduleName}\n`;

    if (isComponent) {
      code += `import { render, screen, waitFor } from '@testing-library/react-native';\n`;
      code += `import React from 'react';\n`;
    }
    code += `import { ${funcName} } from '${importPath}';\n\n`;

    code += `describe('${moduleName} coverage', () => {\n`;
    code += `  describe('${lineRange}', () => {\n`;

    if (isComponent) {
      const ComponentName = this.pascalCase(moduleName);
      code += `    it('should execute code path covering ${lineRange}', () => {\n`;
      code += `      const { toJSON } = render(<${ComponentName} />);\n`;
      code += `      expect(toJSON()).toBeTruthy();\n`;
      code += `    });\n\n`;
      code += `    it('should handle edge case for ${lineRange}', async () => {\n`;
      code += `      render(<${ComponentName} />);\n`;
      code += `      await waitFor(() => {\n`;
      code += `        expect(screen.toJSON()).toBeTruthy();\n`;
      code += `      });\n`;
      code += `    });\n`;
    } else {
      code += `    it('should execute code path covering ${lineRange}', () => {\n`;
      code += `      // Arrange: Set up test inputs to reach uncovered lines\n`;
      code += `      const testInput = undefined; // Replace with appropriate input\n\n`;
      code += `      // Act: Execute the code path\n`;
      code += `      const result = ${funcName}(testInput);\n\n`;
      code += `      // Assert: Verify the code was reached and behaves correctly\n`;
      code += `      expect(result).toBeDefined();\n`;
      code += `    });\n\n`;
      code += `    it('should handle edge case for ${lineRange}', () => {\n`;
      code += `      // Arrange: Set up edge case input\n`;
      code += `      const edgeCaseInput = null;\n\n`;
      code += `      // Act & Assert: Verify edge case handling\n`;
      code += `      expect(() => ${funcName}(edgeCaseInput)).not.toThrow();\n`;
      code += `    });\n`;
    }

    code += `  });\n`;
    code += `});\n`;
    return code;
  }

  // ============================================================================
  // React Native Specific Generators
  // ============================================================================

  /**
   * Generate tests for a React custom hook
   */
  private generateHookTests(fn: FunctionInfo): string {
    const hookArgs = fn.parameters.map((p) => this.generateTestValue(p)).join(', ');
    const hookCall = `${fn.name}(${hookArgs})`;

    let code = `describe('${fn.name}', () => {\n`;

    // Basic render test
    code += `  it('should render without errors', () => {\n`;
    code += `    const { result } = renderHook(() => ${hookCall});\n`;
    code += `    expect(result.current).toBeDefined();\n`;
    code += `  });\n\n`;

    // Return value structure test
    code += `  it('should return expected structure', () => {\n`;
    code += `    const { result } = renderHook(() => ${hookCall});\n`;
    if (fn.returnType) {
      const rt = fn.returnType.toLowerCase();
      if (rt.includes('[]') || rt.includes('array')) {
        code += `    expect(Array.isArray(result.current)).toBe(true);\n`;
      } else if (rt.includes('boolean')) {
        code += `    expect(typeof result.current).toBe('boolean');\n`;
      } else {
        code += `    expect(result.current).toBeDefined();\n`;
      }
    } else {
      code += `    expect(result.current).toBeDefined();\n`;
    }
    code += `  });\n\n`;

    // Act test for state updates
    code += `  it('should handle state updates via act', async () => {\n`;
    code += `    const { result } = renderHook(() => ${hookCall});\n\n`;
    code += `    await act(async () => {\n`;
    code += `      // Trigger hook state change if applicable\n`;
    code += `    });\n\n`;
    code += `    expect(result.current).toBeDefined();\n`;
    code += `  });\n\n`;

    // Rerender test
    code += `  it('should handle rerender', () => {\n`;
    code += `    const { result, rerender } = renderHook(() => ${hookCall});\n`;
    code += `    rerender();\n`;
    code += `    expect(result.current).toBeDefined();\n`;
    code += `  });\n\n`;

    // Unmount test
    code += `  it('should clean up on unmount', () => {\n`;
    code += `    const { unmount } = renderHook(() => ${hookCall});\n`;
    code += `    expect(() => unmount()).not.toThrow();\n`;
    code += `  });\n\n`;

    code += `});\n\n`;
    return code;
  }

  /**
   * Generate tests for a React Native component
   */
  private generateComponentTests(cls: ClassInfo, testType: TestType): string {
    const componentName = cls.name;
    const hasProps = cls.constructorParams && cls.constructorParams.length > 0;

    let code = `describe('${componentName}', () => {\n`;

    // Default props
    if (hasProps) {
      const propsObj = cls.constructorParams!
        .map((p) => `    ${p.name}: ${this.generateTestValue(p)}`)
        .join(',\n');
      code += `  const defaultProps = {\n${propsObj},\n  };\n\n`;
    }

    // Render test
    code += `  it('should render without crashing', () => {\n`;
    if (hasProps) {
      code += `    const { toJSON } = render(<${componentName} {...defaultProps} />);\n`;
    } else {
      code += `    const { toJSON } = render(<${componentName} />);\n`;
    }
    code += `    expect(toJSON()).toBeTruthy();\n`;
    code += `  });\n\n`;

    // Snapshot test
    code += `  it('should match snapshot', () => {\n`;
    if (hasProps) {
      code += `    const { toJSON } = render(<${componentName} {...defaultProps} />);\n`;
    } else {
      code += `    const { toJSON } = render(<${componentName} />);\n`;
    }
    code += `    expect(toJSON()).toMatchSnapshot();\n`;
    code += `  });\n\n`;

    // Generate tests for each public method (event handlers, etc.)
    const publicMethods = cls.methods.filter(
      (m) => !m.name.startsWith('_') && !m.name.startsWith('#') && !m.name.startsWith('render')
    );

    for (const method of publicMethods) {
      const isHandler = /^(on|handle)[A-Z]/.test(method.name);

      if (isHandler) {
        code += `  it('should handle ${method.name}', () => {\n`;
        if (hasProps) {
          code += `    render(<${componentName} {...defaultProps} />);\n`;
        } else {
          code += `    render(<${componentName} />);\n`;
        }

        // Infer event from handler name
        const eventMatch = method.name.match(/^(?:on|handle)([A-Z]\w*)/);
        const eventName = eventMatch ? eventMatch[1].toLowerCase() : 'press';

        if (eventName === 'press' || eventName === 'click') {
          code += `    // Trigger press event on interactive element\n`;
          code += `    // fireEvent.press(screen.getByTestId('${this.camelCase(componentName)}-button'));\n`;
        } else if (eventName === 'change' || eventName === 'changetext') {
          code += `    // Trigger text change event\n`;
          code += `    // fireEvent.changeText(screen.getByTestId('${this.camelCase(componentName)}-input'), 'test value');\n`;
        } else if (eventName === 'scroll') {
          code += `    // Trigger scroll event\n`;
          code += `    // fireEvent(screen.getByTestId('${this.camelCase(componentName)}-scroll'), 'scroll');\n`;
        } else {
          code += `    // Trigger ${eventName} event\n`;
        }

        code += `    expect(screen.toJSON()).toBeTruthy();\n`;
        code += `  });\n\n`;
      }
    }

    // Async content test
    const hasAsyncMethods = cls.methods.some((m) => m.isAsync);
    if (hasAsyncMethods) {
      code += `  it('should handle async content', async () => {\n`;
      if (hasProps) {
        code += `    render(<${componentName} {...defaultProps} />);\n`;
      } else {
        code += `    render(<${componentName} />);\n`;
      }
      code += `    await waitFor(() => {\n`;
      code += `      expect(screen.toJSON()).toBeTruthy();\n`;
      code += `    });\n`;
      code += `  });\n\n`;
    }

    code += `});\n\n`;
    return code;
  }

  /**
   * Generate tests for a class method (non-component)
   */
  private generateMethodTests(method: FunctionInfo): string {
    let code = `  describe('${method.name}', () => {\n`;

    const validParams = method.parameters.map((p) => this.generateTestValue(p)).join(', ');
    const methodCall = method.isAsync
      ? `await instance.${method.name}(${validParams})`
      : `instance.${method.name}(${validParams})`;

    const asyncPrefix = method.isAsync ? 'async ' : '';
    const isVoid = method.returnType === 'void' || method.returnType === 'Promise<void>';

    code += `    it('should execute successfully', ${asyncPrefix}() => {\n`;
    if (isVoid) {
      code += `      ${methodCall};\n`;
      code += `      // void return - no assertion on result needed\n`;
    } else {
      code += `      const result = ${methodCall};\n`;
      code += `      expect(result).toBeDefined();\n`;
    }
    code += `    });\n`;

    // Handle undefined params
    const methodBody = method.body || '';
    const methodThrows = /\bthrow\b/.test(methodBody) || /\bvalidat/i.test(methodBody);

    for (const param of method.parameters) {
      if (!param.optional) {
        const paramsWithUndefined = method.parameters
          .map((p) => (p.name === param.name ? 'undefined as any' : this.generateTestValue(p)))
          .join(', ');

        if (methodThrows) {
          code += `\n    it('should handle invalid ${param.name}', ${asyncPrefix}() => {\n`;
          code += `      expect(() => instance.${method.name}(${paramsWithUndefined})).toThrow();\n`;
          code += `    });\n`;
        } else {
          code += `\n    it('should handle undefined ${param.name}', ${asyncPrefix}() => {\n`;
          code += `      try {\n`;
          code += `        ${method.isAsync ? 'await ' : ''}instance.${method.name}(${paramsWithUndefined});\n`;
          code += `      } catch (e) {\n`;
          code += `        expect(e).toBeInstanceOf(Error);\n`;
          code += `      }\n`;
          code += `    });\n`;
        }
      }
    }

    code += `  });\n\n`;
    return code;
  }

  // ============================================================================
  // Static Utilities
  // ============================================================================

  /**
   * Convert a ParsedFile (from the language parser layer) to ICodeAnalysis
   * (the domain interface used by generators).
   */
  static convertParsedFile(parsed: ParsedFile): CodeAnalysis {
    return {
      functions: parsed.functions.map((f) => ({
        name: f.name,
        parameters: f.parameters.map((p) => ({
          name: p.name,
          type: p.type,
          optional: p.isOptional,
          defaultValue: p.defaultValue,
        })),
        returnType: f.returnType,
        isAsync: f.isAsync,
        isExported: f.isPublic,
        complexity: f.complexity,
        startLine: f.startLine,
        endLine: f.endLine,
        body: f.body,
      })),
      classes: parsed.classes.map((c) => ({
        name: c.name,
        methods: c.methods.map((m) => ({
          name: m.name,
          parameters: m.parameters.map((p) => ({
            name: p.name,
            type: p.type,
            optional: p.isOptional,
            defaultValue: p.defaultValue,
          })),
          returnType: m.returnType,
          isAsync: m.isAsync,
          isExported: m.isPublic,
          complexity: m.complexity,
          startLine: m.startLine,
          endLine: m.endLine,
          body: m.body,
        })),
        properties: c.properties.map((p) => ({
          name: p.name,
          type: p.type,
          isPrivate: !p.isPublic,
          isReadonly: p.isReadonly,
        })),
        isExported: c.isPublic,
        hasConstructor: c.methods.some((m) => m.name === 'constructor'),
        constructorParams: c.methods
          .find((m) => m.name === 'constructor')
          ?.parameters.map((p) => ({
            name: p.name,
            type: p.type,
            optional: p.isOptional,
            defaultValue: p.defaultValue,
          })),
      })),
    };
  }
}
