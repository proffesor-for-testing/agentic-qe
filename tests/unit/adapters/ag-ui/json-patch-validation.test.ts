/**
 * JSON Patch Validation and RFC 6902 Compliance Tests
 * Split from json-patch.test.ts
 *
 * Tests for operation validation, patch validation, and RFC 6902 compliance.
 */

import { describe, it, expect } from 'vitest';
import {
  validateOperation,
  validatePatch,
  checkCompliance,
  ensureCompliance,
  JsonPatchError,
} from '../../../../src/adapters/ag-ui/json-patch.js';
import type { JsonPatchOperation } from '../../../../src/adapters/ag-ui/event-types.js';

describe('Validation', () => {
  describe('validateOperation', () => {
    it('should validate add operation', () => {
      expect(validateOperation({ op: 'add', path: '/foo', value: 1 })).toEqual({ valid: true });
    });

    it('should validate remove operation', () => {
      expect(validateOperation({ op: 'remove', path: '/foo' })).toEqual({ valid: true });
    });

    it('should validate replace operation', () => {
      expect(validateOperation({ op: 'replace', path: '/foo', value: 2 })).toEqual({ valid: true });
    });

    it('should validate move operation', () => {
      expect(validateOperation({ op: 'move', from: '/a', path: '/b' })).toEqual({ valid: true });
    });

    it('should validate copy operation', () => {
      expect(validateOperation({ op: 'copy', from: '/a', path: '/b' })).toEqual({ valid: true });
    });

    it('should validate test operation', () => {
      expect(validateOperation({ op: 'test', path: '/foo', value: 1 })).toEqual({ valid: true });
    });

    it('should reject invalid operation type', () => {
      const result = validateOperation({ op: 'invalid' as 'add', path: '/foo', value: 1 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid operation type');
    });

    it('should reject add without value', () => {
      const result = validateOperation({ op: 'add', path: '/foo' } as JsonPatchOperation);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('requires a \'value\' field');
    });

    it('should reject move without from', () => {
      const result = validateOperation({ op: 'move', path: '/b' } as JsonPatchOperation);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('requires a \'from\' path');
    });

    it('should reject invalid path format', () => {
      const result = validateOperation({ op: 'add', path: 'invalid', value: 1 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid JSON Pointer');
    });

    it('should collect all errors', () => {
      const result = validateOperation({ op: 'invalid' as 'add', path: 'bad' } as JsonPatchOperation);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(1);
    });
  });

  describe('validatePatch', () => {
    it('should validate empty patch', () => {
      expect(validatePatch([])).toEqual({ valid: true });
    });

    it('should validate valid patch', () => {
      const patch: JsonPatchOperation[] = [
        { op: 'add', path: '/foo', value: 1 },
        { op: 'replace', path: '/bar', value: 2 },
      ];
      expect(validatePatch(patch)).toEqual({ valid: true });
    });

    it('should reject patch with invalid operation', () => {
      const patch: JsonPatchOperation[] = [
        { op: 'add', path: '/foo', value: 1 },
        { op: 'invalid' as 'add', path: '/bar', value: 2 },
      ];
      const result = validatePatch(patch);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Operation 1');
    });
  });
});

describe('RFC 6902 Compliance', () => {
  describe('checkCompliance', () => {
    it('should pass compliant patch', () => {
      const patch: JsonPatchOperation[] = [
        { op: 'add', path: '/foo', value: 1 },
        { op: 'remove', path: '/bar' },
        { op: 'replace', path: '/baz', value: 2 },
        { op: 'move', from: '/a', path: '/b' },
        { op: 'copy', from: '/c', path: '/d' },
        { op: 'test', path: '/e', value: 3 },
      ];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect invalid operation type', () => {
      const patch = [{ op: 'invalid', path: '/foo' }] as JsonPatchOperation[];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues[0].type).toBe('invalid_op');
      expect(result.issues[0].rfcSection).toBe('4');
    });

    it('should detect missing path', () => {
      const patch = [{ op: 'add', value: 1 }] as unknown as JsonPatchOperation[];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues.some(i => i.type === 'missing_path')).toBe(true);
    });

    it('should detect invalid path format', () => {
      const patch: JsonPatchOperation[] = [{ op: 'add', path: 'invalid', value: 1 }];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues[0].type).toBe('invalid_path');
    });

    it('should detect missing value for add', () => {
      const patch = [{ op: 'add', path: '/foo' }] as JsonPatchOperation[];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues[0].type).toBe('missing_value');
      expect(result.issues[0].rfcSection).toBe('4.1');
    });

    it('should detect missing value for replace', () => {
      const patch = [{ op: 'replace', path: '/foo' }] as JsonPatchOperation[];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues[0].rfcSection).toBe('4.3');
    });

    it('should detect missing from for move', () => {
      const patch = [{ op: 'move', path: '/b' }] as JsonPatchOperation[];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues[0].type).toBe('missing_from');
      expect(result.issues[0].rfcSection).toBe('4.4');
    });

    it('should detect missing from for copy', () => {
      const patch = [{ op: 'copy', path: '/b' }] as JsonPatchOperation[];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues[0].rfcSection).toBe('4.5');
    });

    it('should detect invalid from path', () => {
      const patch: JsonPatchOperation[] = [{ op: 'move', from: 'invalid', path: '/b' }];
      const result = checkCompliance(patch);
      expect(result.compliant).toBe(false);
      expect(result.issues[0].type).toBe('invalid_from');
    });
  });

  describe('ensureCompliance', () => {
    it('should not throw for compliant patch', () => {
      const patch: JsonPatchOperation[] = [{ op: 'add', path: '/foo', value: 1 }];
      expect(() => ensureCompliance(patch)).not.toThrow();
    });

    it('should throw JsonPatchError for non-compliant patch', () => {
      const patch = [{ op: 'invalid', path: '/foo' }] as JsonPatchOperation[];
      expect(() => ensureCompliance(patch)).toThrow(JsonPatchError);
    });

    it('should include compliance details in error', () => {
      const patch = [{ op: 'add', path: 'bad' }] as JsonPatchOperation[];
      try {
        ensureCompliance(patch);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonPatchError);
        expect((error as JsonPatchError).code).toBe('COMPLIANCE_FAILED');
        expect((error as JsonPatchError).details?.issues).toBeDefined();
      }
    });
  });
});
