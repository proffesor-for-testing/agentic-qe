/**
 * SecureValidation Edge Cases Tests
 *
 * Comprehensive tests for SecureValidation utility with edge cases,
 * boundary conditions, and security validations
 */

import { SecureValidation, ValidationConfig, ValidationError } from '@utils/SecureValidation';

describe('SecureValidation Edge Cases', () => {
  describe('Required Parameters', () => {
    test('should validate required parameters exist', () => {
      const config: ValidationConfig = {
        requiredParams: ['name', 'email', 'age']
      };

      const result = SecureValidation.validate(config, {
        name: 'John',
        email: 'john@example.com',
        age: 30
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect missing required parameters', () => {
      const config: ValidationConfig = {
        requiredParams: ['name', 'email', 'age']
      };

      const result = SecureValidation.validate(config, {
        name: 'John'
        // missing email and age
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain("Required parameter 'email' is missing");
      expect(result.errors).toContain("Required parameter 'age' is missing");
    });

    test('should handle undefined values as missing', () => {
      const config: ValidationConfig = {
        requiredParams: ['field']
      };

      const result = SecureValidation.validate(config, {
        field: undefined
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Required parameter 'field' is missing");
    });

    test('should accept null as a value for required param', () => {
      const config: ValidationConfig = {
        requiredParams: ['field']
      };

      const result = SecureValidation.validate(config, {
        field: null
      });

      expect(result.valid).toBe(true); // null is not undefined
    });

    test('should accept empty string as valid required param', () => {
      const config: ValidationConfig = {
        requiredParams: ['field']
      };

      const result = SecureValidation.validate(config, {
        field: ''
      });

      expect(result.valid).toBe(true); // empty string is defined
    });
  });

  describe('Type Checking', () => {
    test('should validate correct types', () => {
      const config: ValidationConfig = {
        typeChecks: {
          name: 'string',
          age: 'number',
          active: 'boolean',
          tags: 'array',
          metadata: 'object',
          callback: 'function'
        }
      };

      const result = SecureValidation.validate(config, {
        name: 'John',
        age: 30,
        active: true,
        tags: ['tag1', 'tag2'],
        metadata: { key: 'value' },
        callback: () => {}
      });

      expect(result.valid).toBe(true);
    });

    test('should detect type mismatches', () => {
      const config: ValidationConfig = {
        typeChecks: {
          name: 'string',
          age: 'number'
        }
      };

      const result = SecureValidation.validate(config, {
        name: 123, // should be string
        age: '30' // should be number
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain("invalid type");
      expect(result.errors[1]).toContain("invalid type");
    });

    test('should distinguish null from object', () => {
      const config: ValidationConfig = {
        typeChecks: {
          data: 'null'
        }
      };

      const validResult = SecureValidation.validate(config, { data: null });
      expect(validResult.valid).toBe(true);

      const invalidResult = SecureValidation.validate(config, { data: {} });
      expect(invalidResult.valid).toBe(false);
    });

    test('should distinguish array from object', () => {
      const config: ValidationConfig = {
        typeChecks: {
          items: 'array'
        }
      };

      const validResult = SecureValidation.validate(config, { items: [1, 2, 3] });
      expect(validResult.valid).toBe(true);

      const invalidResult = SecureValidation.validate(config, { items: { 0: 1, 1: 2 } });
      expect(invalidResult.valid).toBe(false);
    });

    test('should skip type check for undefined parameters', () => {
      const config: ValidationConfig = {
        typeChecks: {
          optionalField: 'string'
        }
      };

      const result = SecureValidation.validate(config, {});
      expect(result.valid).toBe(true); // undefined skips type check
    });
  });

  describe('Range Validation', () => {
    test('should validate number ranges', () => {
      const config: ValidationConfig = {
        rangeChecks: {
          age: { min: 0, max: 150 },
          score: { min: 0, max: 100 }
        }
      };

      const result = SecureValidation.validate(config, {
        age: 30,
        score: 85
      });

      expect(result.valid).toBe(true);
    });

    test('should detect values below minimum', () => {
      const config: ValidationConfig = {
        rangeChecks: {
          age: { min: 18 }
        }
      };

      const result = SecureValidation.validate(config, { age: 15 });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("below minimum");
    });

    test('should detect values above maximum', () => {
      const config: ValidationConfig = {
        rangeChecks: {
          score: { max: 100 }
        }
      };

      const result = SecureValidation.validate(config, { score: 150 });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("exceeds maximum");
    });

    test('should accept boundary values', () => {
      const config: ValidationConfig = {
        rangeChecks: {
          value: { min: 0, max: 100 }
        }
      };

      const minResult = SecureValidation.validate(config, { value: 0 });
      expect(minResult.valid).toBe(true);

      const maxResult = SecureValidation.validate(config, { value: 100 });
      expect(maxResult.valid).toBe(true);
    });

    test('should handle negative ranges', () => {
      const config: ValidationConfig = {
        rangeChecks: {
          temperature: { min: -273.15, max: 1000 }
        }
      };

      const result = SecureValidation.validate(config, { temperature: -100 });
      expect(result.valid).toBe(true);
    });

    test('should skip range check for non-number values', () => {
      const config: ValidationConfig = {
        rangeChecks: {
          value: { min: 0, max: 100 }
        }
      };

      const result = SecureValidation.validate(config, { value: 'not a number' });
      expect(result.valid).toBe(true); // Range check only applies to numbers
    });
  });

  describe('Pattern Validation', () => {
    test('should validate regex patterns', () => {
      const config: ValidationConfig = {
        patternChecks: {
          email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
          phone: /^\d{3}-\d{3}-\d{4}$/
        }
      };

      const result = SecureValidation.validate(config, {
        email: 'test@example.com',
        phone: '123-456-7890'
      });

      expect(result.valid).toBe(true);
    });

    test('should detect pattern mismatches', () => {
      const config: ValidationConfig = {
        patternChecks: {
          email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
        }
      };

      const result = SecureValidation.validate(config, {
        email: 'invalid-email'
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("does not match required pattern");
    });

    test('should handle special regex characters', () => {
      const config: ValidationConfig = {
        patternChecks: {
          code: /^[A-Z]{2}\d{4}$/
        }
      };

      const validResult = SecureValidation.validate(config, { code: 'AB1234' });
      expect(validResult.valid).toBe(true);

      const invalidResult = SecureValidation.validate(config, { code: 'ab1234' });
      expect(invalidResult.valid).toBe(false);
    });

    test('should skip pattern check for non-string values', () => {
      const config: ValidationConfig = {
        patternChecks: {
          value: /^test$/
        }
      };

      const result = SecureValidation.validate(config, { value: 123 });
      expect(result.valid).toBe(true); // Pattern check only applies to strings
    });
  });

  describe('Length Validation', () => {
    test('should validate string length', () => {
      const config: ValidationConfig = {
        lengthChecks: {
          username: { min: 3, max: 20 },
          password: { min: 8 }
        }
      };

      const result = SecureValidation.validate(config, {
        username: 'john_doe',
        password: 'secretpass123'
      });

      expect(result.valid).toBe(true);
    });

    test('should validate array length', () => {
      const config: ValidationConfig = {
        lengthChecks: {
          tags: { min: 1, max: 5 }
        }
      };

      const result = SecureValidation.validate(config, {
        tags: ['tag1', 'tag2', 'tag3']
      });

      expect(result.valid).toBe(true);
    });

    test('should detect length below minimum', () => {
      const config: ValidationConfig = {
        lengthChecks: {
          password: { min: 8 }
        }
      };

      const result = SecureValidation.validate(config, { password: 'short' });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("below minimum");
    });

    test('should detect length above maximum', () => {
      const config: ValidationConfig = {
        lengthChecks: {
          username: { max: 10 }
        }
      };

      const result = SecureValidation.validate(config, {
        username: 'verylongusername'
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("exceeds maximum");
    });

    test('should handle empty string', () => {
      const config: ValidationConfig = {
        lengthChecks: {
          field: { min: 1 }
        }
      };

      const result = SecureValidation.validate(config, { field: '' });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("below minimum");
    });

    test('should handle empty array', () => {
      const config: ValidationConfig = {
        lengthChecks: {
          items: { min: 1 }
        }
      };

      const result = SecureValidation.validate(config, { items: [] });

      expect(result.valid).toBe(false);
    });
  });

  describe('Enum Validation', () => {
    test('should validate enum values', () => {
      const config: ValidationConfig = {
        enumChecks: {
          status: ['active', 'inactive', 'pending'],
          role: ['admin', 'user', 'guest']
        }
      };

      const result = SecureValidation.validate(config, {
        status: 'active',
        role: 'user'
      });

      expect(result.valid).toBe(true);
    });

    test('should detect invalid enum values', () => {
      const config: ValidationConfig = {
        enumChecks: {
          status: ['active', 'inactive']
        }
      };

      const result = SecureValidation.validate(config, { status: 'unknown' });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("invalid value");
      expect(result.errors[0]).toContain("active, inactive");
    });

    test('should handle numeric enums', () => {
      const config: ValidationConfig = {
        enumChecks: {
          level: [1, 2, 3, 4, 5]
        }
      };

      const validResult = SecureValidation.validate(config, { level: 3 });
      expect(validResult.valid).toBe(true);

      const invalidResult = SecureValidation.validate(config, { level: 10 });
      expect(invalidResult.valid).toBe(false);
    });

    test('should handle mixed-type enums', () => {
      const config: ValidationConfig = {
        enumChecks: {
          value: ['yes', 'no', 1, 0, true, false]
        }
      };

      const result1 = SecureValidation.validate(config, { value: 'yes' });
      expect(result1.valid).toBe(true);

      const result2 = SecureValidation.validate(config, { value: 1 });
      expect(result2.valid).toBe(true);

      const result3 = SecureValidation.validate(config, { value: true });
      expect(result3.valid).toBe(true);
    });
  });

  describe('Custom Validators', () => {
    test('should validate JavaScript identifiers', () => {
      const config: ValidationConfig = {
        customValidatorId: 'valid-identifier'
      };

      const validResult = SecureValidation.validate(config, {
        varName: 'validIdentifier',
        funcName: '_privateFunc',
        className: '$jQuery'
      });

      expect(validResult.valid).toBe(true);
    });

    test('should detect invalid JavaScript identifiers', () => {
      const config: ValidationConfig = {
        customValidatorId: 'valid-identifier'
      };

      const result = SecureValidation.validate(config, {
        invalid: '123startWithNumber',
        alsoInvalid: 'has-dash'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should detect prototype pollution attempts', () => {
      const config: ValidationConfig = {
        customValidatorId: 'no-prototype-pollution'
      };

      const result = SecureValidation.validate(config, {
        __proto__: { isAdmin: true },
        constructor: 'malicious',
        prototype: 'value'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      expect(result.errors.some(e => e.includes('__proto__'))).toBe(true);
    });

    test('should validate safe file paths', () => {
      const config: ValidationConfig = {
        customValidatorId: 'safe-file-path'
      };

      const validResult = SecureValidation.validate(config, {
        path: '/var/log/app.log'
      });

      expect(validResult.valid).toBe(true);

      const invalidResult = SecureValidation.validate(config, {
        path: '../../../etc/passwd',
        home: '~/sensitive/file'
      });

      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });

    test('should detect shell metacharacters', () => {
      const config: ValidationConfig = {
        customValidatorId: 'no-shell-metacharacters'
      };

      const result = SecureValidation.validate(config, {
        cmd: 'ls -la',
        injection: 'rm -rf /',
        pipe: 'cat file | grep pattern',
        redirect: 'echo test > file'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should handle unknown custom validators', () => {
      const config: ValidationConfig = {
        customValidatorId: 'non-existent-validator'
      };

      const result = SecureValidation.validate(config, {});

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Unknown custom validator");
    });
  });

  describe('Combined Validations', () => {
    test('should apply multiple validation rules', () => {
      const config: ValidationConfig = {
        requiredParams: ['email', 'age'],
        typeChecks: {
          email: 'string',
          age: 'number'
        },
        rangeChecks: {
          age: { min: 18, max: 120 }
        },
        patternChecks: {
          email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
        }
      };

      const result = SecureValidation.validate(config, {
        email: 'user@example.com',
        age: 25
      });

      expect(result.valid).toBe(true);
    });

    test('should collect all validation errors', () => {
      const config: ValidationConfig = {
        requiredParams: ['name', 'email'],
        typeChecks: {
          age: 'number'
        },
        rangeChecks: {
          age: { min: 0, max: 150 }
        }
      };

      const result = SecureValidation.validate(config, {
        age: '30' // wrong type
        // missing name and email
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2); // Missing params + type error
    });
  });

  describe('Helper Methods', () => {
    test('should create required params config', () => {
      const config = SecureValidation.createRequiredParamsConfig(['field1', 'field2']);

      expect(config.requiredParams).toEqual(['field1', 'field2']);
    });

    test('should create type check config', () => {
      const config = SecureValidation.createTypeCheckConfig({
        name: 'string',
        age: 'number'
      });

      expect(config.typeChecks).toEqual({
        name: 'string',
        age: 'number'
      });
    });

    test('should check validity with isValid', () => {
      const config: ValidationConfig = {
        requiredParams: ['field']
      };

      expect(SecureValidation.isValid(config, { field: 'value' })).toBe(true);
      expect(SecureValidation.isValid(config, {})).toBe(false);
    });

    test('should throw ValidationError with validateOrThrow', () => {
      const config: ValidationConfig = {
        requiredParams: ['field']
      };

      expect(() => {
        SecureValidation.validateOrThrow(config, {});
      }).toThrow(ValidationError);

      expect(() => {
        SecureValidation.validateOrThrow(config, { field: 'value' });
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle validation errors gracefully', () => {
      const config: ValidationConfig = {
        patternChecks: {
          field: /(?=invalid)/ // Invalid regex lookahead
        }
      };

      const result = SecureValidation.validate(config, { field: 'test' });

      // Should not crash, may include error
      expect(result).toBeDefined();
      expect(result.valid).toBeDefined();
      expect(result.errors).toBeDefined();
    });

    test('should include error message in ValidationError', () => {
      const errors = ['Error 1', 'Error 2'];
      const error = new ValidationError('Test failed', errors);

      expect(error.message).toContain('Test failed');
      expect(error.message).toContain('Error 1');
      expect(error.message).toContain('Error 2');
      expect(error.errors).toEqual(errors);
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty configuration', () => {
      const config: ValidationConfig = {};
      const result = SecureValidation.validate(config, { any: 'value' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should handle empty params object', () => {
      const config: ValidationConfig = {
        requiredParams: []
      };

      const result = SecureValidation.validate(config, {});

      expect(result.valid).toBe(true);
    });

    test('should handle null config values', () => {
      const config: ValidationConfig = {
        requiredParams: undefined,
        typeChecks: undefined
      };

      const result = SecureValidation.validate(config, { field: 'value' });

      expect(result.valid).toBe(true);
    });

    test('should handle very large numbers', () => {
      const config: ValidationConfig = {
        rangeChecks: {
          value: { min: 0, max: Number.MAX_SAFE_INTEGER }
        }
      };

      const result = SecureValidation.validate(config, {
        value: Number.MAX_SAFE_INTEGER
      });

      expect(result.valid).toBe(true);
    });

    test('should handle unicode strings', () => {
      const config: ValidationConfig = {
        lengthChecks: {
          text: { min: 1, max: 100 }
        }
      };

      const result = SecureValidation.validate(config, {
        text: '你好世界 🌍 مرحبا'
      });

      expect(result.valid).toBe(true);
    });

    test('should handle special characters in patterns', () => {
      const config: ValidationConfig = {
        patternChecks: {
          special: /^[\w\-\.]+$/
        }
      };

      const result = SecureValidation.validate(config, {
        special: 'test-value_123.txt'
      });

      expect(result.valid).toBe(true);
    });
  });
});
