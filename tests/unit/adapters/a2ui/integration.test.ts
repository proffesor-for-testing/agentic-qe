/**
 * A2UI AG-UI Integration Tests
 *
 * Tests for AG-UI state synchronization with A2UI surfaces.
 *
 * @module tests/unit/adapters/a2ui/integration
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AGUISyncService,
  createAGUISyncService,
  SurfaceStateBridge,
  createSurfaceStateBridge,
  boundSurface,
  binding,
  type ComponentBinding,
  type PathMapping,
  type BoundSurfaceConfig,
} from '../../../../src/adapters/a2ui/integration/index.js';
import {
  createStateManager,
  createEventAdapter,
  type StateManager,
  type EventAdapter,
  type JsonPatchOperation,
} from '../../../../src/adapters/ag-ui/index.js';
import {
  createSurfaceGenerator,
  createComponentBuilder,
  type SurfaceGenerator,
  type ComponentBuilder,
} from '../../../../src/adapters/a2ui/renderer/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestStateManager(initialState: Record<string, unknown> = {}): StateManager {
  return createStateManager({ initialState, emitEvents: true });
}

function createTestEventAdapter(): EventAdapter {
  return createEventAdapter({ emitRawForUnknown: false, enableBatching: false });
}

function createTestSurfaceGenerator(): SurfaceGenerator {
  return createSurfaceGenerator({ emitEvents: true });
}

function createSimpleSurface(generator: SurfaceGenerator, surfaceId: string): void {
  const builder = createComponentBuilder();
  builder
    .beginSurface(surfaceId)
    .setTitle('Test Surface')
    .addComponent('root', { type: 'Column' })
    .addComponent('coverage-gauge', { type: 'CoverageGauge', value: 0 })
    .addComponent('tests-passed', { type: 'Text', text: '0' })
    .addComponent('tests-failed', { type: 'Text', text: '0' })
    .setChildren('root', ['coverage-gauge', 'tests-passed', 'tests-failed'])
    .setRoot('root');
  generator.applyBuilder(builder);
}

// ============================================================================
// AGUISyncService Tests
// ============================================================================

describe('AGUISyncService', () => {
  let stateManager: StateManager;
  let eventAdapter: EventAdapter;
  let surfaceGenerator: SurfaceGenerator;
  let syncService: AGUISyncService;

  beforeEach(() => {
    stateManager = createTestStateManager({
      qe: {
        coverage: { line: 85, branch: 72 },
        tests: { passed: 120, failed: 5, skipped: 3 },
      },
    });
    eventAdapter = createTestEventAdapter();
    surfaceGenerator = createTestSurfaceGenerator();
    createSimpleSurface(surfaceGenerator, 'test-surface');

    syncService = createAGUISyncService({
      stateManager,
      eventAdapter,
      emitSurfaceEvents: true,
      handleUserActions: true,
    });
  });

  afterEach(() => {
    syncService.disconnect();
  });

  describe('Connection Management', () => {
    it('should connect to state manager on creation', () => {
      expect(syncService.getIsConnected()).toBe(true);
    });

    it('should disconnect from state manager', () => {
      syncService.disconnect();
      expect(syncService.getIsConnected()).toBe(false);
    });

    it('should reconnect after disconnect', () => {
      syncService.disconnect();
      syncService.connect();
      expect(syncService.getIsConnected()).toBe(true);
    });

    it('should connect surface generator', () => {
      syncService.connectSurface('test-surface', surfaceGenerator);
      expect(syncService.getSurfaces().has('test-surface')).toBe(true);
    });

    it('should disconnect surface generator', () => {
      syncService.connectSurface('test-surface', surfaceGenerator);
      syncService.disconnectSurface('test-surface');
      expect(syncService.getSurfaces().has('test-surface')).toBe(false);
    });

    it('should emit connected event', () => {
      const newService = new AGUISyncService({
        stateManager: createTestStateManager(),
      });
      const connectedSpy = vi.fn();
      // Spy before connect is called in constructor, so we need fresh instance
      newService.disconnect();
      newService.on('connected', connectedSpy);
      newService.connect();
      expect(connectedSpy).toHaveBeenCalled();
    });

    it('should emit surfaceConnected event', () => {
      const connectedSpy = vi.fn();
      syncService.on('surfaceConnected', connectedSpy);
      syncService.connectSurface('test-surface', surfaceGenerator);
      expect(connectedSpy).toHaveBeenCalledWith({ surfaceId: 'test-surface' });
    });

    it('should emit surfaceDisconnected event', () => {
      syncService.connectSurface('test-surface', surfaceGenerator);
      const disconnectedSpy = vi.fn();
      syncService.on('surfaceDisconnected', disconnectedSpy);
      syncService.disconnectSurface('test-surface');
      expect(disconnectedSpy).toHaveBeenCalledWith({ surfaceId: 'test-surface' });
    });
  });

  describe('Path Mapping', () => {
    it('should map AG-UI state path to A2UI path', () => {
      syncService.mapStatePath('/qe/coverage/line', '/data/coverage');
      const mappings = syncService.getPathMappings();
      expect(mappings).toHaveLength(1);
      expect(mappings[0].aguiPath).toBe('/qe/coverage/line');
      expect(mappings[0].a2uiPath).toBe('/data/coverage');
    });

    it('should map with transform function', () => {
      const transform = (value: unknown) => (value as number) / 100;
      syncService.mapStatePath('/qe/coverage/line', '/data/coverage', { transform });
      const mappings = syncService.getPathMappings();
      expect(mappings[0].transform).toBe(transform);
    });

    it('should map for specific surface', () => {
      syncService.mapStatePath('/qe/coverage/line', '/data/coverage', {
        surfaceId: 'test-surface',
      });
      const mappings = syncService.getPathMappings();
      expect(mappings[0].surfaceId).toBe('test-surface');
    });

    it('should unmap state path', () => {
      syncService.mapStatePath('/qe/coverage/line', '/data/coverage');
      syncService.unmapStatePath('/qe/coverage/line');
      expect(syncService.getPathMappings()).toHaveLength(0);
    });

    it('should get mappings for a path', () => {
      syncService.mapStatePath('/qe/coverage/line', '/data/coverage/line');
      syncService.mapStatePath('/qe/coverage/branch', '/data/coverage/branch');
      syncService.mapStatePath('/qe/tests/passed', '/data/tests/passed');

      const coverageMappings = syncService.getMappingsForPath('/qe/coverage/line');
      expect(coverageMappings).toHaveLength(1);
      expect(coverageMappings[0].a2uiPath).toBe('/data/coverage/line');
    });

    it('should emit pathMapped event', () => {
      const mappedSpy = vi.fn();
      syncService.on('pathMapped', mappedSpy);
      syncService.mapStatePath('/qe/coverage/line', '/data/coverage');
      expect(mappedSpy).toHaveBeenCalled();
    });
  });

  describe('Action Mapping', () => {
    it('should map action to state update', () => {
      syncService.mapAction('refresh-coverage', '/qe/refreshRequested', 'value');
      const mappings = syncService.getActionMappings();
      expect(mappings).toHaveLength(1);
      expect(mappings[0].actionPattern).toBe('refresh-coverage');
    });

    it('should map action with function extractor', () => {
      const extractor = (payload: Record<string, unknown>) => payload.newValue;
      syncService.mapAction('set-threshold', '/qe/threshold', extractor);
      const mappings = syncService.getActionMappings();
      expect(mappings[0].valueExtractor).toBe(extractor);
    });

    it('should unmap action', () => {
      syncService.mapAction('refresh-coverage', '/qe/refreshRequested', 'value');
      syncService.unmapAction('refresh-coverage');
      expect(syncService.getActionMappings()).toHaveLength(0);
    });

    it('should emit actionMapped event', () => {
      const mappedSpy = vi.fn();
      syncService.on('actionMapped', mappedSpy);
      syncService.mapAction('refresh', '/qe/refresh', 'value');
      expect(mappedSpy).toHaveBeenCalled();
    });
  });

  describe('State Snapshot Handling', () => {
    it('should handle state snapshot', () => {
      const snapshotSpy = vi.fn();
      syncService.on('stateSnapshot', snapshotSpy);

      syncService.onStateSnapshot({
        qe: { coverage: { line: 90 } },
      });

      expect(snapshotSpy).toHaveBeenCalledWith({
        state: { qe: { coverage: { line: 90 } } },
      });
    });

    it('should update surfaces from state snapshot', () => {
      syncService.connectSurface('test-surface', surfaceGenerator);
      syncService.mapStatePath('/qe/coverage/line', '/coverage');

      syncService.onStateSnapshot({
        qe: { coverage: { line: 95 } },
      });

      // Verify surface data was updated
      const surface = surfaceGenerator.getSurface('test-surface');
      expect(surface?.data).toHaveProperty('coverage');
    });
  });

  describe('State Delta Handling', () => {
    it('should handle state delta', () => {
      const deltaSpy = vi.fn();
      syncService.on('stateDelta', deltaSpy);

      const delta: JsonPatchOperation[] = [
        { op: 'replace', path: '/qe/coverage/line', value: 90 },
      ];

      syncService.onStateDelta(delta);

      expect(deltaSpy).toHaveBeenCalledWith({ delta });
    });

    it('should apply delta to affected surfaces', () => {
      syncService.connectSurface('test-surface', surfaceGenerator);
      syncService.mapStatePath('/qe/coverage/line', '/coverage');

      // First set initial state
      syncService.onStateSnapshot({ qe: { coverage: { line: 85 } } });

      // Then apply delta
      syncService.onStateDelta([
        { op: 'replace', path: '/qe/coverage/line', value: 92 },
      ]);

      const surface = surfaceGenerator.getSurface('test-surface');
      expect(surface?.data.coverage).toBe(92);
    });

    it('should emit sync event on delta', () => {
      syncService.connectSurface('test-surface', surfaceGenerator);
      syncService.mapStatePath('/qe/coverage/line', '/coverage');

      const syncSpy = vi.fn();
      syncService.on('sync', syncSpy);

      syncService.onStateDelta([
        { op: 'replace', path: '/qe/coverage/line', value: 88 },
      ]);

      expect(syncSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'stateToSurface',
          path: '/coverage',
        })
      );
    });
  });

  describe('Surface Update Emission', () => {
    it('should emit surface update as custom event', () => {
      const customSpy = vi.fn();
      eventAdapter.on('CUSTOM', customSpy);

      syncService.emitSurfaceUpdate({
        type: 'surfaceUpdate',
        surfaceId: 'test-surface',
        version: 1,
        components: [],
      });

      expect(customSpy).toHaveBeenCalled();
    });

    it('should emit surface delete as custom event', () => {
      const customSpy = vi.fn();
      eventAdapter.on('CUSTOM', customSpy);

      syncService.emitSurfaceDelete({
        type: 'deleteSurface',
        surfaceId: 'test-surface',
      });

      expect(customSpy).toHaveBeenCalled();
    });

    it('should emit data update as custom event', () => {
      const customSpy = vi.fn();
      eventAdapter.on('CUSTOM', customSpy);

      syncService.emitDataUpdate({
        type: 'dataModelUpdate',
        surfaceId: 'test-surface',
        data: { coverage: 90 },
      });

      expect(customSpy).toHaveBeenCalled();
    });

    it('should emit user action as custom event', () => {
      const customSpy = vi.fn();
      eventAdapter.on('CUSTOM', customSpy);

      syncService.emitUserAction({
        type: 'userAction',
        surfaceId: 'test-surface',
        componentId: 'btn-refresh',
        actionId: 'refresh',
        timestamp: new Date().toISOString(),
      });

      expect(customSpy).toHaveBeenCalled();
    });
  });

  describe('User Action Handling', () => {
    it('should handle user action and update state', () => {
      syncService.mapAction('set-value', '/qe/value', 'newValue');

      syncService.handleUserAction({
        type: 'userAction',
        surfaceId: 'test-surface',
        componentId: 'slider',
        actionId: 'set-value',
        payload: { newValue: 80 },
        timestamp: new Date().toISOString(),
      });

      expect(stateManager.getValue('/qe/value')).toBe(80);
    });

    it('should match wildcard action patterns', () => {
      syncService.mapAction('slider-*', '/qe/sliderValue', 'value');

      syncService.handleUserAction({
        type: 'userAction',
        surfaceId: 'test-surface',
        componentId: 'coverage-slider',
        actionId: 'slider-change',
        payload: { value: 75 },
        timestamp: new Date().toISOString(),
      });

      expect(stateManager.getValue('/qe/sliderValue')).toBe(75);
    });

    it('should emit sync event for user action', () => {
      syncService.mapAction('update', '/qe/updated', 'flag');

      const syncSpy = vi.fn();
      syncService.on('sync', syncSpy);

      syncService.handleUserAction({
        type: 'userAction',
        surfaceId: 'test-surface',
        componentId: 'btn',
        actionId: 'update',
        payload: { flag: true },
        timestamp: new Date().toISOString(),
      });

      expect(syncSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'userAction',
          sourceId: 'update',
        })
      );
    });

    it('should use function value extractor', () => {
      syncService.mapAction('complex', '/qe/complex', (payload) => ({
        a: (payload as { a: number }).a * 2,
      }));

      syncService.handleUserAction({
        type: 'userAction',
        surfaceId: 'test-surface',
        componentId: 'btn',
        actionId: 'complex',
        payload: { a: 5 },
        timestamp: new Date().toISOString(),
      });

      expect(stateManager.getValue('/qe/complex')).toEqual({ a: 10 });
    });
  });

  describe('Service State', () => {
    it('should return service state', () => {
      syncService.connectSurface('test-surface', surfaceGenerator);
      syncService.mapStatePath('/a', '/b');

      const state = syncService.getState();

      expect(state.stateManager).toBe(stateManager);
      expect(state.eventAdapter).toBe(eventAdapter);
      expect(state.surfaces.has('test-surface')).toBe(true);
      expect(state.pathMappings).toHaveLength(1);
      expect(state.isConnected).toBe(true);
    });

    it('should get surface by ID', () => {
      syncService.connectSurface('test-surface', surfaceGenerator);
      expect(syncService.getSurface('test-surface')).toBe(surfaceGenerator);
    });
  });
});

// ============================================================================
// SurfaceStateBridge Tests
// ============================================================================

describe('SurfaceStateBridge', () => {
  let bridge: SurfaceStateBridge;

  beforeEach(() => {
    bridge = createSurfaceStateBridge();
  });

  afterEach(() => {
    bridge.clear();
  });

  describe('Surface Creation', () => {
    it('should create bound surface', () => {
      const config: BoundSurfaceConfig = {
        surfaceId: 'coverage-surface',
        template: (builder) =>
          builder
            .addComponent('root', { type: 'Column' })
            .addComponent('gauge', { type: 'CoverageGauge', value: 0 })
            .setChildren('root', ['gauge'])
            .setRoot('root'),
        bindings: [{ componentId: 'gauge', property: 'value', statePath: '/coverage/line' }],
      };

      const generator = bridge.createBoundSurface(config);

      expect(generator).toBeDefined();
      expect(bridge.getSurface('coverage-surface')).toBe(generator);
    });

    it('should create surface with initial data', () => {
      const config: BoundSurfaceConfig = {
        surfaceId: 'test-surface',
        template: (builder) => builder.addComponent('root', { type: 'Column' }).setRoot('root'),
        bindings: [],
        initialData: { value: 42 },
      };

      bridge.createBoundSurface(config);
      const generator = bridge.getSurface('test-surface');
      const surface = generator?.getSurface('test-surface');

      expect(surface?.data.value).toBe(42);
    });

    it('should create surface with title and catalog', () => {
      const config: BoundSurfaceConfig = {
        surfaceId: 'test-surface',
        template: (builder) => builder.addComponent('root', { type: 'Column' }).setRoot('root'),
        bindings: [],
        title: 'My Surface',
        catalogId: 'custom-catalog',
      };

      bridge.createBoundSurface(config);
      const generator = bridge.getSurface('test-surface');
      const surface = generator?.getSurface('test-surface');

      expect(surface?.title).toBe('My Surface');
      expect(surface?.catalogId).toBe('custom-catalog');
    });

    it('should emit surfaceCreated event', () => {
      const createdSpy = vi.fn();
      bridge.on('surfaceCreated', createdSpy);

      bridge.createBoundSurface({
        surfaceId: 'test',
        template: (b) => b.addComponent('root', { type: 'Column' }).setRoot('root'),
        bindings: [{ componentId: 'root', property: 'gap', statePath: '/gap' }],
      });

      expect(createdSpy).toHaveBeenCalledWith({
        surfaceId: 'test',
        bindings: [{ componentId: 'root', property: 'gap', statePath: '/gap' }],
      });
    });

    it('should replace existing surface with same ID', () => {
      const config1: BoundSurfaceConfig = {
        surfaceId: 'test',
        template: (b) => b.addComponent('root', { type: 'Row' }).setRoot('root'),
        bindings: [],
      };

      const config2: BoundSurfaceConfig = {
        surfaceId: 'test',
        template: (b) => b.addComponent('root', { type: 'Column' }).setRoot('root'),
        bindings: [],
      };

      bridge.createBoundSurface(config1);
      const generator2 = bridge.createBoundSurface(config2);

      expect(bridge.getSurface('test')).toBe(generator2);
      expect(bridge.getSurfaceIds()).toHaveLength(1);
    });
  });

  describe('Surface Removal', () => {
    it('should remove surface', () => {
      bridge.createBoundSurface({
        surfaceId: 'test',
        template: (b) => b.addComponent('root', { type: 'Column' }).setRoot('root'),
        bindings: [],
      });

      bridge.removeSurface('test');

      expect(bridge.getSurface('test')).toBeUndefined();
    });

    it('should emit surfaceRemoved event', () => {
      bridge.createBoundSurface({
        surfaceId: 'test',
        template: (b) => b.addComponent('root', { type: 'Column' }).setRoot('root'),
        bindings: [],
      });

      const removedSpy = vi.fn();
      bridge.on('surfaceRemoved', removedSpy);

      bridge.removeSurface('test');

      expect(removedSpy).toHaveBeenCalledWith({ surfaceId: 'test' });
    });
  });

  describe('Binding Management', () => {
    beforeEach(() => {
      bridge.createBoundSurface({
        surfaceId: 'test',
        template: (b) =>
          b
            .addComponent('root', { type: 'Column' })
            .addComponent('gauge', { type: 'CoverageGauge', value: 0 })
            .setChildren('root', ['gauge'])
            .setRoot('root'),
        bindings: [],
      });
    });

    it('should get bindings for surface', () => {
      bridge.addBinding('test', {
        componentId: 'gauge',
        property: 'value',
        statePath: '/coverage',
      });

      const bindings = bridge.getBindings('test');

      expect(bindings).toHaveLength(1);
      expect(bindings[0].componentId).toBe('gauge');
    });

    it('should add binding to existing surface', () => {
      bridge.addBinding('test', {
        componentId: 'gauge',
        property: 'value',
        statePath: '/coverage',
      });

      expect(bridge.getBindings('test')).toHaveLength(1);
    });

    it('should emit bindingAdded event', () => {
      const addedSpy = vi.fn();
      bridge.on('bindingAdded', addedSpy);

      const newBinding = {
        componentId: 'gauge',
        property: 'value',
        statePath: '/coverage',
      };
      bridge.addBinding('test', newBinding);

      expect(addedSpy).toHaveBeenCalledWith({
        surfaceId: 'test',
        binding: newBinding,
      });
    });

    it('should remove binding from surface', () => {
      bridge.addBinding('test', {
        componentId: 'gauge',
        property: 'value',
        statePath: '/coverage',
      });

      bridge.removeBinding('test', 'gauge', 'value');

      expect(bridge.getBindings('test')).toHaveLength(0);
    });

    it('should emit bindingRemoved event', () => {
      bridge.addBinding('test', {
        componentId: 'gauge',
        property: 'value',
        statePath: '/coverage',
      });

      const removedSpy = vi.fn();
      bridge.on('bindingRemoved', removedSpy);

      bridge.removeBinding('test', 'gauge', 'value');

      expect(removedSpy).toHaveBeenCalledWith({
        surfaceId: 'test',
        componentId: 'gauge',
        property: 'value',
      });
    });

    it('should throw when adding binding to non-existent surface', () => {
      expect(() => {
        bridge.addBinding('non-existent', {
          componentId: 'x',
          property: 'y',
          statePath: '/z',
        });
      }).toThrow('Surface non-existent not found');
    });
  });

  describe('State Updates', () => {
    beforeEach(() => {
      bridge.createBoundSurface({
        surfaceId: 'qe-dashboard',
        template: (b) =>
          b
            .addComponent('root', { type: 'Column' })
            .addComponent('coverage-gauge', { type: 'CoverageGauge', value: 0 })
            .addComponent('tests-count', { type: 'Text', text: '0' })
            .setChildren('root', ['coverage-gauge', 'tests-count'])
            .setRoot('root'),
        bindings: [
          { componentId: 'coverage-gauge', property: 'value', statePath: '/coverage/line' },
          { componentId: 'tests-count', property: 'text', statePath: '/tests/passed' },
        ],
      });
    });

    it('should update surfaces from state', () => {
      bridge.updateFromState({
        coverage: { line: 85, branch: 72 },
        tests: { passed: 120 },
      });

      const generator = bridge.getSurface('qe-dashboard');
      const component = generator?.getComponent('qe-dashboard', 'coverage-gauge');

      expect(component?.properties?.value).toBe(85);
    });

    it('should emit stateUpdated event', () => {
      const updatedSpy = vi.fn();
      bridge.on('stateUpdated', updatedSpy);

      bridge.updateFromState({ coverage: { line: 90 } });

      expect(updatedSpy).toHaveBeenCalledWith({
        state: { coverage: { line: 90 } },
      });
    });

    it('should apply transform on update', () => {
      bridge.addBinding('qe-dashboard', {
        componentId: 'coverage-gauge',
        property: 'percentage',
        statePath: '/coverage/raw',
        transform: (v) => `${v}%`,
      });

      bridge.updateFromState({ coverage: { raw: 85, line: 85 }, tests: { passed: 100 } });

      const generator = bridge.getSurface('qe-dashboard');
      const component = generator?.getComponent('qe-dashboard', 'coverage-gauge');

      expect(component?.properties?.percentage).toBe('85%');
    });
  });

  describe('Delta Application', () => {
    beforeEach(() => {
      bridge.createBoundSurface({
        surfaceId: 'dashboard',
        template: (b) =>
          b
            .addComponent('root', { type: 'Column' })
            .addComponent('metric', { type: 'Text', value: 0 })
            .setChildren('root', ['metric'])
            .setRoot('root'),
        bindings: [{ componentId: 'metric', property: 'value', statePath: '/metrics/value' }],
      });

      bridge.updateFromState({ metrics: { value: 50 } });
    });

    it('should apply add operation', () => {
      bridge.applyDelta([{ op: 'add', path: '/metrics/value', value: 75 }]);

      const generator = bridge.getSurface('dashboard');
      const component = generator?.getComponent('dashboard', 'metric');

      expect(component?.properties?.value).toBe(75);
    });

    it('should apply replace operation', () => {
      bridge.applyDelta([{ op: 'replace', path: '/metrics/value', value: 100 }]);

      const generator = bridge.getSurface('dashboard');
      const component = generator?.getComponent('dashboard', 'metric');

      expect(component?.properties?.value).toBe(100);
    });

    it('should apply remove operation', () => {
      bridge.applyDelta([{ op: 'remove', path: '/metrics/value' }]);

      const state = bridge.getCurrentState();
      expect(state.metrics).not.toHaveProperty('value');
    });

    it('should emit bridgeUpdate event', () => {
      const updateSpy = vi.fn();
      bridge.on('bridgeUpdate', updateSpy);

      bridge.applyDelta([{ op: 'replace', path: '/metrics/value', value: 60 }]);

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'delta',
          surfaceId: 'dashboard',
          componentId: 'metric',
          property: 'value',
          statePath: '/metrics/value',
          value: 60,
        })
      );
    });

    it('should handle parent path changes', () => {
      bridge.createBoundSurface({
        surfaceId: 'nested',
        template: (b) =>
          b.addComponent('item', { type: 'Text', data: {} }).setRoot('item'),
        bindings: [{ componentId: 'item', property: 'data', statePath: '/nested/obj' }],
      });

      bridge.updateFromState({ nested: { obj: { a: 1 } }, metrics: { value: 50 } });
      bridge.applyDelta([{ op: 'replace', path: '/nested', value: { obj: { a: 2, b: 3 } } }]);

      const state = bridge.getCurrentState();
      expect((state.nested as { obj: { a: number; b: number } }).obj).toEqual({ a: 2, b: 3 });
    });

    it('should handle move operation', () => {
      bridge.updateFromState({ metrics: { value: 50 }, other: {} });
      bridge.applyDelta([{ op: 'move', from: '/metrics/value', path: '/other/moved' }]);

      const state = bridge.getCurrentState();
      expect((state.other as { moved: number }).moved).toBe(50);
      expect(state.metrics).not.toHaveProperty('value');
    });

    it('should handle copy operation', () => {
      bridge.applyDelta([{ op: 'copy', from: '/metrics/value', path: '/metrics/copied' }]);

      const state = bridge.getCurrentState();
      expect((state.metrics as { copied: number }).copied).toBe(50);
      expect((state.metrics as { value: number }).value).toBe(50);
    });
  });

  describe('Path Resolution', () => {
    beforeEach(() => {
      bridge.createBoundSurface({
        surfaceId: 's1',
        template: (b) => b.addComponent('c1', { type: 'Text', v: 0 }).setRoot('c1'),
        bindings: [{ componentId: 'c1', property: 'v', statePath: '/a/b' }],
      });

      bridge.createBoundSurface({
        surfaceId: 's2',
        template: (b) => b.addComponent('c2', { type: 'Text', v: 0 }).setRoot('c2'),
        bindings: [{ componentId: 'c2', property: 'v', statePath: '/a/c' }],
      });
    });

    it('should get surfaces for exact path', () => {
      const surfaces = bridge.getSurfacesForPath('/a/b');
      expect(surfaces).toContain('s1');
      expect(surfaces).not.toContain('s2');
    });

    it('should get surfaces for parent path', () => {
      const surfaces = bridge.getSurfacesForPath('/a');
      expect(surfaces).toContain('s1');
      expect(surfaces).toContain('s2');
    });

    it('should get surfaces for child path', () => {
      const surfaces = bridge.getSurfacesForPath('/a/b/deep');
      expect(surfaces).toContain('s1');
    });
  });

  describe('Statistics', () => {
    it('should return bridge statistics', () => {
      bridge.createBoundSurface({
        surfaceId: 's1',
        template: (b) => b.addComponent('root', { type: 'Column' }).setRoot('root'),
        bindings: [
          { componentId: 'root', property: 'a', statePath: '/a' },
          { componentId: 'root', property: 'b', statePath: '/b' },
        ],
      });

      bridge.createBoundSurface({
        surfaceId: 's2',
        template: (b) => b.addComponent('root', { type: 'Column' }).setRoot('root'),
        bindings: [{ componentId: 'root', property: 'c', statePath: '/c' }],
      });

      const stats = bridge.getStats();

      expect(stats.surfaceCount).toBe(2);
      expect(stats.totalBindings).toBe(3);
      expect(stats.pathMappingCount).toBe(3);
      expect(stats.averageBindingsPerSurface).toBe(1.5);
    });

    it('should clear all surfaces', () => {
      bridge.createBoundSurface({
        surfaceId: 'test',
        template: (b) => b.addComponent('root', { type: 'Column' }).setRoot('root'),
        bindings: [],
      });

      bridge.clear();

      expect(bridge.getSurfaceIds()).toHaveLength(0);
      expect(bridge.getStats().surfaceCount).toBe(0);
    });
  });

  describe('Message Generation', () => {
    it('should generate surface update message', () => {
      bridge.createBoundSurface({
        surfaceId: 'test',
        template: (b) => b.addComponent('root', { type: 'Column' }).setRoot('root'),
        bindings: [],
      });

      const message = bridge.generateSurfaceUpdate('test');

      expect(message).toBeDefined();
      expect(message?.surfaceId).toBe('test');
      expect(message?.type).toBe('surfaceUpdate');
    });

    it('should get all messages for surface', () => {
      bridge.createBoundSurface({
        surfaceId: 'test',
        template: (b) => b.addComponent('root', { type: 'Column' }).setRoot('root'),
        bindings: [],
      });

      const messages = bridge.getAllMessages('test');

      expect(messages).toBeDefined();
      expect(messages?.beginRendering).toBeDefined();
      expect(messages?.surfaceUpdate).toBeDefined();
      expect(messages?.dataModelUpdate).toBeDefined();
    });

    it('should return null for non-existent surface', () => {
      expect(bridge.generateSurfaceUpdate('non-existent')).toBeNull();
      expect(bridge.getAllMessages('non-existent')).toBeNull();
    });
  });
});

// ============================================================================
// Convenience Builder Tests
// ============================================================================

describe('Convenience Builders', () => {
  describe('boundSurface', () => {
    it('should create BoundSurfaceConfig', () => {
      const config = boundSurface(
        'my-surface',
        (b) => b.addComponent('root', { type: 'Column' }).setRoot('root'),
        [{ componentId: 'root', property: 'gap', statePath: '/layout/gap' }],
        { title: 'My Surface', initialData: { x: 1 } }
      );

      expect(config.surfaceId).toBe('my-surface');
      expect(config.bindings).toHaveLength(1);
      expect(config.title).toBe('My Surface');
      expect(config.initialData).toEqual({ x: 1 });
    });
  });

  describe('binding', () => {
    it('should create ComponentBinding', () => {
      const b = binding('gauge', 'value', '/metrics/coverage');

      expect(b.componentId).toBe('gauge');
      expect(b.property).toBe('value');
      expect(b.statePath).toBe('/metrics/coverage');
    });

    it('should create binding with transform', () => {
      const transform = (v: unknown) => (v as number) * 100;
      const b = binding('gauge', 'percent', '/metrics/ratio', transform);

      expect(b.transform).toBe(transform);
    });
  });
});

// ============================================================================
// Integration Tests (AGUISyncService + SurfaceStateBridge)
// ============================================================================

describe('AG-UI + A2UI Integration', () => {
  let stateManager: StateManager;
  let eventAdapter: EventAdapter;
  let syncService: AGUISyncService;
  let bridge: SurfaceStateBridge;

  beforeEach(() => {
    stateManager = createTestStateManager({
      qe: {
        coverage: { line: 85, branch: 72 },
        tests: { passed: 120, failed: 5 },
      },
    });
    eventAdapter = createTestEventAdapter();

    syncService = createAGUISyncService({
      stateManager,
      eventAdapter,
    });

    bridge = createSurfaceStateBridge();
  });

  afterEach(() => {
    syncService.disconnect();
    bridge.clear();
  });

  it('should sync state changes to bound surfaces via bridge', () => {
    // Create bound surface
    const generator = bridge.createBoundSurface({
      surfaceId: 'qe-dashboard',
      template: (b) =>
        b
          .addComponent('root', { type: 'Column' })
          .addComponent('coverage', { type: 'CoverageGauge', value: 0 })
          .addComponent('tests', { type: 'TestStatusBadge', passed: 0, failed: 0 })
          .setChildren('root', ['coverage', 'tests'])
          .setRoot('root'),
      bindings: [
        binding('coverage', 'value', '/qe/coverage/line'),
        binding('tests', 'passed', '/qe/tests/passed'),
        binding('tests', 'failed', '/qe/tests/failed'),
      ],
    });

    // Connect to sync service
    syncService.connectSurface('qe-dashboard', generator);
    syncService.mapStatePath('/qe/coverage/line', '/qe/coverage/line');
    syncService.mapStatePath('/qe/tests/passed', '/qe/tests/passed');
    syncService.mapStatePath('/qe/tests/failed', '/qe/tests/failed');

    // Initialize bridge with state
    bridge.updateFromState(stateManager.getSnapshot());

    // Verify initial state
    let coverageComp = generator.getComponent('qe-dashboard', 'coverage');
    expect(coverageComp?.properties?.value).toBe(85);

    // State change via state manager
    stateManager.updatePath('/qe/coverage/line', 92);

    // Apply delta to bridge
    bridge.applyDelta([{ op: 'replace', path: '/qe/coverage/line', value: 92 }]);

    // Verify update
    coverageComp = generator.getComponent('qe-dashboard', 'coverage');
    expect(coverageComp?.properties?.value).toBe(92);
  });

  it('should handle bidirectional sync', () => {
    // Create bound surface
    const generator = bridge.createBoundSurface({
      surfaceId: 'controls',
      template: (b) =>
        b
          .addComponent('slider', { type: 'Slider', value: 80 })
          .setRoot('slider'),
      bindings: [binding('slider', 'value', '/settings/threshold')],
    });

    syncService.connectSurface('controls', generator);
    syncService.mapStatePath('/settings/threshold', '/settings/threshold');
    syncService.mapAction('slider-change', '/settings/threshold', 'value');

    // Initialize state manager and bridge with same initial state
    stateManager.setState({ settings: { threshold: 80 } });
    bridge.updateFromState({ settings: { threshold: 80 } });

    // Verify initial state
    let slider = generator.getComponent('controls', 'slider');
    expect(slider?.properties?.value).toBe(80);

    // Simulate user action from UI
    syncService.handleUserAction({
      type: 'userAction',
      surfaceId: 'controls',
      componentId: 'slider',
      actionId: 'slider-change',
      payload: { value: 90 },
      timestamp: new Date().toISOString(),
    });

    // State should be updated via the action handler
    expect(stateManager.getValue('/settings/threshold')).toBe(90);

    // Now apply the delta explicitly (simulating what AG-UI would do)
    bridge.applyDelta([{ op: 'replace', path: '/settings/threshold', value: 90 }]);

    // Surface should reflect new value
    slider = generator.getComponent('controls', 'slider');
    expect(slider?.properties?.value).toBe(90);
  });

  it('should emit custom events for surface updates', () => {
    const customEvents: unknown[] = [];
    eventAdapter.on('CUSTOM', (event) => customEvents.push(event));

    const generator = bridge.createBoundSurface({
      surfaceId: 'test',
      template: (b) => b.addComponent('root', { type: 'Column' }).setRoot('root'),
      bindings: [],
    });

    syncService.connectSurface('test', generator);

    // Trigger update via generator
    generator.updateComponent('test', 'root', { properties: { gap: 8 } });

    // Custom event should have been emitted
    expect(customEvents.length).toBeGreaterThan(0);
  });

  it('should handle multiple surfaces with shared state', () => {
    // Create two surfaces bound to same state
    const summary = bridge.createBoundSurface({
      surfaceId: 'summary',
      template: (b) =>
        b.addComponent('coverage-text', { type: 'Text', text: '0%' }).setRoot('coverage-text'),
      bindings: [
        {
          componentId: 'coverage-text',
          property: 'text',
          statePath: '/coverage/line',
          transform: (v) => `${v}%`,
        },
      ],
    });

    const details = bridge.createBoundSurface({
      surfaceId: 'details',
      template: (b) =>
        b.addComponent('gauge', { type: 'CoverageGauge', value: 0 }).setRoot('gauge'),
      bindings: [binding('gauge', 'value', '/coverage/line')],
    });

    syncService.connectSurface('summary', summary);
    syncService.connectSurface('details', details);

    // Initialize both
    bridge.updateFromState({ coverage: { line: 85 } });

    // Both should have values
    const summaryText = summary.getComponent('summary', 'coverage-text');
    const detailsGauge = details.getComponent('details', 'gauge');

    expect(summaryText?.properties?.text).toBe('85%');
    expect(detailsGauge?.properties?.value).toBe(85);

    // Update should affect both
    bridge.applyDelta([{ op: 'replace', path: '/coverage/line', value: 95 }]);

    const updatedSummary = summary.getComponent('summary', 'coverage-text');
    const updatedDetails = details.getComponent('details', 'gauge');

    expect(updatedSummary?.properties?.text).toBe('95%');
    expect(updatedDetails?.properties?.value).toBe(95);
  });
});
