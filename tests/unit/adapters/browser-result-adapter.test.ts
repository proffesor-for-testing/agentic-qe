/**
 * BrowserResultAdapter Unit Tests
 * Comprehensive test coverage for browser result adaptation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserResultAdapter, createBrowserResultAdapter } from '../../../src/adapters/browser-result-adapter.js';
import type { Result } from '../../../src/shared/types/index.js';
import { BrowserError } from '../../../src/integrations/browser/types.js';

describe('BrowserResultAdapter', () => {
  describe('wrapSuccess', () => {
    it('should wrap value in ok result', () => {
      const value = { data: 'test' };
      const result = BrowserResultAdapter.wrapSuccess(value);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(value);
      }
    });

    it('should wrap null value', () => {
      const result = BrowserResultAdapter.wrapSuccess(null);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeNull();
      }
    });

    it('should wrap undefined value', () => {
      const result = BrowserResultAdapter.wrapSuccess(undefined);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeUndefined();
      }
    });

    it('should wrap primitive values', () => {
      const stringResult = BrowserResultAdapter.wrapSuccess('test');
      const numberResult = BrowserResultAdapter.wrapSuccess(42);
      const boolResult = BrowserResultAdapter.wrapSuccess(true);

      expect(stringResult.success).toBe(true);
      expect(numberResult.success).toBe(true);
      expect(boolResult.success).toBe(true);

      if (stringResult.success) expect(stringResult.value).toBe('test');
      if (numberResult.success) expect(numberResult.value).toBe(42);
      if (boolResult.success) expect(boolResult.value).toBe(true);
    });
  });

  describe('wrapError', () => {
    it('should wrap Error instance', () => {
      const error = new Error('Test error');
      const result = BrowserResultAdapter.wrapError<string>(error);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error.message).toBe('Test error');
        expect(result.error.code).toBe('UNKNOWN_ERROR');
        expect(result.error.tool).toBe('agent-browser');
        expect(result.error.cause).toBe(error);
      }
    });

    it('should wrap BrowserError instance directly', () => {
      const browserError = new BrowserError(
        'Browser timeout',
        'BROWSER_TIMEOUT',
        'vibium'
      );
      const result = BrowserResultAdapter.wrapError<string>(browserError);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(browserError);
        expect(result.error.code).toBe('BROWSER_TIMEOUT');
        expect(result.error.tool).toBe('vibium');
      }
    });

    it('should wrap string error', () => {
      const errorMsg = 'Something went wrong';
      const result = BrowserResultAdapter.wrapError<string>(errorMsg);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error.message).toBe(errorMsg);
        expect(result.error.code).toBe('STRING_ERROR');
        expect(result.error.tool).toBe('agent-browser');
      }
    });

    it('should wrap unknown error type', () => {
      const unknownError = { weird: 'object' };
      const result = BrowserResultAdapter.wrapError<string>(unknownError);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error.message).toBe('[object Object]');
        expect(result.error.code).toBe('UNKNOWN_ERROR_TYPE');
        expect(result.error.tool).toBe('agent-browser');
      }
    });

    it('should wrap number as error', () => {
      const result = BrowserResultAdapter.wrapError<string>(404);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('404');
        expect(result.error.code).toBe('UNKNOWN_ERROR_TYPE');
      }
    });
  });

  describe('wrapAsync', () => {
    it('should wrap successful promise', async () => {
      const promise = Promise.resolve('success data');
      const result = await BrowserResultAdapter.wrapAsync(promise);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('success data');
      }
    });

    it('should wrap rejected promise', async () => {
      const promise = Promise.reject(new Error('Async failure'));
      const result = await BrowserResultAdapter.wrapAsync(promise);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error.message).toBe('Async failure');
        expect(result.error.code).toBe('UNKNOWN_ERROR');
      }
    });

    it('should wrap rejected promise with string', async () => {
      const promise = Promise.reject('String rejection');
      const result = await BrowserResultAdapter.wrapAsync(promise);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('String rejection');
        expect(result.error.code).toBe('STRING_ERROR');
      }
    });

    it('should wrap promise that resolves to null', async () => {
      const promise = Promise.resolve(null);
      const result = await BrowserResultAdapter.wrapAsync(promise);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeNull();
      }
    });

    it('should handle promise with BrowserError rejection', async () => {
      const browserError = new BrowserError(
        'Element not found',
        'ELEMENT_NOT_FOUND',
        'agent-browser'
      );
      const promise = Promise.reject(browserError);
      const result = await BrowserResultAdapter.wrapAsync(promise);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ELEMENT_NOT_FOUND');
        expect(result.error.tool).toBe('agent-browser');
      }
    });
  });

  describe('fromBrowserResponse', () => {
    it('should convert success response', () => {
      const browserResponse: Result<string, BrowserError> = {
        success: true,
        value: 'test value',
      };

      const result = BrowserResultAdapter.fromBrowserResponse(browserResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('test value');
      }
    });

    it('should convert error response', () => {
      const browserError = new BrowserError(
        'Navigation failed',
        'NAV_FAILED',
        'vibium'
      );
      const browserResponse: Result<string, BrowserError> = {
        success: false,
        error: browserError,
      };

      const result = BrowserResultAdapter.fromBrowserResponse(browserResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Navigation failed');
        expect(result.error.code).toBe('NAV_FAILED');
      }
    });

    it('should handle response with missing data gracefully', () => {
      const browserResponse: Result<undefined, BrowserError> = {
        success: true,
        value: undefined,
      };

      const result = BrowserResultAdapter.fromBrowserResponse(browserResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeUndefined();
      }
    });

    it('should preserve complex objects in success response', () => {
      const complexValue = {
        nested: { data: 'test' },
        array: [1, 2, 3],
        date: new Date('2025-01-01'),
      };
      const browserResponse: Result<typeof complexValue, BrowserError> = {
        success: true,
        value: complexValue,
      };

      const result = BrowserResultAdapter.fromBrowserResponse(browserResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(complexValue);
        expect(result.value.nested.data).toBe('test');
        expect(result.value.array).toHaveLength(3);
      }
    });

    it('should preserve error details in error response', () => {
      const cause = new Error('Root cause');
      const browserError = new BrowserError(
        'Complex error',
        'COMPLEX_ERR',
        'agent-browser',
        cause
      );
      const browserResponse: Result<string, BrowserError> = {
        success: false,
        error: browserError,
      };

      const result = BrowserResultAdapter.fromBrowserResponse(browserResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.cause).toBe(cause);
        expect(result.error.code).toBe('COMPLEX_ERR');
      }
    });
  });

  describe('createBrowserResultAdapter', () => {
    it('should return BrowserResultAdapter class', () => {
      const adapter = createBrowserResultAdapter();
      expect(adapter).toBe(BrowserResultAdapter);
    });

    it('should allow using factory function for consistency', () => {
      const adapter = createBrowserResultAdapter();
      const result = adapter.wrapSuccess('test');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('test');
      }
    });
  });

  describe('Type safety', () => {
    it('should maintain type safety for generic success values', () => {
      interface CustomType {
        id: number;
        name: string;
      }

      const value: CustomType = { id: 1, name: 'Test' };
      const result = BrowserResultAdapter.wrapSuccess<CustomType>(value);

      expect(result.success).toBe(true);
      if (result.success) {
        // TypeScript should infer the correct type
        expect(result.value.id).toBe(1);
        expect(result.value.name).toBe('Test');
      }
    });

    it('should handle union types in success values', () => {
      type UnionType = string | number | null;
      
      const stringResult = BrowserResultAdapter.wrapSuccess<UnionType>('test');
      const numberResult = BrowserResultAdapter.wrapSuccess<UnionType>(42);
      const nullResult = BrowserResultAdapter.wrapSuccess<UnionType>(null);

      expect(stringResult.success).toBe(true);
      expect(numberResult.success).toBe(true);
      expect(nullResult.success).toBe(true);
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle Error with no message', () => {
      const error = new Error();
      const result = BrowserResultAdapter.wrapError<string>(error);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('');
        expect(result.error.code).toBe('UNKNOWN_ERROR');
      }
    });

    it('should handle circular reference in error object', () => {
      const circularObj: any = { name: 'circular' };
      circularObj.self = circularObj;

      const result = BrowserResultAdapter.wrapError<string>(circularObj);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error.code).toBe('UNKNOWN_ERROR_TYPE');
      }
    });
  });
});
