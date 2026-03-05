/**
 * Tests for the Jest React Native Test Generator (M4.4)
 */

import { describe, it, expect } from 'vitest';
import { JestRNGenerator } from '../../../../src/domains/test-generation/generators/jest-rn-generator';
import type {
  FunctionInfo,
  ClassInfo,
  TestGenerationContext,
  CodeAnalysis,
} from '../../../../src/domains/test-generation/interfaces';
import type { ParsedFile } from '../../../../src/shared/parsers/interfaces';

describe('JestRNGenerator', () => {
  const generator = new JestRNGenerator();

  // =========================================================================
  // 1. Framework property
  // =========================================================================

  describe('framework property', () => {
    it('should be jest-rn', () => {
      expect(generator.framework).toBe('jest-rn');
    });
  });

  // =========================================================================
  // 2. Stub test generation
  // =========================================================================

  describe('generateStubTests', () => {
    it('should generate stub tests for a non-component module', () => {
      const context: TestGenerationContext = {
        moduleName: 'apiService',
        importPath: './api-service',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateStubTests(context);
      expect(result).toContain("import { apiService } from './api-service'");
      expect(result).toContain("describe('apiService'");
      expect(result).toContain('should be defined');
      expect(result).toContain('should handle basic operations');
      expect(result).toContain('should handle edge cases');
      expect(result).toContain('should handle error conditions');
      expect(result).toContain("jest.mock('react-native'");
    });

    it('should generate component stub tests for PascalCase module names', () => {
      const context: TestGenerationContext = {
        moduleName: 'ProfileScreen',
        importPath: './ProfileScreen',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateStubTests(context);
      expect(result).toContain("import { render, screen, fireEvent } from '@testing-library/react-native'");
      expect(result).toContain("import React from 'react'");
      expect(result).toContain('should render without crashing');
      expect(result).toContain('toMatchSnapshot');
    });

    it('should include pattern comment when patterns are provided', () => {
      const context: TestGenerationContext = {
        moduleName: 'util',
        importPath: './util',
        testType: 'unit',
        patterns: [
          { id: '1', name: 'singleton', structure: '', examples: 1, applicability: 1 },
        ],
      };

      const result = generator.generateStubTests(context);
      expect(result).toContain('// Applied patterns: singleton');
    });
  });

  // =========================================================================
  // 3. Function tests (utility functions)
  // =========================================================================

  describe('generateFunctionTests', () => {
    it('should generate tests for a utility function', () => {
      const fn: FunctionInfo = {
        name: 'formatCurrency',
        parameters: [
          { name: 'amount', type: 'number', optional: false, defaultValue: undefined },
          { name: 'locale', type: 'string', optional: true, defaultValue: "'en-US'" },
        ],
        returnType: 'string',
        isAsync: false,
        isExported: true,
        complexity: 2,
        startLine: 1,
        endLine: 5,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain("describe('formatCurrency'");
      expect(result).toContain('should handle valid input correctly');
      expect(result).toContain("expect(typeof result).toBe('string')");
    });

    it('should generate async tests for async functions', () => {
      const fn: FunctionInfo = {
        name: 'fetchUser',
        parameters: [
          { name: 'userId', type: 'string', optional: false, defaultValue: undefined },
        ],
        returnType: 'Promise<User>',
        isAsync: true,
        isExported: true,
        complexity: 3,
        startLine: 1,
        endLine: 10,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('async ()');
      expect(result).toContain('await fetchUser');
    });

    it('should generate toThrow for functions with explicit throw', () => {
      const fn: FunctionInfo = {
        name: 'validateInput',
        parameters: [
          { name: 'input', type: 'string', optional: false, defaultValue: undefined },
        ],
        returnType: 'boolean',
        isAsync: false,
        isExported: true,
        complexity: 3,
        startLine: 1,
        endLine: 8,
        body: 'if (!input) throw new Error("required");',
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('toThrow');
    });
  });

  // =========================================================================
  // 4. Hook tests
  // =========================================================================

  describe('hook tests', () => {
    it('should generate renderHook tests for custom hooks', () => {
      const fn: FunctionInfo = {
        name: 'useCounter',
        parameters: [
          { name: 'initialValue', type: 'number', optional: true, defaultValue: '0' },
        ],
        returnType: '{ count: number; increment: () => void }',
        isAsync: false,
        isExported: true,
        complexity: 2,
        startLine: 1,
        endLine: 10,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain("describe('useCounter'");
      expect(result).toContain('renderHook');
      expect(result).toContain('result.current');
      expect(result).toContain('should render without errors');
      expect(result).toContain('should return expected structure');
      expect(result).toContain('should handle state updates via act');
      expect(result).toContain('should handle rerender');
      expect(result).toContain('should clean up on unmount');
    });

    it('should detect array return type for hooks', () => {
      const fn: FunctionInfo = {
        name: 'useItems',
        parameters: [],
        returnType: 'Item[]',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 5,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('Array.isArray(result.current)');
    });
  });

  // =========================================================================
  // 5. Component tests
  // =========================================================================

  describe('generateClassTests', () => {
    it('should generate component tests for PascalCase classes', () => {
      const cls: ClassInfo = {
        name: 'LoginButton',
        methods: [
          {
            name: 'onPress',
            parameters: [],
            returnType: 'void',
            isAsync: false,
            isExported: true,
            complexity: 1,
            startLine: 10,
            endLine: 12,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain("describe('LoginButton'");
      expect(result).toContain('should render without crashing');
      expect(result).toContain('should match snapshot');
      expect(result).toContain('toMatchSnapshot');
      expect(result).toContain('toJSON');
    });

    it('should generate press handler tests', () => {
      const cls: ClassInfo = {
        name: 'SubmitButton',
        methods: [
          {
            name: 'onPress',
            parameters: [],
            returnType: 'void',
            isAsync: false,
            isExported: true,
            complexity: 1,
            startLine: 5,
            endLine: 7,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('should handle onPress');
      expect(result).toContain('fireEvent.press');
    });

    it('should generate changeText handler tests', () => {
      const cls: ClassInfo = {
        name: 'SearchBar',
        methods: [
          {
            name: 'onChangeText',
            parameters: [
              { name: 'text', type: 'string', optional: false, defaultValue: undefined },
            ],
            returnType: 'void',
            isAsync: false,
            isExported: true,
            complexity: 1,
            startLine: 5,
            endLine: 7,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('should handle onChangeText');
      expect(result).toContain('fireEvent.changeText');
    });

    it('should generate scroll handler tests', () => {
      const cls: ClassInfo = {
        name: 'FeedList',
        methods: [
          {
            name: 'handleScroll',
            parameters: [],
            returnType: 'void',
            isAsync: false,
            isExported: true,
            complexity: 1,
            startLine: 5,
            endLine: 7,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('should handle handleScroll');
      expect(result).toContain("'scroll'");
    });

    it('should generate waitFor tests for components with async methods', () => {
      const cls: ClassInfo = {
        name: 'DataScreen',
        methods: [
          {
            name: 'fetchData',
            parameters: [],
            returnType: 'Promise<void>',
            isAsync: true,
            isExported: true,
            complexity: 2,
            startLine: 10,
            endLine: 15,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('should handle async content');
      expect(result).toContain('waitFor');
    });

    it('should generate default props for components with constructor params', () => {
      const cls: ClassInfo = {
        name: 'UserCard',
        methods: [],
        properties: [],
        isExported: true,
        hasConstructor: true,
        constructorParams: [
          { name: 'name', type: 'string', optional: false, defaultValue: undefined },
          { name: 'onPress', type: 'function', optional: false, defaultValue: undefined },
        ],
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('defaultProps');
      expect(result).toContain('{...defaultProps}');
    });

    it('should generate standard class tests for non-component classes', () => {
      const cls: ClassInfo = {
        name: 'apiHelper',
        methods: [
          {
            name: 'get',
            parameters: [
              { name: 'url', type: 'string', optional: false, defaultValue: undefined },
            ],
            returnType: 'Promise<Response>',
            isAsync: true,
            isExported: true,
            complexity: 2,
            startLine: 5,
            endLine: 10,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('should instantiate correctly');
      expect(result).toContain('toBeInstanceOf');
      expect(result).toContain("describe('get'");
    });
  });

  // =========================================================================
  // 6. Navigation mock generation
  // =========================================================================

  describe('navigation mock generation', () => {
    it('should generate navigation mocks when dependencies include @react-navigation', () => {
      const context: TestGenerationContext = {
        moduleName: 'HomeScreen',
        importPath: './HomeScreen',
        testType: 'unit',
        patterns: [],
        analysis: {
          functions: [],
          classes: [
            {
              name: 'HomeScreen',
              methods: [],
              properties: [],
              isExported: true,
              hasConstructor: false,
            },
          ],
        },
        dependencies: {
          imports: ['react', '@react-navigation/native', 'react-native'],
          importedBy: [],
          callees: [],
          callers: [],
        },
      };

      const result = generator.generateTests(context);
      expect(result).toContain("jest.mock('@react-navigation/native'");
      expect(result).toContain('useNavigation');
      expect(result).toContain('useRoute');
    });

    it('should generate AsyncStorage mock when detected', () => {
      const context: TestGenerationContext = {
        moduleName: 'StorageHelper',
        importPath: './StorageHelper',
        testType: 'unit',
        patterns: [],
        analysis: {
          functions: [
            {
              name: 'saveData',
              parameters: [
                { name: 'key', type: 'string', optional: false, defaultValue: undefined },
              ],
              returnType: 'Promise<void>',
              isAsync: true,
              isExported: true,
              complexity: 1,
              startLine: 1,
              endLine: 3,
            },
          ],
          classes: [],
        },
        dependencies: {
          imports: ['@react-native-async-storage/async-storage'],
          importedBy: [],
          callees: [],
          callers: [],
        },
      };

      const result = generator.generateTests(context);
      expect(result).toContain("jest.mock('@react-native-async-storage/async-storage'");
      expect(result).toContain('getItem');
      expect(result).toContain('setItem');
    });
  });

  // =========================================================================
  // 7. Coverage tests
  // =========================================================================

  describe('generateCoverageTests', () => {
    it('should generate coverage tests for specific lines', () => {
      const result = generator.generateCoverageTests(
        'apiHelper',
        './api-helper',
        [10, 11, 12]
      );

      expect(result).toContain('lines 10-12');
      expect(result).toContain("import { apiHelper } from './api-helper'");
      expect(result).toContain('should execute code path covering lines 10-12');
      expect(result).toContain('should handle edge case for lines 10-12');
    });

    it('should handle single line coverage', () => {
      const result = generator.generateCoverageTests('util', './util', [42]);
      expect(result).toContain('line 42');
    });

    it('should generate component coverage tests for PascalCase names', () => {
      const result = generator.generateCoverageTests(
        'ProfileCard',
        './ProfileCard',
        [20, 21, 22]
      );

      expect(result).toContain("import { render, screen, waitFor } from '@testing-library/react-native'");
      expect(result).toContain("import React from 'react'");
      expect(result).toContain('render(<ProfileCard');
      expect(result).toContain('waitFor');
    });
  });

  // =========================================================================
  // 8. convertParsedFile
  // =========================================================================

  describe('convertParsedFile', () => {
    it('should convert a ParsedFile to CodeAnalysis', () => {
      const parsed: ParsedFile = {
        functions: [
          {
            name: 'useAuth',
            parameters: [
              { name: 'config', type: 'AuthConfig', isOptional: true, defaultValue: undefined },
            ],
            returnType: 'AuthState',
            isAsync: false,
            isPublic: true,
            complexity: 3,
            decorators: [],
            genericParams: [],
            startLine: 1,
            endLine: 20,
          },
        ],
        classes: [
          {
            name: 'AuthProvider',
            methods: [
              {
                name: 'constructor',
                parameters: [
                  { name: 'api', type: 'ApiClient', isOptional: false, defaultValue: undefined },
                ],
                returnType: undefined,
                isAsync: false,
                isPublic: true,
                complexity: 1,
                decorators: [],
                genericParams: [],
                startLine: 5,
                endLine: 8,
              },
              {
                name: 'login',
                parameters: [
                  { name: 'email', type: 'string', isOptional: false, defaultValue: undefined },
                  { name: 'password', type: 'string', isOptional: false, defaultValue: undefined },
                ],
                returnType: 'Promise<boolean>',
                isAsync: true,
                isPublic: true,
                complexity: 4,
                decorators: [],
                genericParams: [],
                startLine: 10,
                endLine: 20,
              },
            ],
            properties: [
              { name: 'api', type: 'ApiClient', isPublic: false, isReadonly: true },
            ],
            isPublic: true,
            implements: ['IAuthProvider'],
            extends: undefined,
            decorators: [],
            startLine: 3,
            endLine: 22,
          },
        ],
        imports: [
          { module: 'react', namedImports: ['useState'], isTypeOnly: false },
        ],
        language: 'typescript',
        filePath: 'src/auth/AuthProvider.tsx',
      };

      const result = JestRNGenerator.convertParsedFile(parsed);

      // Functions
      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('useAuth');
      expect(result.functions[0].isExported).toBe(true);
      expect(result.functions[0].parameters[0].optional).toBe(true);

      // Classes
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('AuthProvider');
      expect(result.classes[0].isExported).toBe(true);
      expect(result.classes[0].hasConstructor).toBe(true);
      expect(result.classes[0].constructorParams).toHaveLength(1);
      expect(result.classes[0].constructorParams![0].name).toBe('api');
      expect(result.classes[0].methods).toHaveLength(2);

      // Properties
      expect(result.classes[0].properties[0].isPrivate).toBe(true);
      expect(result.classes[0].properties[0].isReadonly).toBe(true);
    });
  });

  // =========================================================================
  // 9. Full integration test (generateTests)
  // =========================================================================

  describe('generateTests (full integration)', () => {
    it('should generate stub tests when no analysis provided', () => {
      const context: TestGenerationContext = {
        moduleName: 'AppScreen',
        importPath: './AppScreen',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateTests(context);
      expect(result).toContain("describe('AppScreen'");
      expect(result).toContain('should be defined');
    });

    it('should generate stub tests when analysis has empty functions and classes', () => {
      const context: TestGenerationContext = {
        moduleName: 'EmptyModule',
        importPath: './empty-module',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [], classes: [] },
      };

      const result = generator.generateTests(context);
      expect(result).toContain("describe('EmptyModule'");
      expect(result).toContain('should be defined');
    });

    it('should generate full tests with hooks and components', () => {
      const context: TestGenerationContext = {
        moduleName: 'ProfileScreen',
        importPath: './ProfileScreen',
        testType: 'unit',
        patterns: [],
        analysis: {
          functions: [
            {
              name: 'useProfile',
              parameters: [
                { name: 'userId', type: 'string', optional: false, defaultValue: undefined },
              ],
              returnType: 'ProfileData',
              isAsync: false,
              isExported: true,
              complexity: 2,
              startLine: 1,
              endLine: 10,
            },
          ],
          classes: [
            {
              name: 'ProfileScreen',
              methods: [
                {
                  name: 'handleEdit',
                  parameters: [],
                  returnType: 'void',
                  isAsync: false,
                  isExported: true,
                  complexity: 1,
                  startLine: 15,
                  endLine: 18,
                },
              ],
              properties: [],
              isExported: true,
              hasConstructor: false,
            },
          ],
        },
      };

      const result = generator.generateTests(context);

      // Should have both testing library imports
      expect(result).toContain("import { render, fireEvent, screen, waitFor } from '@testing-library/react-native'");
      expect(result).toContain("import { renderHook, act } from '@testing-library/react-hooks'");

      // Should have react-native mock
      expect(result).toContain("jest.mock('react-native'");

      // Hook tests
      expect(result).toContain("describe('useProfile'");
      expect(result).toContain('renderHook');

      // Component tests
      expect(result).toContain("describe('ProfileScreen'");
      expect(result).toContain('should render without crashing');
      expect(result).toContain('should match snapshot');
    });

    it('should only generate tests for exported items', () => {
      const context: TestGenerationContext = {
        moduleName: 'helpers',
        importPath: './helpers',
        testType: 'unit',
        patterns: [],
        analysis: {
          functions: [
            {
              name: 'publicHelper',
              parameters: [],
              returnType: 'string',
              isAsync: false,
              isExported: true,
              complexity: 1,
              startLine: 1,
              endLine: 3,
            },
            {
              name: 'privateHelper',
              parameters: [],
              returnType: 'string',
              isAsync: false,
              isExported: false,
              complexity: 1,
              startLine: 5,
              endLine: 7,
            },
          ],
          classes: [],
        },
      };

      const result = generator.generateTests(context);
      expect(result).toContain("describe('publicHelper'");
      expect(result).not.toContain("describe('privateHelper'");
    });

    it('should mock external dependencies but not relative ones', () => {
      const context: TestGenerationContext = {
        moduleName: 'utils',
        importPath: './utils',
        testType: 'unit',
        patterns: [],
        analysis: {
          functions: [
            {
              name: 'doStuff',
              parameters: [],
              returnType: 'void',
              isAsync: false,
              isExported: true,
              complexity: 1,
              startLine: 1,
              endLine: 3,
            },
          ],
          classes: [],
        },
        dependencies: {
          imports: ['./local-helper', 'lodash', 'axios'],
          importedBy: [],
          callees: [],
          callers: [],
        },
      };

      const result = generator.generateTests(context);
      expect(result).toContain("jest.mock('lodash'");
      expect(result).toContain("jest.mock('axios'");
      expect(result).not.toContain("jest.mock('./local-helper'");
    });
  });

  // =========================================================================
  // 10. Platform-specific mock generation
  // =========================================================================

  describe('platform-specific mocks', () => {
    it('should always include Platform mock in react-native mock', () => {
      const context: TestGenerationContext = {
        moduleName: 'PlatformHelper',
        importPath: './PlatformHelper',
        testType: 'unit',
        patterns: [],
        analysis: {
          functions: [
            {
              name: 'getPlatformValue',
              parameters: [],
              returnType: 'string',
              isAsync: false,
              isExported: true,
              complexity: 1,
              startLine: 1,
              endLine: 3,
            },
          ],
          classes: [],
        },
      };

      const result = generator.generateTests(context);
      expect(result).toContain("Platform: { OS: 'ios'");
      expect(result).toContain('select: jest.fn');
    });
  });
});
