import { Validators } from '@utils/Validators';

describe('Validators Comprehensive Tests', () => {
  describe('String Validation', () => {
    it('should validate non-empty strings', () => {
      expect(Validators.isNonEmptyString('test')).toBe(true);
      expect(Validators.isNonEmptyString('')).toBe(false);
      expect(Validators.isNonEmptyString('   ')).toBe(false);
    });

    it('should validate email addresses', () => {
      expect(Validators.isEmail('test@example.com')).toBe(true);
      expect(Validators.isEmail('invalid.email')).toBe(false);
      expect(Validators.isEmail('@example.com')).toBe(false);
    });

    it('should validate URLs', () => {
      expect(Validators.isURL('https://example.com')).toBe(true);
      expect(Validators.isURL('http://example.com')).toBe(true);
      expect(Validators.isURL('not-a-url')).toBe(false);
    });

    it('should validate string length', () => {
      expect(Validators.hasMinLength('test', 3)).toBe(true);
      expect(Validators.hasMinLength('ab', 3)).toBe(false);
      expect(Validators.hasMaxLength('test', 5)).toBe(true);
      expect(Validators.hasMaxLength('toolong', 5)).toBe(false);
    });

    it('should validate regex patterns', () => {
      expect(Validators.matchesPattern('abc123', /^[a-z0-9]+$/)).toBe(true);
      expect(Validators.matchesPattern('ABC', /^[a-z]+$/)).toBe(false);
    });

    it('should validate alphanumeric strings', () => {
      expect(Validators.isAlphanumeric('test123')).toBe(true);
      expect(Validators.isAlphanumeric('test-123')).toBe(false);
    });

    it('should validate UUID format', () => {
      expect(Validators.isUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(Validators.isUUID('invalid-uuid')).toBe(false);
    });
  });

  describe('Number Validation', () => {
    it('should validate numbers', () => {
      expect(Validators.isNumber(42)).toBe(true);
      expect(Validators.isNumber('42')).toBe(false);
      expect(Validators.isNumber(NaN)).toBe(false);
    });

    it('should validate integers', () => {
      expect(Validators.isInteger(42)).toBe(true);
      expect(Validators.isInteger(42.5)).toBe(false);
    });

    it('should validate positive numbers', () => {
      expect(Validators.isPositive(42)).toBe(true);
      expect(Validators.isPositive(0)).toBe(false);
      expect(Validators.isPositive(-5)).toBe(false);
    });

    it('should validate number ranges', () => {
      expect(Validators.isInRange(5, 1, 10)).toBe(true);
      expect(Validators.isInRange(0, 1, 10)).toBe(false);
      expect(Validators.isInRange(15, 1, 10)).toBe(false);
    });

    it('should validate percentage values', () => {
      expect(Validators.isPercentage(50)).toBe(true);
      expect(Validators.isPercentage(0)).toBe(true);
      expect(Validators.isPercentage(100)).toBe(true);
      expect(Validators.isPercentage(-1)).toBe(false);
      expect(Validators.isPercentage(101)).toBe(false);
    });
  });

  describe('Array Validation', () => {
    it('should validate arrays', () => {
      expect(Validators.isArray([1, 2, 3])).toBe(true);
      expect(Validators.isArray('not-array')).toBe(false);
    });

    it('should validate non-empty arrays', () => {
      expect(Validators.isNonEmptyArray([1])).toBe(true);
      expect(Validators.isNonEmptyArray([])).toBe(false);
    });

    it('should validate array length', () => {
      expect(Validators.hasArrayLength([1, 2, 3], 3)).toBe(true);
      expect(Validators.hasArrayLength([1, 2], 3)).toBe(false);
    });

    it('should validate array element types', () => {
      expect(Validators.allElementsOfType([1, 2, 3], 'number')).toBe(true);
      expect(Validators.allElementsOfType(['a', 'b'], 'string')).toBe(true);
      expect(Validators.allElementsOfType([1, 'a'], 'number')).toBe(false);
    });

    it('should validate unique arrays', () => {
      expect(Validators.hasUniqueElements([1, 2, 3])).toBe(true);
      expect(Validators.hasUniqueElements([1, 2, 2])).toBe(false);
    });
  });

  describe('Object Validation', () => {
    it('should validate objects', () => {
      expect(Validators.isObject({})).toBe(true);
      expect(Validators.isObject([])).toBe(false);
      expect(Validators.isObject(null)).toBe(false);
    });

    it('should validate object properties', () => {
      const obj = { name: 'test', age: 25 };
      expect(Validators.hasProperty(obj, 'name')).toBe(true);
      expect(Validators.hasProperty(obj, 'email')).toBe(false);
    });

    it('should validate required properties', () => {
      const obj = { name: 'test', age: 25 };
      expect(Validators.hasRequiredProperties(obj, ['name', 'age'])).toBe(true);
      expect(Validators.hasRequiredProperties(obj, ['name', 'email'])).toBe(false);
    });

    it('should validate property types', () => {
      const obj = { name: 'test', age: 25 };
      const schema = { name: 'string', age: 'number' };
      expect(Validators.matchesSchema(obj, schema)).toBe(true);
    });

    it('should validate nested objects', () => {
      const obj = {
        user: { name: 'John', age: 30 },
        address: { city: 'NYC' }
      };
      expect(Validators.hasNestedProperty(obj, 'user.name')).toBe(true);
      expect(Validators.hasNestedProperty(obj, 'user.email')).toBe(false);
    });
  });

  describe('Date Validation', () => {
    it('should validate dates', () => {
      expect(Validators.isDate(new Date())).toBe(true);
      expect(Validators.isDate('2024-01-01')).toBe(false);
    });

    it('should validate date strings', () => {
      expect(Validators.isValidDateString('2024-01-01')).toBe(true);
      expect(Validators.isValidDateString('invalid-date')).toBe(false);
    });

    it('should validate date ranges', () => {
      const now = new Date();
      const yesterday = new Date(Date.now() - 86400000);
      const tomorrow = new Date(Date.now() + 86400000);
      expect(Validators.isDateInRange(now, yesterday, tomorrow)).toBe(true);
      expect(Validators.isDateInRange(yesterday, now, tomorrow)).toBe(false);
    });

    it('should validate future dates', () => {
      const future = new Date(Date.now() + 86400000);
      const past = new Date(Date.now() - 86400000);
      expect(Validators.isFutureDate(future)).toBe(true);
      expect(Validators.isFutureDate(past)).toBe(false);
    });
  });

  describe('File Validation', () => {
    it('should validate file extensions', () => {
      expect(Validators.hasValidExtension('file.txt', ['.txt', '.md'])).toBe(true);
      expect(Validators.hasValidExtension('file.exe', ['.txt', '.md'])).toBe(false);
    });

    it('should validate file paths', () => {
      expect(Validators.isValidPath('/valid/path/file.txt')).toBe(true);
      expect(Validators.isValidPath('')).toBe(false);
    });

    it('should validate file names', () => {
      expect(Validators.isValidFileName('valid-file.txt')).toBe(true);
      expect(Validators.isValidFileName('invalid/file.txt')).toBe(false);
      expect(Validators.isValidFileName('invalid\\file.txt')).toBe(false);
    });
  });

  describe('Credential Validation', () => {
    it('should validate passwords', () => {
      expect(Validators.isStrongPassword('StrongP@ss123')).toBe(true);
      expect(Validators.isStrongPassword('weak')).toBe(false);
    });

    it('should validate API keys', () => {
      expect(Validators.isValidAPIKey('sk-1234567890abcdef')).toBe(true);
      expect(Validators.isValidAPIKey('invalid')).toBe(false);
    });

    it('should validate tokens', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.xxx';
      expect(Validators.isValidJWT(token)).toBe(true);
      expect(Validators.isValidJWT('invalid-token')).toBe(false);
    });
  });

  describe('Network Validation', () => {
    it('should validate IP addresses', () => {
      expect(Validators.isIPAddress('192.168.1.1')).toBe(true);
      expect(Validators.isIPAddress('256.1.1.1')).toBe(false);
    });

    it('should validate IPv6 addresses', () => {
      expect(Validators.isIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
      expect(Validators.isIPv6('invalid-ipv6')).toBe(false);
    });

    it('should validate ports', () => {
      expect(Validators.isValidPort(8080)).toBe(true);
      expect(Validators.isValidPort(0)).toBe(false);
      expect(Validators.isValidPort(65536)).toBe(false);
    });

    it('should validate hostnames', () => {
      expect(Validators.isValidHostname('example.com')).toBe(true);
      expect(Validators.isValidHostname('sub.example.com')).toBe(true);
      expect(Validators.isValidHostname('invalid..com')).toBe(false);
    });
  });

  describe('Composite Validation', () => {
    it('should validate with multiple rules', () => {
      const rules = [
        (v: string) => v.length > 5,
        (v: string) => /[A-Z]/.test(v),
        (v: string) => /[0-9]/.test(v)
      ];
      expect(Validators.validateAll('Test123', rules)).toBe(true);
      expect(Validators.validateAll('test', rules)).toBe(false);
    });

    it('should validate with any rule', () => {
      const rules = [
        (v: string) => v.includes('@'),
        (v: string) => v.length > 10
      ];
      expect(Validators.validateAny('short', rules)).toBe(false);
      expect(Validators.validateAny('has@symbol', rules)).toBe(true);
      expect(Validators.validateAny('verylongstring', rules)).toBe(true);
    });

    it('should chain validations', () => {
      const validator = Validators.chain()
        .isString()
        .isNonEmpty()
        .hasMinLength(5)
        .matchesPattern(/^[a-z]+$/);
      expect(validator.validate('hello')).toBe(true);
      expect(validator.validate('Hi')).toBe(false);
    });
  });

  describe('Custom Validation', () => {
    it('should support custom validators', () => {
      const isEven = (n: number) => n % 2 === 0;
      expect(Validators.custom(4, isEven)).toBe(true);
      expect(Validators.custom(3, isEven)).toBe(false);
    });

    it('should register custom validators', () => {
      Validators.register('isPalindrome', (s: string) => {
        return s === s.split('').reverse().join('');
      });
      expect(Validators.validate('racecar', 'isPalindrome')).toBe(true);
      expect(Validators.validate('hello', 'isPalindrome')).toBe(false);
    });
  });

  describe('Error Messages', () => {
    it('should provide descriptive error messages', () => {
      const result = Validators.validateWithMessage('', 'isNonEmptyString');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('empty');
    });

    it('should support custom error messages', () => {
      const result = Validators.validateWithMessage(
        150,
        (v: number) => v <= 100,
        'Value must not exceed 100'
      );
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Value must not exceed 100');
    });
  });

  describe('Performance', () => {
    it('should handle bulk validation efficiently', () => {
      const data = Array(10000).fill('test@example.com');
      const start = Date.now();
      const results = data.map(email => Validators.isEmail(email));
      const duration = Date.now() - start;
      expect(results.every(r => r === true)).toBe(true);
      expect(duration).toBeLessThan(100);
    });
  });
});
