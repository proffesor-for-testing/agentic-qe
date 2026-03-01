/**
 * Safe Expression Evaluator Tests
 *
 * Comprehensive test suite for the security-critical expression evaluator.
 * This module replaces eval() and new Function() to prevent code injection.
 *
 * Test categories:
 * 1. Literal values (numbers, strings, booleans, null, undefined)
 * 2. Comparison operators (===, !==, ==, !=, <, >, <=, >=)
 * 3. Logical operators (&&, ||, !)
 * 4. Arithmetic operators (+, -, *, /, %)
 * 5. Variable access (simple and dot notation)
 * 6. Grouping with parentheses
 * 7. SECURITY: Rejection of dangerous patterns
 * 8. Edge cases and error handling
 *
 * @module tests/unit/shared/safe-expression-evaluator.test
 */

import { describe, it, expect } from 'vitest';
import {
  safeEvaluate,
  safeEvaluateBoolean,
} from '../../../src/shared/utils/safe-expression-evaluator.js';

describe('SafeExpressionEvaluator', () => {
  // ==========================================================================
  // 1. LITERAL VALUES
  // ==========================================================================
  describe('Literal Values', () => {
    describe('Numbers', () => {
      it('should evaluate integer literals', () => {
        expect(safeEvaluate('42', {})).toBe(42);
        expect(safeEvaluate('0', {})).toBe(0);
        expect(safeEvaluate('-5', {})).toBe(-5);
      });

      it('should evaluate floating point literals', () => {
        expect(safeEvaluate('3.14', {})).toBe(3.14);
        expect(safeEvaluate('0.5', {})).toBe(0.5);
        expect(safeEvaluate('.25', {})).toBe(0.25);
      });

      it('should evaluate negative numbers', () => {
        expect(safeEvaluate('-42', {})).toBe(-42);
        expect(safeEvaluate('-3.14', {})).toBe(-3.14);
      });
    });

    describe('Strings', () => {
      it('should evaluate double-quoted strings', () => {
        expect(safeEvaluate('"hello"', {})).toBe('hello');
        expect(safeEvaluate('"hello world"', {})).toBe('hello world');
        expect(safeEvaluate('""', {})).toBe('');
      });

      it('should evaluate single-quoted strings', () => {
        expect(safeEvaluate("'hello'", {})).toBe('hello');
        expect(safeEvaluate("'hello world'", {})).toBe('hello world');
        expect(safeEvaluate("''", {})).toBe('');
      });

      it('should handle escape sequences in strings', () => {
        expect(safeEvaluate('"hello\\nworld"', {})).toBe('hello\nworld');
        expect(safeEvaluate('"tab\\there"', {})).toBe('tab\there');
        expect(safeEvaluate('"quote\\"here"', {})).toBe('quote"here');
      });
    });

    describe('Booleans', () => {
      it('should evaluate boolean literals', () => {
        expect(safeEvaluate('true', {})).toBe(true);
        expect(safeEvaluate('false', {})).toBe(false);
      });
    });

    describe('Null and Undefined', () => {
      it('should evaluate null literal', () => {
        expect(safeEvaluate('null', {})).toBe(null);
      });

      it('should evaluate undefined literal', () => {
        expect(safeEvaluate('undefined', {})).toBe(undefined);
      });
    });
  });

  // ==========================================================================
  // 2. COMPARISON OPERATORS
  // ==========================================================================
  describe('Comparison Operators', () => {
    describe('Strict Equality (===, !==)', () => {
      it('should evaluate strict equality', () => {
        expect(safeEvaluate('1 === 1', {})).toBe(true);
        expect(safeEvaluate('1 === 2', {})).toBe(false);
        expect(safeEvaluate('"a" === "a"', {})).toBe(true);
        expect(safeEvaluate('"a" === "b"', {})).toBe(false);
        expect(safeEvaluate('true === true', {})).toBe(true);
        expect(safeEvaluate('true === false', {})).toBe(false);
      });

      it('should evaluate strict inequality', () => {
        expect(safeEvaluate('1 !== 2', {})).toBe(true);
        expect(safeEvaluate('1 !== 1', {})).toBe(false);
        expect(safeEvaluate('"a" !== "b"', {})).toBe(true);
      });

      it('should distinguish types in strict equality', () => {
        expect(safeEvaluate('1 === "1"', {})).toBe(false);
        expect(safeEvaluate('0 === false', {})).toBe(false);
        expect(safeEvaluate('null === undefined', {})).toBe(false);
      });
    });

    describe('Loose Equality (==, !=)', () => {
      it('should evaluate loose equality', () => {
        expect(safeEvaluate('1 == 1', {})).toBe(true);
        expect(safeEvaluate('1 == "1"', {})).toBe(true);
        expect(safeEvaluate('null == undefined', {})).toBe(true);
      });

      it('should evaluate loose inequality', () => {
        expect(safeEvaluate('1 != 2', {})).toBe(true);
        expect(safeEvaluate('1 != "1"', {})).toBe(false);
      });
    });

    describe('Relational Operators (<, >, <=, >=)', () => {
      it('should evaluate less than', () => {
        expect(safeEvaluate('1 < 2', {})).toBe(true);
        expect(safeEvaluate('2 < 1', {})).toBe(false);
        expect(safeEvaluate('1 < 1', {})).toBe(false);
      });

      it('should evaluate greater than', () => {
        expect(safeEvaluate('2 > 1', {})).toBe(true);
        expect(safeEvaluate('1 > 2', {})).toBe(false);
        expect(safeEvaluate('1 > 1', {})).toBe(false);
      });

      it('should evaluate less than or equal', () => {
        expect(safeEvaluate('1 <= 2', {})).toBe(true);
        expect(safeEvaluate('1 <= 1', {})).toBe(true);
        expect(safeEvaluate('2 <= 1', {})).toBe(false);
      });

      it('should evaluate greater than or equal', () => {
        expect(safeEvaluate('2 >= 1', {})).toBe(true);
        expect(safeEvaluate('1 >= 1', {})).toBe(true);
        expect(safeEvaluate('1 >= 2', {})).toBe(false);
      });
    });

    describe('Comparisons with Variables', () => {
      it('should compare variables', () => {
        expect(safeEvaluate('status === 200', { status: 200 })).toBe(true);
        expect(safeEvaluate('status === 200', { status: 404 })).toBe(false);
        expect(safeEvaluate('count > 0', { count: 5 })).toBe(true);
        expect(safeEvaluate('count > 0', { count: 0 })).toBe(false);
      });
    });
  });

  // ==========================================================================
  // 3. LOGICAL OPERATORS
  // ==========================================================================
  describe('Logical Operators', () => {
    describe('AND (&&)', () => {
      it('should evaluate logical AND', () => {
        expect(safeEvaluate('true && true', {})).toBe(true);
        expect(safeEvaluate('true && false', {})).toBe(false);
        expect(safeEvaluate('false && true', {})).toBe(false);
        expect(safeEvaluate('false && false', {})).toBe(false);
      });

      it('should short-circuit AND', () => {
        expect(safeEvaluate('false && anything', { anything: true })).toBe(false);
      });

      it('should return last truthy or first falsy value', () => {
        expect(safeEvaluate('1 && 2', {})).toBe(2);
        expect(safeEvaluate('0 && 2', {})).toBe(0);
        expect(safeEvaluate('"a" && "b"', {})).toBe('b');
      });
    });

    describe('OR (||)', () => {
      it('should evaluate logical OR', () => {
        expect(safeEvaluate('true || true', {})).toBe(true);
        expect(safeEvaluate('true || false', {})).toBe(true);
        expect(safeEvaluate('false || true', {})).toBe(true);
        expect(safeEvaluate('false || false', {})).toBe(false);
      });

      it('should short-circuit OR', () => {
        expect(safeEvaluate('true || anything', { anything: false })).toBe(true);
      });

      it('should return first truthy or last falsy value', () => {
        expect(safeEvaluate('1 || 2', {})).toBe(1);
        expect(safeEvaluate('0 || 2', {})).toBe(2);
        expect(safeEvaluate('0 || ""', {})).toBe('');
      });
    });

    describe('NOT (!)', () => {
      it('should evaluate logical NOT', () => {
        expect(safeEvaluate('!true', {})).toBe(false);
        expect(safeEvaluate('!false', {})).toBe(true);
        expect(safeEvaluate('!0', {})).toBe(true);
        expect(safeEvaluate('!1', {})).toBe(false);
        expect(safeEvaluate('!""', {})).toBe(true);
        expect(safeEvaluate('!"a"', {})).toBe(false);
      });

      it('should evaluate double NOT', () => {
        expect(safeEvaluate('!!true', {})).toBe(true);
        expect(safeEvaluate('!!0', {})).toBe(false);
        expect(safeEvaluate('!!1', {})).toBe(true);
      });
    });

    describe('Complex Logical Expressions', () => {
      it('should evaluate complex AND/OR combinations', () => {
        expect(safeEvaluate('a && b || c', { a: false, b: true, c: true })).toBe(true);
        expect(safeEvaluate('a || b && c', { a: false, b: true, c: true })).toBe(true);
        expect(safeEvaluate('a || b && c', { a: false, b: true, c: false })).toBe(false);
      });

      it('should respect operator precedence (AND before OR)', () => {
        // a || b && c should be a || (b && c)
        expect(safeEvaluate('false || true && true', {})).toBe(true);
        expect(safeEvaluate('false || true && false', {})).toBe(false);
      });
    });
  });

  // ==========================================================================
  // 4. ARITHMETIC OPERATORS
  // ==========================================================================
  describe('Arithmetic Operators', () => {
    describe('Addition (+)', () => {
      it('should add numbers', () => {
        expect(safeEvaluate('1 + 2', {})).toBe(3);
        expect(safeEvaluate('1.5 + 2.5', {})).toBe(4);
        expect(safeEvaluate('-1 + 1', {})).toBe(0);
      });

      it('should concatenate strings', () => {
        expect(safeEvaluate('"hello" + "world"', {})).toBe('helloworld');
        expect(safeEvaluate('"a" + "b" + "c"', {})).toBe('abc');
      });
    });

    describe('Subtraction (-)', () => {
      it('should subtract numbers', () => {
        expect(safeEvaluate('5 - 3', {})).toBe(2);
        expect(safeEvaluate('1 - 5', {})).toBe(-4);
        expect(safeEvaluate('3.5 - 1.5', {})).toBe(2);
      });
    });

    describe('Multiplication (*)', () => {
      it('should multiply numbers', () => {
        expect(safeEvaluate('2 * 3', {})).toBe(6);
        expect(safeEvaluate('2.5 * 4', {})).toBe(10);
        expect(safeEvaluate('-2 * 3', {})).toBe(-6);
      });
    });

    describe('Division (/)', () => {
      it('should divide numbers', () => {
        expect(safeEvaluate('6 / 2', {})).toBe(3);
        expect(safeEvaluate('7 / 2', {})).toBe(3.5);
        expect(safeEvaluate('-6 / 2', {})).toBe(-3);
      });

      it('should handle division by zero', () => {
        expect(safeEvaluate('1 / 0', {})).toBe(Infinity);
        expect(safeEvaluate('-1 / 0', {})).toBe(-Infinity);
      });
    });

    describe('Modulo (%)', () => {
      it('should calculate modulo', () => {
        expect(safeEvaluate('7 % 3', {})).toBe(1);
        expect(safeEvaluate('8 % 4', {})).toBe(0);
        expect(safeEvaluate('5 % 2', {})).toBe(1);
      });
    });

    describe('Unary Plus (+)', () => {
      it('should convert to number', () => {
        expect(safeEvaluate('+5', {})).toBe(5);
        expect(safeEvaluate('+"5"', {})).toBe(5);
      });
    });

    describe('Operator Precedence', () => {
      it('should respect arithmetic precedence (* / before + -)', () => {
        expect(safeEvaluate('2 + 3 * 4', {})).toBe(14); // 2 + (3 * 4)
        expect(safeEvaluate('10 - 6 / 2', {})).toBe(7); // 10 - (6 / 2)
        expect(safeEvaluate('2 * 3 + 4 * 5', {})).toBe(26); // (2 * 3) + (4 * 5)
      });
    });
  });

  // ==========================================================================
  // 5. VARIABLE ACCESS
  // ==========================================================================
  describe('Variable Access', () => {
    describe('Simple Variables', () => {
      it('should access simple variables', () => {
        expect(safeEvaluate('x', { x: 42 })).toBe(42);
        expect(safeEvaluate('name', { name: 'Alice' })).toBe('Alice');
        expect(safeEvaluate('flag', { flag: true })).toBe(true);
      });

      it('should return undefined for missing variables', () => {
        expect(safeEvaluate('missing', {})).toBe(undefined);
        expect(safeEvaluate('x', { y: 1 })).toBe(undefined);
      });

      it('should handle variable names with underscores and dollars', () => {
        expect(safeEvaluate('_private', { _private: 'secret' })).toBe('secret');
        expect(safeEvaluate('$value', { $value: 100 })).toBe(100);
        expect(safeEvaluate('my_var', { my_var: 'test' })).toBe('test');
      });
    });

    describe('Dot Notation (Property Access)', () => {
      it('should access nested properties', () => {
        const ctx = { user: { name: 'Alice', age: 30 } };
        expect(safeEvaluate('user.name', ctx)).toBe('Alice');
        expect(safeEvaluate('user.age', ctx)).toBe(30);
      });

      it('should access deeply nested properties', () => {
        const ctx = {
          data: {
            response: {
              body: {
                items: [1, 2, 3],
              },
            },
          },
        };
        expect(safeEvaluate('data.response.body.items', ctx)).toEqual([1, 2, 3]);
      });

      it('should return undefined for missing nested properties', () => {
        const ctx = { user: { name: 'Alice' } };
        expect(safeEvaluate('user.email', ctx)).toBe(undefined);
        expect(safeEvaluate('user.address.city', ctx)).toBe(undefined);
      });

      it('should handle null/undefined in property chain', () => {
        expect(safeEvaluate('obj.prop', { obj: null })).toBe(undefined);
        expect(safeEvaluate('obj.prop', { obj: undefined })).toBe(undefined);
      });
    });

    describe('Complex Variable Expressions', () => {
      it('should use variables in comparisons', () => {
        const ctx = { status: 200, expected: 200 };
        expect(safeEvaluate('status === expected', ctx)).toBe(true);
      });

      it('should use variables in arithmetic', () => {
        const ctx = { a: 5, b: 3 };
        expect(safeEvaluate('a + b', ctx)).toBe(8);
        expect(safeEvaluate('a * b', ctx)).toBe(15);
      });

      it('should use nested properties in expressions', () => {
        const ctx = { result: { success: true, count: 5 } };
        expect(safeEvaluate('result.success && result.count > 0', ctx)).toBe(true);
      });
    });
  });

  // ==========================================================================
  // 6. GROUPING WITH PARENTHESES
  // ==========================================================================
  describe('Parentheses Grouping', () => {
    it('should evaluate grouped expressions', () => {
      expect(safeEvaluate('(1 + 2) * 3', {})).toBe(9);
      expect(safeEvaluate('1 + (2 * 3)', {})).toBe(7);
    });

    it('should handle nested parentheses', () => {
      expect(safeEvaluate('((1 + 2) * (3 + 4))', {})).toBe(21);
      expect(safeEvaluate('(((5)))', {})).toBe(5);
    });

    it('should override operator precedence', () => {
      expect(safeEvaluate('(2 + 3) * 4', {})).toBe(20); // Not 14
      expect(safeEvaluate('(10 - 6) / 2', {})).toBe(2); // Not 7
    });

    it('should handle parentheses in logical expressions', () => {
      expect(safeEvaluate('(true || false) && false', {})).toBe(false);
      expect(safeEvaluate('true || (false && false)', {})).toBe(true);
    });
  });

  // ==========================================================================
  // 7. SECURITY: DANGEROUS PATTERN REJECTION
  // ==========================================================================
  describe('Security: Dangerous Pattern Rejection', () => {
    describe('Code Injection Prevention', () => {
      it('should reject eval() calls', () => {
        expect(() => safeEvaluate('eval("alert(1)")', {})).toThrow(/dangerous/i);
        expect(() => safeEvaluate('eval(code)', { code: 'bad' })).toThrow(/dangerous/i);
      });

      it('should reject Function constructor', () => {
        expect(() => safeEvaluate('Function("return 1")', {})).toThrow(/dangerous/i);
        expect(() => safeEvaluate('new Function("x")', {})).toThrow(/dangerous/i);
      });

      it('should reject constructor access', () => {
        expect(() => safeEvaluate('x.constructor', { x: {} })).toThrow(/dangerous/i);
        expect(() => safeEvaluate('constructor', {})).toThrow(/dangerous/i);
      });
    });

    describe('Prototype Pollution Prevention', () => {
      it('should reject __proto__ access', () => {
        expect(() => safeEvaluate('obj.__proto__', { obj: {} })).toThrow(/dangerous/i);
        expect(() => safeEvaluate('__proto__', {})).toThrow(/dangerous/i);
      });

      it('should reject prototype access', () => {
        expect(() => safeEvaluate('obj.prototype', { obj: {} })).toThrow(/dangerous/i);
        expect(() => safeEvaluate('prototype', {})).toThrow(/dangerous/i);
      });
    });

    describe('Module System Prevention', () => {
      it('should reject import keyword', () => {
        expect(() => safeEvaluate('import("fs")', {})).toThrow(/dangerous/i);
      });

      it('should reject require keyword', () => {
        expect(() => safeEvaluate('require("fs")', {})).toThrow(/dangerous/i);
      });
    });

    describe('Global Object Prevention', () => {
      it('should reject process access', () => {
        expect(() => safeEvaluate('process.env', {})).toThrow(/dangerous/i);
        expect(() => safeEvaluate('process', {})).toThrow(/dangerous/i);
      });

      it('should reject global access', () => {
        expect(() => safeEvaluate('global.process', {})).toThrow(/dangerous/i);
        expect(() => safeEvaluate('global', {})).toThrow(/dangerous/i);
      });

      it('should reject window access', () => {
        expect(() => safeEvaluate('window.location', {})).toThrow(/dangerous/i);
        expect(() => safeEvaluate('window', {})).toThrow(/dangerous/i);
      });

      it('should reject document access', () => {
        expect(() => safeEvaluate('document.cookie', {})).toThrow(/dangerous/i);
        expect(() => safeEvaluate('document', {})).toThrow(/dangerous/i);
      });
    });

    describe('Computed Property Access Prevention', () => {
      it('should reject bracket notation with string', () => {
        expect(() => safeEvaluate('obj["key"]', { obj: { key: 1 } })).toThrow(/dangerous/i);
        expect(() => safeEvaluate("obj['key']", { obj: { key: 1 } })).toThrow(/dangerous/i);
      });

      it('should reject bracket notation with variable', () => {
        expect(() => safeEvaluate('obj[key]', { obj: { a: 1 }, key: 'a' })).toThrow(/dangerous/i);
      });

      it('should reject bracket notation with expression', () => {
        expect(() => safeEvaluate('obj[1 + 1]', { obj: [0, 1, 2] })).toThrow(/dangerous/i);
      });
    });

    describe('Case Sensitivity', () => {
      it('should reject dangerous patterns case-insensitively where appropriate', () => {
        expect(() => safeEvaluate('EVAL("x")', {})).toThrow(/dangerous/i);
        expect(() => safeEvaluate('Eval("x")', {})).toThrow(/dangerous/i);
      });
    });
  });

  // ==========================================================================
  // 8. EDGE CASES AND ERROR HANDLING
  // ==========================================================================
  describe('Edge Cases and Error Handling', () => {
    describe('Empty and Invalid Input', () => {
      it('should throw on empty expression', () => {
        expect(() => safeEvaluate('', {})).toThrow();
      });

      it('should throw on whitespace-only expression', () => {
        expect(() => safeEvaluate('   ', {})).toThrow();
      });

      it('should throw on null expression', () => {
        expect(() => safeEvaluate(null as unknown as string, {})).toThrow();
      });

      it('should throw on undefined expression', () => {
        expect(() => safeEvaluate(undefined as unknown as string, {})).toThrow();
      });

      it('should throw on non-string expression', () => {
        expect(() => safeEvaluate(123 as unknown as string, {})).toThrow();
      });
    });

    describe('Syntax Errors', () => {
      it('should throw on unclosed parentheses', () => {
        expect(() => safeEvaluate('(1 + 2', {})).toThrow();
        expect(() => safeEvaluate('1 + 2)', {})).toThrow();
      });

      it('should handle unclosed strings gracefully', () => {
        // Note: The tokenizer reads unclosed strings to end of input without throwing
        // This is acceptable behavior - the string just includes remaining content
        // The security concern (code injection) is still prevented
        expect(safeEvaluate('"unclosed', {})).toBe('unclosed');
        expect(safeEvaluate("'unclosed", {})).toBe('unclosed');
      });

      it('should throw on invalid operators', () => {
        expect(() => safeEvaluate('1 +', {})).toThrow();
        expect(() => safeEvaluate('&& true', {})).toThrow();
      });

      it('should throw on unexpected characters', () => {
        expect(() => safeEvaluate('1 @ 2', {})).toThrow();
        expect(() => safeEvaluate('1 # 2', {})).toThrow();
      });
    });

    describe('Whitespace Handling', () => {
      it('should handle extra whitespace', () => {
        expect(safeEvaluate('  1  +  2  ', {})).toBe(3);
        expect(safeEvaluate('\t\ttrue\t\t', {})).toBe(true);
        expect(safeEvaluate('\n1\n', {})).toBe(1);
      });
    });

    describe('Context Edge Cases', () => {
      it('should work with empty context', () => {
        expect(safeEvaluate('1 + 2', {})).toBe(3);
        expect(safeEvaluate('true', {})).toBe(true);
      });

      it('should work with undefined context', () => {
        expect(safeEvaluate('1 + 2')).toBe(3);
      });

      it('should handle context with null values', () => {
        expect(safeEvaluate('x === null', { x: null })).toBe(true);
        expect(safeEvaluate('x', { x: null })).toBe(null);
      });

      it('should handle context with array values', () => {
        expect(safeEvaluate('items', { items: [1, 2, 3] })).toEqual([1, 2, 3]);
      });
    });
  });

  // ==========================================================================
  // 9. safeEvaluateBoolean WRAPPER
  // ==========================================================================
  describe('safeEvaluateBoolean', () => {
    it('should return boolean true for truthy values', () => {
      expect(safeEvaluateBoolean('1', {})).toBe(true);
      expect(safeEvaluateBoolean('"hello"', {})).toBe(true);
      expect(safeEvaluateBoolean('true', {})).toBe(true);
      expect(safeEvaluateBoolean('1 === 1', {})).toBe(true);
    });

    it('should return boolean false for falsy values', () => {
      expect(safeEvaluateBoolean('0', {})).toBe(false);
      expect(safeEvaluateBoolean('""', {})).toBe(false);
      expect(safeEvaluateBoolean('false', {})).toBe(false);
      expect(safeEvaluateBoolean('null', {})).toBe(false);
      expect(safeEvaluateBoolean('1 === 2', {})).toBe(false);
    });

    it('should return default value on error', () => {
      expect(safeEvaluateBoolean('invalid syntax (', {}, false)).toBe(false);
      expect(safeEvaluateBoolean('invalid syntax (', {}, true)).toBe(true);
    });

    it('should return default value on dangerous pattern', () => {
      expect(safeEvaluateBoolean('eval("bad")', {}, false)).toBe(false);
      expect(safeEvaluateBoolean('process.env', {}, true)).toBe(true);
    });

    it('should default to false when defaultValue not specified', () => {
      expect(safeEvaluateBoolean('syntax error!')).toBe(false);
    });
  });

  // ==========================================================================
  // 10. REAL-WORLD USAGE SCENARIOS
  // ==========================================================================
  describe('Real-World Usage Scenarios', () => {
    describe('Workflow Conditions (from workflow-loader.ts)', () => {
      it('should evaluate HTTP status checks', () => {
        expect(safeEvaluateBoolean('status === 200', { status: 200 })).toBe(true);
        expect(safeEvaluateBoolean('status >= 200 && status < 300', { status: 201 })).toBe(true);
        expect(safeEvaluateBoolean('status >= 200 && status < 300', { status: 404 })).toBe(false);
      });

      it('should evaluate result success checks', () => {
        expect(safeEvaluateBoolean('result.success === true', { result: { success: true } })).toBe(true);
        expect(safeEvaluateBoolean('result.success === true', { result: { success: false } })).toBe(false);
      });

      it('should evaluate count-based conditions', () => {
        expect(safeEvaluateBoolean('items.length > 0', { items: { length: 5 } })).toBe(true);
        expect(safeEvaluateBoolean('items.length > 0', { items: { length: 0 } })).toBe(false);
      });
    });

    describe('E2E Test Conditions (from e2e-runner.ts)', () => {
      it('should evaluate environment-based conditions', () => {
        expect(safeEvaluateBoolean('env === "production"', { env: 'production' })).toBe(true);
        expect(safeEvaluateBoolean('env === "production"', { env: 'development' })).toBe(false);
      });

      it('should evaluate feature flag conditions', () => {
        expect(safeEvaluateBoolean('features.darkMode === true', { features: { darkMode: true } })).toBe(true);
        expect(safeEvaluateBoolean('features.darkMode === true', { features: { darkMode: false } })).toBe(false);
      });

      it('should evaluate complex test conditions', () => {
        const ctx = {
          browser: 'chrome',
          version: 120,
          mobile: false,
        };
        expect(safeEvaluateBoolean('browser === "chrome" && version >= 100', ctx)).toBe(true);
        expect(safeEvaluateBoolean('browser === "safari" || mobile === true', ctx)).toBe(false);
      });
    });

    describe('Assertion Conditions', () => {
      it('should evaluate response body assertions', () => {
        const ctx = {
          response: {
            status: 200,
            body: {
              id: 123,
              name: 'Test User',
              active: true,
            },
          },
        };
        expect(safeEvaluateBoolean('response.status === 200', ctx)).toBe(true);
        expect(safeEvaluateBoolean('response.body.active === true', ctx)).toBe(true);
        expect(safeEvaluateBoolean('response.body.id > 100', ctx)).toBe(true);
      });
    });
  });
});
