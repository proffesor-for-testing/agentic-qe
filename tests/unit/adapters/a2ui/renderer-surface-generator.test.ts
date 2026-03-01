/**
 * A2UI Surface Generator Unit Tests
 * Split from renderer.test.ts
 *
 * Tests for the SurfaceGenerator including lifecycle, components,
 * hierarchy, data model, messages, user actions, builder integration,
 * and event emission.
 *
 * @module tests/unit/adapters/a2ui/renderer-surface-generator
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  literal,
  path,
  type ComponentNode,
  type UserActionMessage,
} from '../../../../src/adapters/a2ui/renderer/message-types.js';

import {
  createComponentBuilder,
} from '../../../../src/adapters/a2ui/renderer/component-builder.js';

import {
  SurfaceGenerator,
  createSurfaceGenerator,
  type SurfaceState,
} from '../../../../src/adapters/a2ui/renderer/surface-generator.js';

describe('SurfaceGenerator', () => {
  let generator: SurfaceGenerator;

  beforeEach(() => {
    generator = createSurfaceGenerator({
      idGenerator: () => 'generated-id',
      timestampGenerator: () => '2026-01-30T12:00:00Z',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Surface Lifecycle', () => {
    it('should create new surface', () => {
      const surface = generator.createSurface('test-surface', {
        title: 'Test',
        catalogId: 'qe-v1',
      });

      expect(surface.id).toBe('test-surface');
      expect(surface.title).toBe('Test');
      expect(surface.catalogId).toBe('qe-v1');
      expect(surface.version).toBe(1);
      expect(surface.isRendered).toBe(false);
    });

    it('should auto-generate surface ID', () => {
      const surface = generator.createSurface();
      expect(surface.id).toBe('generated-id');
    });

    it('should get surface by ID', () => {
      generator.createSurface('test');
      const surface = generator.getSurface('test');
      expect(surface).toBeDefined();
      expect(surface?.id).toBe('test');
    });

    it('should check surface existence', () => {
      generator.createSurface('exists');
      expect(generator.hasSurface('exists')).toBe(true);
      expect(generator.hasSurface('missing')).toBe(false);
    });

    it('should get surface IDs and count', () => {
      generator.createSurface('a');
      generator.createSurface('b');
      expect(generator.getSurfaceIds()).toEqual(['a', 'b']);
      expect(generator.getSurfaceCount()).toBe(2);
    });

    it('should delete surface', () => {
      generator.createSurface('test');
      const msg = generator.deleteSurface('test');

      expect(msg?.type).toBe('deleteSurface');
      expect(msg?.surfaceId).toBe('test');
      expect(generator.hasSurface('test')).toBe(false);
    });

    it('should return null when deleting non-existent surface', () => {
      const msg = generator.deleteSurface('missing');
      expect(msg).toBeNull();
    });

    it('should enforce max surfaces limit', () => {
      const limitedGenerator = createSurfaceGenerator({ maxSurfaces: 2 });
      limitedGenerator.createSurface('a');
      limitedGenerator.createSurface('b');

      expect(() => limitedGenerator.createSurface('c')).toThrow(
        'Maximum surfaces limit'
      );
    });
  });

  describe('Component Management', () => {
    beforeEach(() => {
      generator.createSurface('test');
    });

    it('should add component to surface', () => {
      const component: ComponentNode = {
        id: 'comp-1',
        type: 'Text',
        properties: { text: { literalString: 'Hello' } },
      };

      const msg = generator.addComponent('test', component);
      expect(msg?.components).toHaveLength(1);
      expect(msg?.components[0].id).toBe('comp-1');
    });

    it('should add multiple components', () => {
      const components: ComponentNode[] = [
        { id: 'a', type: 'Text', properties: {} },
        { id: 'b', type: 'Text', properties: {} },
      ];

      const msg = generator.addComponents('test', components);
      expect(msg?.components).toHaveLength(2);
    });

    it('should update component', () => {
      generator.addComponent('test', {
        id: 'comp',
        type: 'Text',
        properties: { text: { literalString: 'Old' } },
      });

      const msg = generator.updateComponent('test', 'comp', {
        properties: { text: { literalString: 'New' } },
      });

      expect(msg?.components[0].properties.text).toEqual({ literalString: 'New' });
    });

    it('should remove component', () => {
      generator.addComponents('test', [
        { id: 'a', type: 'Text', properties: {} },
        { id: 'b', type: 'Text', properties: {} },
      ]);

      const msg = generator.removeComponent('test', 'a');
      expect(msg?.components).toHaveLength(1);
      expect(msg?.components[0].id).toBe('b');
    });

    it('should get component from surface', () => {
      generator.addComponent('test', {
        id: 'comp',
        type: 'Card',
        properties: {},
      });

      const comp = generator.getComponent('test', 'comp');
      expect(comp?.type).toBe('Card');
    });

    it('should get all components from surface', () => {
      generator.addComponents('test', [
        { id: 'a', type: 'Text', properties: {} },
        { id: 'b', type: 'Text', properties: {} },
      ]);

      const comps = generator.getComponents('test');
      expect(comps).toHaveLength(2);
    });

    it('should return null for non-existent surface', () => {
      expect(generator.addComponent('missing', { id: 'x', type: 'T', properties: {} })).toBeNull();
    });
  });

  describe('Hierarchy Management', () => {
    beforeEach(() => {
      generator.createSurface('test');
      generator.addComponents('test', [
        { id: 'parent', type: 'Column', properties: {} },
        { id: 'child', type: 'Text', properties: {} },
      ]);
    });

    it('should add child to parent', () => {
      generator.addChild('test', 'parent', 'child');
      const parent = generator.getComponent('test', 'parent');
      expect(parent?.children).toContain('child');
    });

    it('should remove child from parent', () => {
      generator.addChild('test', 'parent', 'child');
      generator.removeChild('test', 'parent', 'child');
      const parent = generator.getComponent('test', 'parent');
      expect(parent?.children).not.toContain('child');
    });

    it('should set children for parent', () => {
      generator.addComponent('test', { id: 'child2', type: 'Text', properties: {} });
      generator.setChildren('test', 'parent', ['child', 'child2']);
      const parent = generator.getComponent('test', 'parent');
      expect(parent?.children).toEqual(['child', 'child2']);
    });
  });

  describe('Data Model Management', () => {
    beforeEach(() => {
      generator.createSurface('test');
    });

    it('should update surface data', () => {
      const msg = generator.updateData('test', { key: 'value' });
      expect(msg?.type).toBe('dataModelUpdate');
      expect(msg?.data).toEqual({ key: 'value' });
    });

    it('should merge data updates', () => {
      generator.updateData('test', { a: 1 });
      generator.updateData('test', { b: 2 });
      const data = generator.getData('test');
      expect(data).toEqual({ a: 1, b: 2 });
    });

    it('should set data (replace)', () => {
      generator.updateData('test', { a: 1, b: 2 });
      generator.setData('test', { c: 3 });
      const data = generator.getData('test');
      expect(data).toEqual({ c: 3 });
    });
  });

  describe('Message Generation', () => {
    beforeEach(() => {
      generator.createSurface('test', { title: 'Test Surface' });
      generator.addComponent('test', { id: 'root', type: 'Column', properties: {} });
    });

    it('should generate surfaceUpdate message', () => {
      const msg = generator.generateSurfaceUpdate('test');
      expect(msg?.type).toBe('surfaceUpdate');
      expect(msg?.surfaceId).toBe('test');
      expect(msg?.components).toHaveLength(1);
    });

    it('should generate incremental update', () => {
      generator.addComponent('test', { id: 'text', type: 'Text', properties: {} });
      const msg = generator.generateIncrementalUpdate('test', ['text']);
      expect(msg?.components).toHaveLength(1);
      expect(msg?.components[0].id).toBe('text');
    });

    it('should generate dataModelUpdate message', () => {
      generator.setData('test', { value: 42 });
      const msg = generator.generateDataModelUpdate('test');
      expect(msg?.type).toBe('dataModelUpdate');
      expect(msg?.data).toEqual({ value: 42 });
    });

    it('should generate beginRendering message', () => {
      const msg = generator.generateBeginRendering('test');
      expect(msg?.type).toBe('beginRendering');
      expect(msg?.surfaceId).toBe('test');
      expect(msg?.title).toBe('Test Surface');
      expect(msg?.rootComponentId).toBe('root');
    });

    it('should mark surface as rendered', () => {
      generator.generateBeginRendering('test');
      const surface = generator.getSurface('test');
      expect(surface?.isRendered).toBe(true);
    });

    it('should generate deleteSurface message', () => {
      const msg = generator.generateDeleteSurface('test');
      expect(msg?.type).toBe('deleteSurface');
    });

    it('should get all messages for surface', () => {
      generator.setData('test', { value: 1 });
      const msgs = generator.getAllMessages('test');

      expect(msgs?.beginRendering.type).toBe('beginRendering');
      expect(msgs?.surfaceUpdate.type).toBe('surfaceUpdate');
      expect(msgs?.dataModelUpdate.type).toBe('dataModelUpdate');
    });
  });

  describe('User Action Handling', () => {
    it('should create userAction message', () => {
      const action = generator.createUserAction('test', 'btn', 'click', { x: 1 });

      expect(action.type).toBe('userAction');
      expect(action.surfaceId).toBe('test');
      expect(action.componentId).toBe('btn');
      expect(action.actionId).toBe('click');
      expect(action.payload).toEqual({ x: 1 });
      expect(action.timestamp).toBe('2026-01-30T12:00:00Z');
    });

    it('should handle user action', () => {
      generator.createSurface('test');
      generator.addComponent('test', { id: 'btn', type: 'Button', properties: {} });

      const handler = vi.fn();
      const action: UserActionMessage = {
        type: 'userAction',
        surfaceId: 'test',
        componentId: 'btn',
        actionId: 'click',
      };

      generator.handleUserAction(action, handler);
      expect(handler).toHaveBeenCalledWith(action);
    });

    it('should throw for missing surface', () => {
      const action: UserActionMessage = {
        type: 'userAction',
        surfaceId: 'missing',
        componentId: 'btn',
        actionId: 'click',
      };

      expect(() => generator.handleUserAction(action, vi.fn())).toThrow(
        'Surface missing not found'
      );
    });

    it('should throw for missing component', () => {
      generator.createSurface('test');
      const action: UserActionMessage = {
        type: 'userAction',
        surfaceId: 'test',
        componentId: 'missing',
        actionId: 'click',
      };

      expect(() => generator.handleUserAction(action, vi.fn())).toThrow(
        'Component missing not found'
      );
    });
  });

  describe('Builder Integration', () => {
    it('should apply builder surface', () => {
      const builder = createComponentBuilder();
      builder
        .beginSurface('builder-surface')
        .addComponent('root', { type: 'Column' })
        .addChild('root', 'text', { type: 'Text' });

      const msg = generator.applyBuilder(builder);
      expect(msg?.surfaceId).toBe('builder-surface');
      expect(generator.hasSurface('builder-surface')).toBe(true);
    });

    it('should create builder for surface', () => {
      generator.createSurface('test', { title: 'Test', catalogId: 'qe-v1' });
      generator.addComponent('test', { id: 'root', type: 'Column', properties: {} });

      const builder = generator.createBuilder('test');
      expect(builder.hasComponent('root')).toBe(true);
    });
  });

  describe('Utility Methods', () => {
    it('should clear all surfaces', () => {
      generator.createSurface('a');
      generator.createSurface('b');
      generator.clear();

      expect(generator.getSurfaceCount()).toBe(0);
    });

    it('should get generator statistics', () => {
      generator.createSurface('a');
      generator.createSurface('b');
      generator.addComponents('a', [
        { id: 'c1', type: 'Text', properties: {} },
        { id: 'c2', type: 'Text', properties: {} },
      ]);
      generator.addComponent('b', { id: 'c3', type: 'Text', properties: {} });
      generator.generateBeginRendering('a');

      const stats = generator.getStats();
      expect(stats.surfaceCount).toBe(2);
      expect(stats.totalComponents).toBe(3);
      expect(stats.averageComponentsPerSurface).toBe(1.5);
      expect(stats.renderedSurfaces).toBe(1);
    });
  });

  describe('Event Emission', () => {
    it('should emit surfaceCreated event', () => {
      const handler = vi.fn();
      generator.on('surfaceCreated', handler);
      generator.createSurface('test');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'created',
          surfaceId: 'test',
        })
      );
    });

    it('should emit surfaceUpdated event', () => {
      generator.createSurface('test');
      const handler = vi.fn();
      generator.on('surfaceUpdated', handler);

      generator.addComponent('test', { id: 'comp', type: 'Text', properties: {} });
      expect(handler).toHaveBeenCalled();
    });

    it('should emit surfaceDeleted event', () => {
      generator.createSurface('test');
      const handler = vi.fn();
      generator.on('surfaceDeleted', handler);

      generator.deleteSurface('test');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deleted',
          surfaceId: 'test',
        })
      );
    });

    it('should emit surfaceRendered event', () => {
      generator.createSurface('test');
      const handler = vi.fn();
      generator.on('surfaceRendered', handler);

      generator.generateBeginRendering('test');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'rendered',
          surfaceId: 'test',
        })
      );
    });
  });
});
