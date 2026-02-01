/**
 * A2UI Renderer Unit Tests
 *
 * Comprehensive tests for A2UI surface rendering engine including:
 * - Message type definitions and type guards
 * - Component builder fluent API
 * - Surface generator
 * - QE surface templates
 *
 * @module tests/unit/adapters/a2ui/renderer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Message Types
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
  type LiteralValue,
  type PathValue,
  type CombinedValue,
  type SurfaceUpdateMessage,
  type DataModelUpdateMessage,
  type BeginRenderingMessage,
  type DeleteSurfaceMessage,
  type UserActionMessage,
  type ClientErrorMessage,
  type ComponentNode,
} from '../../../../src/adapters/a2ui/renderer/message-types.js';

// Component Builder
import {
  ComponentBuilder,
  createComponentBuilder,
  row,
  column,
  card,
  text,
  button,
  list,
  buildSurface,
} from '../../../../src/adapters/a2ui/renderer/component-builder.js';

// Surface Generator
import {
  SurfaceGenerator,
  createSurfaceGenerator,
  type SurfaceState,
} from '../../../../src/adapters/a2ui/renderer/surface-generator.js';

// Templates
import {
  createCoverageSurface,
  createCoverageDataUpdate,
  createCoverageSummarySurface,
  createTestResultsSurface,
  createTestResultsDataUpdate,
  createSecuritySurface,
  createSecurityDataUpdate,
  createAccessibilitySurface,
  createAccessibilityDataUpdate,
  type CoverageData,
  type TestResults,
  type SecurityFindings,
  type A11yAudit,
} from '../../../../src/adapters/a2ui/renderer/templates/index.js';

// ============================================================================
// Message Types Tests
// ============================================================================

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

// ============================================================================
// Component Builder Tests
// ============================================================================

describe('ComponentBuilder', () => {
  let builder: ComponentBuilder;

  beforeEach(() => {
    builder = createComponentBuilder();
  });

  describe('Surface Lifecycle', () => {
    it('should begin a new surface', () => {
      builder.beginSurface('test-surface');
      const result = builder.build();
      expect(result.surfaceId).toBe('test-surface');
      expect(result.version).toBe(1);
      expect(result.components).toEqual([]);
    });

    it('should set surface title', () => {
      builder.beginSurface('test').setTitle('My Title');
      const beginMsg = builder.buildBeginRendering();
      expect(beginMsg.title).toBe('My Title');
    });

    it('should set catalog ID', () => {
      builder.beginSurface('test').setCatalog('qe-v1');
      const beginMsg = builder.buildBeginRendering();
      expect(beginMsg.catalogId).toBe('qe-v1');
    });

    it('should set and increment version', () => {
      builder.beginSurface('test').setVersion(5);
      expect(builder.build().version).toBe(5);

      builder.incrementVersion();
      expect(builder.build().version).toBe(6);
    });

    it('should throw if surface ID not set', () => {
      expect(() => builder.build()).toThrow('Surface ID is required');
    });
  });

  describe('Component Management', () => {
    beforeEach(() => {
      builder.beginSurface('test');
    });

    it('should add a component', () => {
      builder.addComponent('card-1', { type: 'Card', title: literal('Title') });
      const result = builder.build();
      expect(result.components).toHaveLength(1);
      expect(result.components[0].id).toBe('card-1');
      expect(result.components[0].type).toBe('Card');
    });

    it('should set first component as root automatically', () => {
      builder.addComponent('root', { type: 'Column' });
      const beginMsg = builder.buildBeginRendering();
      expect(beginMsg.rootComponentId).toBe('root');
    });

    it('should add child component', () => {
      builder
        .addComponent('parent', { type: 'Card' })
        .addChild('parent', 'child', { type: 'Text', text: literal('Hello') });

      const result = builder.build();
      expect(result.components).toHaveLength(2);

      const parent = result.components.find((c) => c.id === 'parent');
      expect(parent?.children).toContain('child');
    });

    it('should add multiple children at once', () => {
      builder.addComponent('parent', { type: 'Row' }).addChildren('parent', [
        { id: 'child1', type: 'Text', text: literal('One') },
        { id: 'child2', type: 'Text', text: literal('Two') },
      ]);

      const result = builder.build();
      const parent = result.components.find((c) => c.id === 'parent');
      expect(parent?.children).toEqual(['child1', 'child2']);
    });

    it('should update component properties', () => {
      builder
        .addComponent('text', { type: 'Text', text: literal('Old') })
        .updateComponent('text', { text: literal('New') });

      const result = builder.build();
      expect(result.components[0].properties.text).toEqual({ literalString: 'New' });
    });

    it('should remove component', () => {
      builder
        .addComponent('a', { type: 'Text' })
        .addComponent('b', { type: 'Text' })
        .removeComponent('a');

      const result = builder.build();
      expect(result.components).toHaveLength(1);
      expect(result.components[0].id).toBe('b');
    });

    it('should get component by ID', () => {
      builder.addComponent('test', { type: 'Card', title: literal('Test') });
      const component = builder.getComponent('test');
      expect(component).toBeDefined();
      expect(component?.type).toBe('Card');
    });

    it('should check component existence', () => {
      builder.addComponent('exists', { type: 'Text' });
      expect(builder.hasComponent('exists')).toBe(true);
      expect(builder.hasComponent('missing')).toBe(false);
    });

    it('should get component IDs and count', () => {
      builder
        .addComponent('a', { type: 'Text' })
        .addComponent('b', { type: 'Text' });

      expect(builder.getComponentIds()).toEqual(['a', 'b']);
      expect(builder.getComponentCount()).toBe(2);
    });
  });

  describe('Hierarchy Management', () => {
    beforeEach(() => {
      builder.beginSurface('test');
    });

    it('should set children for component', () => {
      builder
        .addComponent('parent', { type: 'Column' })
        .addComponent('a', { type: 'Text' })
        .addComponent('b', { type: 'Text' })
        .setChildren('parent', ['a', 'b']);

      const parent = builder.getComponent('parent');
      expect(parent?.children).toEqual(['a', 'b']);
    });

    it('should append children to existing list', () => {
      builder
        .addComponent('parent', { type: 'Column' })
        .addComponent('a', { type: 'Text' })
        .addComponent('b', { type: 'Text' })
        .setChildren('parent', ['a'])
        .appendChildren('parent', ['b']);

      const parent = builder.getComponent('parent');
      expect(parent?.children).toEqual(['a', 'b']);
    });

    it('should not duplicate children when appending', () => {
      builder
        .addComponent('parent', { type: 'Column' })
        .addComponent('a', { type: 'Text' })
        .setChildren('parent', ['a'])
        .appendChildren('parent', ['a']);

      const parent = builder.getComponent('parent');
      expect(parent?.children).toEqual(['a']);
    });

    it('should remove child from parent', () => {
      builder
        .addComponent('parent', { type: 'Column' })
        .addComponent('a', { type: 'Text' })
        .addComponent('b', { type: 'Text' })
        .setChildren('parent', ['a', 'b'])
        .removeChild('parent', 'a');

      const parent = builder.getComponent('parent');
      expect(parent?.children).toEqual(['b']);
    });

    it('should move component to new parent', () => {
      builder
        .addComponent('parent1', { type: 'Column' })
        .addComponent('parent2', { type: 'Column' })
        .addComponent('child', { type: 'Text' })
        .setChildren('parent1', ['child'])
        .moveComponent('child', 'parent2');

      expect(builder.getComponent('parent1')?.children).toEqual([]);
      expect(builder.getComponent('parent2')?.children).toEqual(['child']);
    });

    it('should get children of component', () => {
      builder
        .addComponent('parent', { type: 'Column' })
        .addComponent('a', { type: 'Text' })
        .setChildren('parent', ['a']);

      expect(builder.getChildren('parent')).toEqual(['a']);
      expect(builder.getChildren('a')).toEqual([]);
    });

    it('should find parent of component', () => {
      builder
        .addComponent('parent', { type: 'Column' })
        .addComponent('child', { type: 'Text' })
        .setChildren('parent', ['child']);

      expect(builder.getParent('child')).toBe('parent');
      expect(builder.getParent('parent')).toBeNull();
    });
  });

  describe('Build Methods', () => {
    beforeEach(() => {
      builder.beginSurface('test').setTitle('Test Surface').setCatalog('qe-v1');
    });

    it('should build surfaceUpdate message', () => {
      builder.addComponent('root', { type: 'Column' });
      const result = builder.build();

      expect(result.type).toBe('surfaceUpdate');
      expect(result.surfaceId).toBe('test');
      expect(result.version).toBe(1);
      expect(result.components).toHaveLength(1);
    });

    it('should build beginRendering message', () => {
      builder.addComponent('root', { type: 'Column' });
      const result = builder.buildBeginRendering();

      expect(result.type).toBe('beginRendering');
      expect(result.surfaceId).toBe('test');
      expect(result.title).toBe('Test Surface');
      expect(result.rootComponentId).toBe('root');
      expect(result.catalogId).toBe('qe-v1');
    });

    it('should build deleteSurface message', () => {
      const result = builder.buildDeleteSurface();

      expect(result.type).toBe('deleteSurface');
      expect(result.surfaceId).toBe('test');
    });

    it('should build all messages', () => {
      builder.addComponent('root', { type: 'Column' });
      const result = builder.buildAll();

      expect(result.beginRendering).toBeDefined();
      expect(result.surfaceUpdate).toBeDefined();
    });

    it('should build incremental update', () => {
      builder
        .addComponent('a', { type: 'Text' })
        .addComponent('b', { type: 'Text' })
        .addComponent('c', { type: 'Text' });

      const result = builder.buildIncrementalUpdate(['a', 'c']);
      expect(result.components).toHaveLength(2);
      expect(result.components.map((c) => c.id)).toEqual(['a', 'c']);
    });
  });

  describe('Clone and Reset', () => {
    it('should clone builder with current state', () => {
      builder
        .beginSurface('test')
        .setTitle('Title')
        .addComponent('a', { type: 'Text' });

      const cloned = builder.clone();
      cloned.addComponent('b', { type: 'Text' });

      expect(builder.getComponentCount()).toBe(1);
      expect(cloned.getComponentCount()).toBe(2);
    });

    it('should reset builder to initial state', () => {
      builder
        .beginSurface('test')
        .addComponent('a', { type: 'Text' })
        .reset();

      expect(builder.getComponentCount()).toBe(0);
      expect(() => builder.build()).toThrow();
    });
  });

  describe('Component Helper Functions', () => {
    it('should create row component', () => {
      const comp = row('row-1', ['a', 'b'], { spacing: 16 });
      expect(comp.type).toBe('Row');
      expect(comp.children).toEqual({ explicitList: ['a', 'b'] });
      expect(comp.spacing).toBe(16);
    });

    it('should create column component', () => {
      const comp = column('col-1', ['a', 'b']);
      expect(comp.type).toBe('Column');
      expect(comp.children).toEqual({ explicitList: ['a', 'b'] });
    });

    it('should create card component', () => {
      const comp = card('card-1', 'My Card', ['content']);
      expect(comp.type).toBe('Card');
      expect(comp.title).toEqual({ literalString: 'My Card' });
    });

    it('should create text component', () => {
      const comp = text('text-1', 'Hello');
      expect(comp.type).toBe('Text');
      expect(comp.text).toEqual({ literalString: 'Hello' });
    });

    it('should create button component', () => {
      const comp = button('btn-1', 'Click Me', 'submit');
      expect(comp.type).toBe('Button');
      expect(comp.label).toEqual({ literalString: 'Click Me' });
      expect(comp.action).toEqual({ name: 'submit' });
    });

    it('should create list component with explicit children', () => {
      const comp = list('list-1', ['item1', 'item2']);
      expect(comp.type).toBe('List');
      expect(comp.children).toEqual({ explicitList: ['item1', 'item2'] });
    });

    it('should create list component with template children', () => {
      const template = templateChildren('/items', 'item-tmpl');
      const comp = list('list-1', template);
      expect(comp.type).toBe('List');
      expect(comp.children).toEqual(template);
    });
  });

  describe('buildSurface Convenience Function', () => {
    it('should build surface from component array', () => {
      const result = buildSurface('quick-surface', [
        { id: 'root', type: 'Column' },
        { id: 'text', type: 'Text', text: literal('Hello'), parentId: 'root' },
      ]);

      expect(result.surfaceId).toBe('quick-surface');
      expect(result.components).toHaveLength(2);

      const root = result.components.find((c) => c.id === 'root');
      expect(root?.children).toContain('text');
    });
  });
});

// ============================================================================
// Surface Generator Tests
// ============================================================================

describe('SurfaceGenerator', () => {
  let generator: SurfaceGenerator;

  beforeEach(() => {
    generator = createSurfaceGenerator({
      idGenerator: () => 'generated-id',
      timestampGenerator: () => '2026-01-30T12:00:00Z',
    });
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

// ============================================================================
// Template Tests
// ============================================================================

describe('QE Surface Templates', () => {
  describe('Coverage Surface Template', () => {
    const mockCoverageData: CoverageData = {
      total: 85.5,
      target: 80,
      lineCoverage: 88.0,
      branchCoverage: 75.0,
      functionCoverage: 92.0,
      modules: [
        { name: 'src/core', percentage: 90, fileCount: 10 },
        { name: 'src/utils', percentage: 78, fileCount: 5 },
      ],
      files: [
        {
          path: 'src/index.ts',
          lineCoverage: 95,
          branchCoverage: 80,
          functionCoverage: 100,
          coveredLines: 95,
          totalLines: 100,
        },
      ],
      gaps: [
        {
          id: 'gap-1',
          file: 'src/utils.ts',
          startLine: 10,
          endLine: 15,
          type: 'uncovered',
          description: 'Error handling not covered',
          suggestion: 'Add test for error case',
        },
      ],
      timestamp: '2026-01-30T12:00:00Z',
      summary: '85.5% coverage - meets target',
    };

    it('should create coverage surface', () => {
      const surface = createCoverageSurface(mockCoverageData);

      expect(surface.type).toBe('surfaceUpdate');
      expect(surface.surfaceId).toBe('coverage-dashboard');
      expect(surface.components.length).toBeGreaterThan(0);
    });

    it('should create coverage surface with custom ID', () => {
      const surface = createCoverageSurface(mockCoverageData, 'custom-coverage');
      expect(surface.surfaceId).toBe('custom-coverage');
    });

    it('should create coverage data update', () => {
      const update = createCoverageDataUpdate(mockCoverageData);

      expect(update.type).toBe('dataModelUpdate');
      expect(update.data.metrics).toBeDefined();
      expect((update.data.metrics as Record<string, unknown>).total).toBe(85.5);
      expect((update.data.metrics as Record<string, unknown>).status).toBe('passed');
    });

    it('should set status to failed when below target', () => {
      const lowCoverage: CoverageData = { ...mockCoverageData, total: 75 };
      const update = createCoverageDataUpdate(lowCoverage);

      expect((update.data.metrics as Record<string, unknown>).status).toBe('failed');
    });

    it('should create coverage summary surface', () => {
      const surface = createCoverageSummarySurface({
        total: 85.5,
        target: 80,
        summary: 'Good coverage',
        timestamp: '2026-01-30T12:00:00Z',
      });

      expect(surface.surfaceId).toBe('coverage-summary');
      expect(surface.components.length).toBeGreaterThan(0);
    });

    it('should include QE-specific components', () => {
      const surface = createCoverageSurface(mockCoverageData);
      const types = surface.components.map((c) => c.type);

      expect(types).toContain('qe:coverageGauge');
      expect(types).toContain('qe:qualityGateIndicator');
    });
  });

  describe('Test Results Surface Template', () => {
    const mockTestResults: TestResults = {
      total: 100,
      passed: 95,
      failed: 3,
      skipped: 2,
      duration: 45000,
      passDuration: 40000,
      failDuration: 5000,
      startTime: '2026-01-30T12:00:00Z',
      endTime: '2026-01-30T12:00:45Z',
      suites: [
        {
          name: 'Unit Tests',
          file: 'tests/unit.test.ts',
          total: 50,
          passed: 48,
          failed: 2,
          skipped: 0,
          duration: 20000,
        },
      ],
      tests: [
        {
          id: 'test-1',
          name: 'should work correctly',
          suite: 'Unit Tests',
          status: 'passed',
          duration: 100,
          startTime: '2026-01-30T12:00:00Z',
          endTime: '2026-01-30T12:00:00.1Z',
        },
        {
          id: 'test-2',
          name: 'should fail on error',
          suite: 'Unit Tests',
          status: 'failed',
          duration: 500,
          error: 'Expected true but got false',
          startTime: '2026-01-30T12:00:01Z',
        },
      ],
      summary: '95 of 100 tests passed',
      passRate: 95,
    };

    it('should create test results surface', () => {
      const surface = createTestResultsSurface(mockTestResults);

      expect(surface.type).toBe('surfaceUpdate');
      expect(surface.surfaceId).toBe('test-results');
      expect(surface.components.length).toBeGreaterThan(0);
    });

    it('should create test results data update', () => {
      const update = createTestResultsDataUpdate(mockTestResults);

      expect(update.type).toBe('dataModelUpdate');
      const results = update.data.results as Record<string, unknown>;
      expect(results.total).toBe(100);
      expect(results.passed).toBe(95);
      expect(results.passRateFormatted).toBe('95.0%');
    });

    it('should format duration correctly', () => {
      const update = createTestResultsDataUpdate(mockTestResults);
      const results = update.data.results as Record<string, unknown>;
      expect(results.durationFormatted).toBe('45.0s');
    });

    it('should compute pass rate color', () => {
      const update = createTestResultsDataUpdate(mockTestResults);
      const results = update.data.results as Record<string, unknown>;
      expect(results.passRateColor).toBe('#4CAF50'); // Green for 95%
    });

    it('should include QE-specific components', () => {
      const surface = createTestResultsSurface(mockTestResults);
      const types = surface.components.map((c) => c.type);

      expect(types).toContain('qe:testStatusBadge');
      expect(types).toContain('qe:testTimeline');
    });
  });

  describe('Security Surface Template', () => {
    const mockSecurityFindings: SecurityFindings = {
      total: 15,
      bySeverity: [
        { severity: 'critical', count: 2, color: '#9C27B0' },
        { severity: 'high', count: 5, color: '#F44336' },
        { severity: 'medium', count: 6, color: '#FF9800' },
        { severity: 'low', count: 2, color: '#FFC107' },
      ],
      findings: [
        {
          id: 'vuln-1',
          title: 'SQL Injection',
          severity: 'critical',
          cve: 'CVE-2026-1234',
          cwe: 'CWE-89',
          owasp: 'A03:2021-Injection',
          description: 'SQL injection vulnerability in login form',
          remediation: 'Use parameterized queries',
          file: 'src/auth.ts',
          line: 42,
          cvssScore: 9.8,
          confidence: 'high',
          detectedAt: '2026-01-30T12:00:00Z',
          status: 'open',
        },
      ],
      dependencies: [
        {
          package: 'lodash',
          currentVersion: '4.17.20',
          fixedVersion: '4.17.21',
          cve: 'CVE-2021-23337',
          severity: 'high',
          description: 'Prototype pollution',
        },
      ],
      timestamp: '2026-01-30T12:00:00Z',
      duration: 30000,
      scannerVersion: '2.5.0',
      summary: '15 vulnerabilities found',
      riskScore: 75,
      riskLevel: 'high',
    };

    it('should create security surface', () => {
      const surface = createSecuritySurface(mockSecurityFindings);

      expect(surface.type).toBe('surfaceUpdate');
      expect(surface.surfaceId).toBe('security-report');
      expect(surface.components.length).toBeGreaterThan(0);
    });

    it('should create security data update', () => {
      const update = createSecurityDataUpdate(mockSecurityFindings);

      expect(update.type).toBe('dataModelUpdate');
      const security = update.data.security as Record<string, unknown>;
      expect(security.total).toBe(15);
      expect(security.riskScore).toBe(75);
    });

    it('should compute severity counts', () => {
      const update = createSecurityDataUpdate(mockSecurityFindings);
      const counts = (update.data.security as Record<string, unknown>).counts as Record<string, number>;

      expect(counts.critical).toBe(1);
      expect(counts.high).toBe(0);
    });

    it('should set alert for critical findings', () => {
      const update = createSecurityDataUpdate(mockSecurityFindings);
      const security = update.data.security as Record<string, unknown>;

      expect(security.hasCritical).toBe(true);
      expect(security.alertVariant).toBe('error');
    });

    it('should include QE-specific components', () => {
      const surface = createSecuritySurface(mockSecurityFindings);
      const types = surface.components.map((c) => c.type);

      expect(types).toContain('qe:vulnerabilityCard');
      expect(types).toContain('qe:severityBadge');
      expect(types).toContain('qe:riskGauge');
    });
  });

  describe('Accessibility Surface Template', () => {
    const mockA11yAudit: A11yAudit = {
      total: 25,
      passed: 175,
      score: 87,
      targetLevel: 'AA',
      isCompliant: false,
      byImpact: [
        { impact: 'critical', count: 3, color: '#9C27B0' },
        { impact: 'serious', count: 8, color: '#F44336' },
        { impact: 'moderate', count: 10, color: '#FF9800' },
        { impact: 'minor', count: 4, color: '#FFC107' },
      ],
      byLevel: [
        { level: 'A', count: 10 },
        { level: 'AA', count: 15 },
        { level: 'AAA', count: 0 },
      ],
      byPrinciple: [
        { principle: 'perceivable', name: 'Perceivable', count: 12, color: '#2196F3' },
        { principle: 'operable', name: 'Operable', count: 8, color: '#4CAF50' },
        { principle: 'understandable', name: 'Understandable', count: 3, color: '#FF9800' },
        { principle: 'robust', name: 'Robust', count: 2, color: '#9C27B0' },
      ],
      findings: [
        {
          id: 'a11y-1',
          ruleId: 'image-alt',
          rule: 'Images must have alternate text',
          criterion: '1.1.1',
          wcagLevel: 'A',
          principle: 'perceivable',
          impact: 'critical',
          element: 'img.hero-image',
          html: '<img src="hero.jpg">',
          description: 'Image missing alt text',
          suggestion: 'Add alt attribute describing the image',
          helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content',
          pageUrl: 'https://example.com/',
          instanceCount: 3,
        },
      ],
      pages: [
        {
          url: 'https://example.com/',
          title: 'Home',
          findingsCount: 15,
          passedCount: 85,
          score: 85,
        },
      ],
      timestamp: '2026-01-30T12:00:00Z',
      duration: 60000,
      toolVersion: '4.8.0',
      summary: '25 accessibility issues found',
    };

    it('should create accessibility surface', () => {
      const surface = createAccessibilitySurface(mockA11yAudit);

      expect(surface.type).toBe('surfaceUpdate');
      expect(surface.surfaceId).toBe('a11y-report');
      expect(surface.components.length).toBeGreaterThan(0);
    });

    it('should create accessibility data update', () => {
      const update = createAccessibilityDataUpdate(mockA11yAudit);

      expect(update.type).toBe('dataModelUpdate');
      const a11y = update.data.a11y as Record<string, unknown>;
      expect(a11y.total).toBe(25);
      expect(a11y.score).toBe(87);
      expect(a11y.isCompliant).toBe(false);
    });

    it('should compute impact counts', () => {
      const update = createAccessibilityDataUpdate(mockA11yAudit);
      const impacts = (update.data.a11y as Record<string, unknown>).impacts as Record<string, number>;

      expect(impacts.critical).toBe(1);
      expect(impacts.serious).toBe(0);
    });

    it('should compute level counts', () => {
      const update = createAccessibilityDataUpdate(mockA11yAudit);
      const levels = (update.data.a11y as Record<string, unknown>).levels as Record<string, number>;

      expect(levels.A).toBe(1);
      expect(levels.AA).toBe(0);
    });

    it('should generate compliance text', () => {
      const update = createAccessibilityDataUpdate(mockA11yAudit);
      const a11y = update.data.a11y as Record<string, unknown>;

      expect(a11y.complianceText).toContain('does not meet WCAG AA');
    });

    it('should include QE-specific components', () => {
      const surface = createAccessibilitySurface(mockA11yAudit);
      const types = surface.components.map((c) => c.type);

      expect(types).toContain('qe:a11yScoreGauge');
      expect(types).toContain('qe:complianceBadge');
      expect(types).toContain('qe:a11yFindingCard');
      expect(types).toContain('qe:a11yImpactBadge');
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('A2UI Renderer Integration', () => {
  it('should create complete surface workflow', () => {
    const generator = createSurfaceGenerator();

    // Create surface with builder
    const builder = createComponentBuilder();
    builder
      .beginSurface('dashboard')
      .setTitle('QE Dashboard')
      .addComponent('root', { type: 'Column' })
      .addChild('root', 'coverage', { type: 'qe:coverageGauge', value: path('/coverage') })
      .addChild('root', 'tests', { type: 'qe:testStatusBadge', count: path('/tests/passed') });

    // Apply to generator
    generator.applyBuilder(builder);

    // Set data
    generator.setData('dashboard', {
      coverage: 85.5,
      tests: { passed: 100, failed: 5 },
    });

    // Generate all messages
    const messages = generator.getAllMessages('dashboard');

    expect(messages).not.toBeNull();
    expect(messages?.beginRendering.title).toBe('QE Dashboard');
    expect(messages?.surfaceUpdate.components).toHaveLength(3);
    expect(messages?.dataModelUpdate.data.coverage).toBe(85.5);
  });

  it('should handle incremental updates', () => {
    const generator = createSurfaceGenerator();
    generator.createSurface('test');

    // Initial components
    generator.addComponents('test', [
      { id: 'gauge', type: 'qe:coverageGauge', properties: { value: 80 } },
      { id: 'badge', type: 'qe:testStatusBadge', properties: { count: 50 } },
    ]);

    // Update single component
    generator.updateComponent('test', 'gauge', { properties: { value: 85 } });

    // Get incremental update
    const update = generator.generateIncrementalUpdate('test', ['gauge']);

    expect(update?.components).toHaveLength(1);
    expect(update?.components[0].properties.value).toBe(85);
  });

  it('should emit proper version tracking', () => {
    const generator = createSurfaceGenerator();
    generator.createSurface('test');

    const v1 = generator.generateSurfaceUpdate('test')?.version;
    generator.addComponent('test', { id: 'a', type: 'Text', properties: {} });

    const v2 = generator.generateSurfaceUpdate('test')?.version;
    expect(v2).toBeGreaterThan(v1!);
  });

  it('should work with QE templates end-to-end', () => {
    const generator = createSurfaceGenerator();

    // Create coverage surface
    const coverageSurface = createCoverageSurface({
      total: 85,
      target: 80,
      lineCoverage: 88,
      branchCoverage: 75,
      functionCoverage: 92,
      modules: [],
      files: [],
      gaps: [],
      timestamp: '2026-01-30T12:00:00Z',
      summary: 'Coverage is good',
    });

    // Register surface
    generator.createSurface(coverageSurface.surfaceId);
    generator.addComponents(coverageSurface.surfaceId, coverageSurface.components);

    // Verify surface exists with components
    const components = generator.getComponents(coverageSurface.surfaceId);
    expect(components.length).toBeGreaterThan(0);

    // Verify can generate messages
    const beginMsg = generator.generateBeginRendering(coverageSurface.surfaceId);
    expect(beginMsg).not.toBeNull();
  });
});
