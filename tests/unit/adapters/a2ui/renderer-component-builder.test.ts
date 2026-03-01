/**
 * A2UI Component Builder Unit Tests
 * Split from renderer.test.ts
 *
 * Tests for the ComponentBuilder fluent API and helper functions.
 *
 * @module tests/unit/adapters/a2ui/renderer-component-builder
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  literal,
  templateChildren,
} from '../../../../src/adapters/a2ui/renderer/message-types.js';

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
