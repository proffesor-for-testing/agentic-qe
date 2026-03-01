/**
 * A2UI Message Types Unit Tests
 * Split from renderer.test.ts
 *
 * Tests for message type definitions and type guards.
 *
 * @module tests/unit/adapters/a2ui/renderer-message-types
 */

import { describe, it, expect } from 'vitest';

import {
  literal,
  path,
  boundWithDefault,
  children,
  templateChildren,
  a11y,
  isLiteralValue,
  isPathValue,
  isCombinedValue,
  isBoundValue,
  isExplicitList,
  isTemplateChildren,
  isSurfaceUpdateMessage,
  isDataModelUpdateMessage,
  isBeginRenderingMessage,
  isDeleteSurfaceMessage,
  isUserActionMessage,
  isClientErrorMessage,
  isServerMessage,
  isClientMessage,
  type SurfaceUpdateMessage,
  type DataModelUpdateMessage,
  type BeginRenderingMessage,
  type DeleteSurfaceMessage,
  type UserActionMessage,
  type ClientErrorMessage,
} from '../../../../src/adapters/a2ui/renderer/message-types.js';

describe('A2UI Message Types', () => {
  describe('BoundValue Factory Functions', () => {
    it('should create literal value', () => {
      const value = literal('Hello World');
      expect(value).toEqual({ literalString: 'Hello World' });
    });

    it('should create path value', () => {
      const value = path('/user/name');
      expect(value).toEqual({ path: '/user/name' });
    });

    it('should create combined value with default', () => {
      const value = boundWithDefault('Guest', '/user/name');
      expect(value).toEqual({
        literalString: 'Guest',
        path: '/user/name',
      });
    });

    it('should create children list', () => {
      const value = children('child1', 'child2', 'child3');
      expect(value).toEqual({ explicitList: ['child1', 'child2', 'child3'] });
    });

    it('should create template children', () => {
      const value = templateChildren('/items', 'item-template');
      expect(value).toEqual({
        template: {
          dataBinding: '/items',
          componentId: 'item-template',
        },
      });
    });

    it('should create accessibility attributes', () => {
      const value = a11y({
        role: 'button',
        label: 'Submit form',
        live: 'polite',
      });
      expect(value).toEqual({
        role: 'button',
        label: 'Submit form',
        live: 'polite',
      });
    });
  });

  describe('BoundValue Type Guards', () => {
    it('should identify literal value', () => {
      expect(isLiteralValue({ literalString: 'test' })).toBe(true);
      expect(isLiteralValue({ path: '/test' })).toBe(false);
      expect(isLiteralValue({ literalString: 'test', path: '/test' })).toBe(false);
      expect(isLiteralValue(null)).toBe(false);
      expect(isLiteralValue('string')).toBe(false);
    });

    it('should identify path value', () => {
      expect(isPathValue({ path: '/test' })).toBe(true);
      expect(isPathValue({ literalString: 'test' })).toBe(false);
      expect(isPathValue({ literalString: 'test', path: '/test' })).toBe(false);
      expect(isPathValue(null)).toBe(false);
    });

    it('should identify combined value', () => {
      expect(isCombinedValue({ literalString: 'test', path: '/test' })).toBe(true);
      expect(isCombinedValue({ literalString: 'test' })).toBe(false);
      expect(isCombinedValue({ path: '/test' })).toBe(false);
      expect(isCombinedValue(null)).toBe(false);
    });

    it('should identify any bound value', () => {
      expect(isBoundValue({ literalString: 'test' })).toBe(true);
      expect(isBoundValue({ path: '/test' })).toBe(true);
      expect(isBoundValue({ literalString: 'test', path: '/test' })).toBe(true);
      expect(isBoundValue({ foo: 'bar' })).toBe(false);
    });
  });

  describe('Children Type Guards', () => {
    it('should identify explicit list', () => {
      expect(isExplicitList({ explicitList: ['a', 'b'] })).toBe(true);
      expect(isExplicitList({ template: {} })).toBe(false);
      expect(isExplicitList(null)).toBe(false);
    });

    it('should identify template children', () => {
      expect(
        isTemplateChildren({
          template: { dataBinding: '/items', componentId: 'tmpl' },
        })
      ).toBe(true);
      expect(isTemplateChildren({ explicitList: [] })).toBe(false);
      expect(isTemplateChildren(null)).toBe(false);
    });
  });

  describe('Message Type Guards', () => {
    it('should identify surfaceUpdate message', () => {
      const msg: SurfaceUpdateMessage = {
        type: 'surfaceUpdate',
        surfaceId: 'test',
        version: 1,
        components: [],
      };
      expect(isSurfaceUpdateMessage(msg)).toBe(true);
      expect(isSurfaceUpdateMessage({ type: 'other' })).toBe(false);
    });

    it('should identify dataModelUpdate message', () => {
      const msg: DataModelUpdateMessage = {
        type: 'dataModelUpdate',
        surfaceId: 'test',
        data: { key: 'value' },
      };
      expect(isDataModelUpdateMessage(msg)).toBe(true);
      expect(isDataModelUpdateMessage({ type: 'other' })).toBe(false);
    });

    it('should identify beginRendering message', () => {
      const msg: BeginRenderingMessage = {
        type: 'beginRendering',
        surfaceId: 'test',
      };
      expect(isBeginRenderingMessage(msg)).toBe(true);
      expect(isBeginRenderingMessage({ type: 'other' })).toBe(false);
    });

    it('should identify deleteSurface message', () => {
      const msg: DeleteSurfaceMessage = {
        type: 'deleteSurface',
        surfaceId: 'test',
      };
      expect(isDeleteSurfaceMessage(msg)).toBe(true);
      expect(isDeleteSurfaceMessage({ type: 'other' })).toBe(false);
    });

    it('should identify userAction message', () => {
      const msg: UserActionMessage = {
        type: 'userAction',
        surfaceId: 'test',
        componentId: 'btn',
        actionId: 'click',
      };
      expect(isUserActionMessage(msg)).toBe(true);
      expect(isUserActionMessage({ type: 'other' })).toBe(false);
    });

    it('should identify clientError message', () => {
      const msg: ClientErrorMessage = {
        type: 'error',
        code: 'ERR001',
        message: 'Something went wrong',
      };
      expect(isClientErrorMessage(msg)).toBe(true);
      expect(isClientErrorMessage({ type: 'other' })).toBe(false);
    });

    it('should identify server messages', () => {
      expect(
        isServerMessage({ type: 'surfaceUpdate', surfaceId: 'x', version: 1, components: [] })
      ).toBe(true);
      expect(
        isServerMessage({ type: 'dataModelUpdate', surfaceId: 'x', data: {} })
      ).toBe(true);
      expect(isServerMessage({ type: 'beginRendering', surfaceId: 'x' })).toBe(true);
      expect(isServerMessage({ type: 'deleteSurface', surfaceId: 'x' })).toBe(true);
      expect(
        isServerMessage({ type: 'userAction', surfaceId: 'x', componentId: 'y', actionId: 'z' })
      ).toBe(false);
    });

    it('should identify client messages', () => {
      expect(
        isClientMessage({
          type: 'userAction',
          surfaceId: 'x',
          componentId: 'y',
          actionId: 'z',
        })
      ).toBe(true);
      expect(
        isClientMessage({ type: 'error', code: 'ERR', message: 'msg' })
      ).toBe(true);
      expect(
        isClientMessage({ type: 'surfaceUpdate', surfaceId: 'x', version: 1, components: [] })
      ).toBe(false);
    });
  });
});
