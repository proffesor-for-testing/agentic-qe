/**
 * DIContainer Unit Tests
 *
 * Tests for the Dependency Injection container including:
 * - Singleton lifecycle management
 * - Transient lifecycle management
 * - Scoped lifecycle management
 * - Dependency resolution
 * - Hierarchical containers
 * - Error handling
 */

import {
  DIContainer,
  DependencyConfig,
  getGlobalContainer,
  resetGlobalContainer
} from '../../../src/core/di';

describe('DIContainer', () => {
  let container: DIContainer;

  beforeEach(async () => {
    await resetGlobalContainer();
    container = new DIContainer();
  });

  afterEach(async () => {
    await container.dispose();
  });

  describe('registration', () => {
    it('should register a dependency', () => {
      container.register('testDep', {
        factory: () => ({ value: 42 }),
        lifecycle: 'singleton'
      });

      expect(container.has('testDep')).toBe(true);
    });

    it('should register a singleton instance directly', () => {
      const instance = { value: 'direct' };
      container.registerInstance('directDep', instance);

      expect(container.has('directDep')).toBe(true);
    });

    it('should register a factory function', () => {
      container.registerFactory('factoryDep', () => ({ id: Math.random() }));

      expect(container.has('factoryDep')).toBe(true);
    });

    it('should warn when overwriting existing dependency', () => {
      container.register('dup', { factory: () => 1, lifecycle: 'singleton' });
      container.register('dup', { factory: () => 2, lifecycle: 'singleton' });

      expect(container.has('dup')).toBe(true);
    });

    it('should throw when registering to disposed container', async () => {
      await container.dispose();

      expect(() => {
        container.register('test', { factory: () => 1, lifecycle: 'singleton' });
      }).toThrow('Container has been disposed');
    });
  });

  describe('singleton lifecycle', () => {
    it('should return same instance for singleton', async () => {
      let callCount = 0;
      container.register('singleton', {
        factory: () => {
          callCount++;
          return { id: callCount };
        },
        lifecycle: 'singleton'
      });

      const instance1 = await container.resolve('singleton');
      const instance2 = await container.resolve('singleton');

      expect(instance1).toBe(instance2);
      expect(callCount).toBe(1);
    });

    it('should handle async factory for singleton', async () => {
      container.register('asyncSingleton', {
        factory: async () => {
          await new Promise(r => setTimeout(r, 10));
          return { async: true };
        },
        lifecycle: 'singleton'
      });

      const instance = await container.resolve('asyncSingleton');
      expect(instance).toEqual({ async: true });
    });

    it('should handle concurrent resolution of singleton', async () => {
      let callCount = 0;
      container.register('concurrentSingleton', {
        factory: async () => {
          callCount++;
          await new Promise(r => setTimeout(r, 50));
          return { id: callCount };
        },
        lifecycle: 'singleton'
      });

      // Start multiple concurrent resolutions
      const [r1, r2, r3] = await Promise.all([
        container.resolve('concurrentSingleton'),
        container.resolve('concurrentSingleton'),
        container.resolve('concurrentSingleton')
      ]);

      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
      expect(callCount).toBe(1);
    });
  });

  describe('transient lifecycle', () => {
    it('should return new instance for each resolution', async () => {
      let callCount = 0;
      container.register('transient', {
        factory: () => {
          callCount++;
          return { id: callCount };
        },
        lifecycle: 'transient'
      });

      const instance1 = await container.resolve('transient');
      const instance2 = await container.resolve('transient');

      expect(instance1).not.toBe(instance2);
      expect(instance1.id).toBe(1);
      expect(instance2.id).toBe(2);
      expect(callCount).toBe(2);
    });
  });

  describe('scoped lifecycle', () => {
    it('should return same instance within scope', async () => {
      let callCount = 0;
      container.register('scoped', {
        factory: () => {
          callCount++;
          return { id: callCount };
        },
        lifecycle: 'scoped'
      });

      container.createScope('scope1');

      const instance1 = await container.resolve('scoped', 'scope1');
      const instance2 = await container.resolve('scoped', 'scope1');

      expect(instance1).toBe(instance2);
      expect(callCount).toBe(1);
    });

    it('should return different instances in different scopes', async () => {
      let callCount = 0;
      container.register('scoped', {
        factory: () => {
          callCount++;
          return { id: callCount };
        },
        lifecycle: 'scoped'
      });

      container.createScope('scopeA');
      container.createScope('scopeB');

      const instanceA = await container.resolve('scoped', 'scopeA');
      const instanceB = await container.resolve('scoped', 'scopeB');

      expect(instanceA).not.toBe(instanceB);
      expect(instanceA.id).toBe(1);
      expect(instanceB.id).toBe(2);
    });

    it('should throw when resolving scoped without scope', async () => {
      container.register('scoped', {
        factory: () => ({ value: 1 }),
        lifecycle: 'scoped'
      });

      await expect(container.resolve('scoped')).rejects.toThrow('requires a scope');
    });

    it('should dispose scoped instances', async () => {
      let disposed = false;
      container.register('scopedDisposable', {
        factory: () => ({ value: 1 }),
        lifecycle: 'scoped',
        dispose: async () => {
          disposed = true;
        }
      });

      container.createScope('testScope');
      await container.resolve('scopedDisposable', 'testScope');
      await container.disposeScope('testScope');

      expect(disposed).toBe(true);
    });
  });

  describe('dependency resolution', () => {
    it('should resolve dependency with dependencies', async () => {
      container.register('depA', {
        factory: () => ({ name: 'A' }),
        lifecycle: 'singleton'
      });

      container.register('depB', {
        factory: async (c) => {
          const a = await c.resolve('depA');
          return { name: 'B', dependency: a };
        },
        lifecycle: 'singleton',
        dependencies: ['depA']
      });

      const b = await container.resolve<{ name: string; dependency: { name: string } }>('depB');
      expect(b.name).toBe('B');
      expect(b.dependency.name).toBe('A');
    });

    it('should throw for unregistered dependency', async () => {
      await expect(container.resolve('nonexistent')).rejects.toThrow('Dependency not found');
    });

    it('should return undefined for tryResolve of missing dependency', async () => {
      const result = await container.tryResolve('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should throw when resolving from disposed container', async () => {
      container.register('test', { factory: () => 1, lifecycle: 'singleton' });
      await container.dispose();

      await expect(container.resolve('test')).rejects.toThrow('Container has been disposed');
    });
  });

  describe('hierarchical containers', () => {
    it('should resolve from parent container', async () => {
      container.register('parentDep', {
        factory: () => ({ from: 'parent' }),
        lifecycle: 'singleton'
      });

      const child = new DIContainer(container);
      const resolved = await child.resolve<{ from: string }>('parentDep');

      expect(resolved.from).toBe('parent');
      await child.dispose();
    });

    it('should override parent registration in child', async () => {
      container.register('override', {
        factory: () => ({ from: 'parent' }),
        lifecycle: 'singleton'
      });

      const child = new DIContainer(container);
      child.register('override', {
        factory: () => ({ from: 'child' }),
        lifecycle: 'singleton'
      });

      const resolved = await child.resolve<{ from: string }>('override');
      expect(resolved.from).toBe('child');
      await child.dispose();
    });

    it('should check parent for has()', () => {
      container.register('parentOnly', {
        factory: () => ({}),
        lifecycle: 'singleton'
      });

      const child = new DIContainer(container);
      expect(child.has('parentOnly')).toBe(true);
      child.dispose();
    });
  });

  describe('initialization and disposal', () => {
    it('should call initialize function', async () => {
      let initialized = false;
      container.register('initDep', {
        factory: () => ({ value: 1 }),
        lifecycle: 'singleton',
        initialize: async () => {
          initialized = true;
        }
      });

      await container.resolve('initDep');
      expect(initialized).toBe(true);
    });

    it('should call dispose function', async () => {
      let disposed = false;
      container.register('disposeDep', {
        factory: () => ({ value: 1 }),
        lifecycle: 'singleton',
        dispose: async () => {
          disposed = true;
        }
      });

      await container.resolve('disposeDep');
      await container.dispose();

      expect(disposed).toBe(true);
    });

    it('should dispose in reverse registration order', async () => {
      const disposeOrder: string[] = [];

      container.register('first', {
        factory: () => ({ name: 'first' }),
        lifecycle: 'singleton',
        dispose: async () => {
          disposeOrder.push('first');
        }
      });

      container.register('second', {
        factory: () => ({ name: 'second' }),
        lifecycle: 'singleton',
        dispose: async () => {
          disposeOrder.push('second');
        }
      });

      await container.resolve('first');
      await container.resolve('second');
      await container.dispose();

      expect(disposeOrder).toEqual(['second', 'first']);
    });
  });

  describe('getRegisteredNames', () => {
    it('should return all registered names', () => {
      container.register('dep1', { factory: () => 1, lifecycle: 'singleton' });
      container.register('dep2', { factory: () => 2, lifecycle: 'singleton' });

      const names = container.getRegisteredNames();
      expect(names).toContain('dep1');
      expect(names).toContain('dep2');
    });

    it('should include parent names', () => {
      container.register('parentDep', { factory: () => 1, lifecycle: 'singleton' });

      const child = new DIContainer(container);
      child.register('childDep', { factory: () => 2, lifecycle: 'singleton' });

      const names = child.getRegisteredNames();
      expect(names).toContain('parentDep');
      expect(names).toContain('childDep');
      child.dispose();
    });
  });

  describe('global container', () => {
    it('should return same global container instance', () => {
      const global1 = getGlobalContainer();
      const global2 = getGlobalContainer();

      expect(global1).toBe(global2);
    });

    it('should reset global container', async () => {
      const global1 = getGlobalContainer();
      global1.register('test', { factory: () => 1, lifecycle: 'singleton' });

      await resetGlobalContainer();

      const global2 = getGlobalContainer();
      expect(global2).not.toBe(global1);
      expect(global2.has('test')).toBe(false);
    });
  });
});
