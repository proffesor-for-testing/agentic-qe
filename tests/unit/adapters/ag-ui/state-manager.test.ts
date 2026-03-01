/**
 * AG-UI State Manager Unit Tests
 *
 * Tests for STATE_SNAPSHOT and STATE_DELTA event generation,
 * state tracking, reconnection handling, and history management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StateManager,
  createStateManager,
  type StateManagerConfig,
  type StateChangeEvent,
} from '../../../../src/adapters/ag-ui/state-manager.js';
import type { JsonPatchOperation } from '../../../../src/adapters/ag-ui/index.js';

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createStateManager', () => {
  it('should create state manager with default config', () => {
    const manager = createStateManager();
    expect(manager).toBeInstanceOf(StateManager);
    expect(manager.getVersion()).toBe(0);
    expect(manager.getState()).toEqual({});
  });

  it('should create state manager with initial state', () => {
    const initialState = { user: 'Alice', count: 42 };
    const manager = createStateManager({ initialState });
    expect(manager.getState()).toEqual(initialState);
  });

  it('should create state manager with custom config', () => {
    const config: StateManagerConfig = {
      initialState: { a: 1 },
      autoVersion: false,
      maxHistory: 5,
      emitEvents: false,
    };
    const manager = createStateManager(config);
    expect(manager).toBeInstanceOf(StateManager);
  });

  it('should create independent instances', () => {
    const manager1 = createStateManager({ initialState: { a: 1 } });
    const manager2 = createStateManager({ initialState: { b: 2 } });

    manager1.setState({ a: 10 });
    expect(manager2.getState()).toEqual({ b: 2 });
  });
});

// ============================================================================
// State Manager Tests
// ============================================================================

describe('StateManager', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = createStateManager({
      initialState: { count: 0, name: 'test' },
    });
  });

  // ============================================================================
  // Snapshot Operations
  // ============================================================================

  describe('Snapshot Operations', () => {
    describe('getSnapshot', () => {
      it('should return deep copy of state', () => {
        const snapshot = manager.getSnapshot();
        expect(snapshot).toEqual({ count: 0, name: 'test' });

        // Verify it's a copy, not reference
        snapshot.count = 999;
        expect(manager.getState().count).toBe(0);
      });

      it('should return current state after changes', () => {
        manager.setState({ count: 10, name: 'updated' });
        const snapshot = manager.getSnapshot();
        expect(snapshot).toEqual({ count: 10, name: 'updated' });
      });
    });

    describe('getVersion', () => {
      it('should start at version 0', () => {
        expect(manager.getVersion()).toBe(0);
      });

      it('should increment on state changes', () => {
        manager.setState({ count: 1, name: 'test' });
        expect(manager.getVersion()).toBe(1);

        manager.updatePath('/count', 2);
        expect(manager.getVersion()).toBe(2);
      });

      it('should not increment when state unchanged', () => {
        manager.setState({ count: 0, name: 'test' }); // Same as initial
        expect(manager.getVersion()).toBe(0);
      });

      it('should not increment when autoVersion is false', () => {
        const noVersionManager = createStateManager({
          initialState: { count: 0 },
          autoVersion: false,
        });
        noVersionManager.setState({ count: 10 });
        expect(noVersionManager.getVersion()).toBe(0);
      });
    });

    describe('generateSnapshotEvent', () => {
      it('should generate STATE_SNAPSHOT event', () => {
        const event = manager.generateSnapshotEvent();
        expect(event.type).toBe('STATE_SNAPSHOT');
        expect(event.state).toEqual({ count: 0, name: 'test' });
        expect(event.version).toBe(0);
      });

      it('should reflect current state after changes', () => {
        manager.setState({ count: 42, name: 'changed' });
        const event = manager.generateSnapshotEvent();
        expect(event.state).toEqual({ count: 42, name: 'changed' });
        expect(event.version).toBe(1);
      });
    });

    describe('shouldSendSnapshot', () => {
      it('should return true when no client version provided', () => {
        expect(manager.shouldSendSnapshot()).toBe(true);
      });

      it('should return true when client version is behind', () => {
        manager.generateSnapshotEvent(); // Record snapshot version
        manager.setState({ count: 10, name: 'test' });
        expect(manager.shouldSendSnapshot(0)).toBe(true);
      });

      it('should return false when client is up to date', () => {
        manager.generateSnapshotEvent();
        expect(manager.shouldSendSnapshot(0)).toBe(false);
      });
    });
  });

  // ============================================================================
  // State Mutation Operations
  // ============================================================================

  describe('State Mutation', () => {
    describe('getState', () => {
      it('should return readonly reference', () => {
        const state = manager.getState();
        expect(state).toEqual({ count: 0, name: 'test' });
      });
    });

    describe('setState', () => {
      it('should update state and return delta', () => {
        const delta = manager.setState({ count: 10, name: 'test' });
        expect(manager.getState()).toEqual({ count: 10, name: 'test' });
        expect(delta).toContainEqual({ op: 'replace', path: '/count', value: 10 });
      });

      it('should return empty delta when state unchanged', () => {
        const delta = manager.setState({ count: 0, name: 'test' });
        expect(delta).toEqual([]);
      });

      it('should handle complex state updates', () => {
        const newState = {
          count: 10,
          name: 'updated',
          nested: { deep: { value: 42 } },
          arr: [1, 2, 3],
        };
        manager.setState(newState);
        expect(manager.getState()).toEqual(newState);
      });

      it('should emit change event', () => {
        const events: StateChangeEvent[] = [];
        manager.on('change', (e: StateChangeEvent) => events.push(e));

        manager.setState({ count: 5, name: 'test' });

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('delta');
        expect(events[0].version).toBe(1);
      });

      it('should emit delta event', () => {
        const deltas: JsonPatchOperation[][] = [];
        manager.on('delta', (d: JsonPatchOperation[]) => deltas.push(d));

        manager.setState({ count: 5, name: 'test' });

        expect(deltas).toHaveLength(1);
        expect(deltas[0]).toContainEqual({ op: 'replace', path: '/count', value: 5 });
      });
    });

    describe('updatePath', () => {
      it('should update existing path', () => {
        const delta = manager.updatePath('/count', 100);
        expect(manager.getValue('/count')).toBe(100);
        expect(delta).toContainEqual({ op: 'replace', path: '/count', value: 100 });
      });

      it('should add new path', () => {
        const delta = manager.updatePath('/newField', 'value');
        expect(manager.getValue('/newField')).toBe('value');
        expect(delta).toContainEqual({ op: 'add', path: '/newField', value: 'value' });
      });

      it('should update nested path', () => {
        manager.setState({ nested: { value: 1 } });
        manager.updatePath('/nested/value', 2);
        expect(manager.getValue('/nested/value')).toBe(2);
      });
    });

    describe('removePath', () => {
      it('should remove existing path', () => {
        const delta = manager.removePath('/count');
        expect(manager.hasPath('/count')).toBe(false);
        expect(delta).toContainEqual({ op: 'remove', path: '/count' });
      });

      it('should return empty delta for non-existent path', () => {
        const delta = manager.removePath('/nonexistent');
        expect(delta).toEqual([]);
      });
    });

    describe('mergePath', () => {
      it('should merge object into path', () => {
        manager.setState({ config: { a: 1 } });
        manager.mergePath('/config', { b: 2, c: 3 });

        const config = manager.getValue('/config') as Record<string, unknown>;
        expect(config.a).toBe(1);
        expect(config.b).toBe(2);
        expect(config.c).toBe(3);
      });

      it('should overwrite existing keys', () => {
        manager.setState({ config: { a: 1, b: 2 } });
        manager.mergePath('/config', { a: 10 });

        expect(manager.getValue('/config/a')).toBe(10);
        expect(manager.getValue('/config/b')).toBe(2);
      });

      it('should replace non-object values', () => {
        manager.setState({ config: 'not an object' });
        manager.mergePath('/config', { key: 'value' });

        expect(manager.getValue('/config')).toEqual({ key: 'value' });
      });
    });
  });

  // ============================================================================
  // Delta Operations
  // ============================================================================

  describe('Delta Operations', () => {
    describe('computeDelta', () => {
      it('should compute delta between states', () => {
        const oldState = { a: 1, b: 2 };
        const newState = { a: 1, b: 3, c: 4 };
        const delta = manager.computeDelta(oldState, newState);

        expect(delta).toContainEqual({ op: 'replace', path: '/b', value: 3 });
        expect(delta).toContainEqual({ op: 'add', path: '/c', value: 4 });
      });

      it('should detect removals', () => {
        const oldState = { a: 1, b: 2 };
        const newState = { a: 1 };
        const delta = manager.computeDelta(oldState, newState);

        expect(delta).toContainEqual({ op: 'remove', path: '/b' });
      });
    });

    describe('applyDelta', () => {
      it('should apply delta to current state', () => {
        const delta: JsonPatchOperation[] = [
          { op: 'replace', path: '/count', value: 100 },
          { op: 'add', path: '/newField', value: 'hello' },
        ];

        manager.applyDelta(delta);

        expect(manager.getValue('/count')).toBe(100);
        expect(manager.getValue('/newField')).toBe('hello');
      });

      it('should update version', () => {
        manager.applyDelta([{ op: 'replace', path: '/count', value: 1 }]);
        expect(manager.getVersion()).toBe(1);
      });

      it('should emit delta event', () => {
        const deltas: JsonPatchOperation[][] = [];
        manager.on('delta', (d: JsonPatchOperation[]) => deltas.push(d));

        const patch: JsonPatchOperation[] = [{ op: 'replace', path: '/count', value: 5 }];
        manager.applyDelta(patch);

        expect(deltas).toHaveLength(1);
        expect(deltas[0]).toEqual(patch);
      });

      it('should throw on invalid patch', () => {
        const invalidPatch: JsonPatchOperation[] = [
          { op: 'invalid' as 'add', path: '/foo', value: 1 },
        ];
        expect(() => manager.applyDelta(invalidPatch)).toThrow();
      });

      it('should rollback on application error', () => {
        const originalState = manager.getSnapshot();
        const originalVersion = manager.getVersion();

        const badPatch: JsonPatchOperation[] = [
          { op: 'replace', path: '/count', value: 100 },
          { op: 'remove', path: '/nonexistent' }, // This will fail
        ];

        expect(() => manager.applyDelta(badPatch)).toThrow();

        // State should be unchanged
        expect(manager.getSnapshot()).toEqual(originalState);
        expect(manager.getVersion()).toBe(originalVersion);
      });

      it('should return empty for empty delta', () => {
        const result = manager.applyDelta([]);
        expect(result).toEqual([]);
        expect(manager.getVersion()).toBe(0); // No version increment
      });
    });

    describe('generateDeltaEvent', () => {
      it('should generate STATE_DELTA event', () => {
        const delta: JsonPatchOperation[] = [
          { op: 'replace', path: '/count', value: 10 },
        ];
        manager.applyDelta(delta);

        const event = manager.generateDeltaEvent(delta);
        expect(event.type).toBe('STATE_DELTA');
        expect(event.delta).toEqual(delta);
        expect(event.version).toBe(1);
      });
    });

    describe('applyExternalPatch', () => {
      it('should apply external patch and return result', () => {
        const patch: JsonPatchOperation[] = [
          { op: 'replace', path: '/count', value: 50 },
        ];
        const result = manager.applyExternalPatch(patch);

        expect(result.success).toBe(true);
        expect(manager.getValue('/count')).toBe(50);
      });

      it('should emit externalDelta event', () => {
        const patches: JsonPatchOperation[][] = [];
        manager.on('externalDelta', (p: JsonPatchOperation[]) => patches.push(p));

        manager.applyExternalPatch([{ op: 'replace', path: '/count', value: 25 }]);

        expect(patches).toHaveLength(1);
      });

      it('should return error result on failure', () => {
        const patch: JsonPatchOperation[] = [
          { op: 'remove', path: '/nonexistent' },
        ];
        const result = manager.applyExternalPatch(patch);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  // ============================================================================
  // History and Rollback
  // ============================================================================

  describe('History and Rollback', () => {
    describe('getHistory', () => {
      it('should include initial state', () => {
        const history = manager.getHistory();
        expect(history).toHaveLength(1);
        expect(history[0].version).toBe(0);
      });

      it('should track state changes', () => {
        manager.setState({ count: 1, name: 'test' });
        manager.setState({ count: 2, name: 'test' });

        const history = manager.getHistory();
        expect(history).toHaveLength(3);
        expect(history[2].version).toBe(2);
      });

      it('should respect maxHistory limit', () => {
        const limitedManager = createStateManager({
          initialState: { count: 0 },
          maxHistory: 3,
        });

        limitedManager.setState({ count: 1 });
        limitedManager.setState({ count: 2 });
        limitedManager.setState({ count: 3 });
        limitedManager.setState({ count: 4 });

        const history = limitedManager.getHistory();
        expect(history).toHaveLength(3);
      });
    });

    describe('getStateAtVersion', () => {
      it('should return state at specific version', () => {
        manager.setState({ count: 10, name: 'test' });
        manager.setState({ count: 20, name: 'test' });

        const stateV1 = manager.getStateAtVersion(1);
        expect(stateV1).toEqual({ count: 10, name: 'test' });
      });

      it('should return undefined for non-existent version', () => {
        expect(manager.getStateAtVersion(999)).toBeUndefined();
      });

      it('should return deep copy', () => {
        manager.setState({ count: 5, name: 'test' });
        const stateV1 = manager.getStateAtVersion(1);

        stateV1!.count = 999;
        expect(manager.getStateAtVersion(1)!.count).toBe(5);
      });
    });

    describe('rollback', () => {
      it('should rollback to previous version', () => {
        manager.setState({ count: 10, name: 'test' });
        manager.setState({ count: 20, name: 'test' });

        const delta = manager.rollback(1);

        expect(manager.getState()).toEqual({ count: 10, name: 'test' });
        expect(manager.getVersion()).toBe(1);
        expect(delta.length).toBeGreaterThan(0);
      });

      it('should emit rollback event', () => {
        const rollbacks: number[] = [];
        manager.on('rollback', (version: number) => rollbacks.push(version));

        manager.setState({ count: 10, name: 'test' });
        manager.rollback(0);

        expect(rollbacks).toContain(0);
      });

      it('should throw for non-existent version', () => {
        expect(() => manager.rollback(999)).toThrow();
      });
    });
  });

  // ============================================================================
  // Connection Management
  // ============================================================================

  describe('Connection Management', () => {
    describe('onConnection', () => {
      it('should return snapshot event', () => {
        const event = manager.onConnection('conn-123');

        expect(event.type).toBe('STATE_SNAPSHOT');
        expect(event.state).toEqual({ count: 0, name: 'test' });
      });

      it('should emit connection event', () => {
        const connections: string[] = [];
        manager.on('connection', (id: string) => connections.push(id));

        manager.onConnection('conn-123');

        expect(connections).toContain('conn-123');
      });

      it('should store connection ID', () => {
        manager.onConnection('conn-123');
        expect(manager.getConnectionId()).toBe('conn-123');
      });
    });

    describe('onReconnection', () => {
      it('should return snapshot when client is behind', () => {
        manager.generateSnapshotEvent();
        manager.setState({ count: 10, name: 'test' });

        const event = manager.onReconnection('conn-456', 0);

        expect(event).not.toBeNull();
        expect(event!.type).toBe('STATE_SNAPSHOT');
      });

      it('should return null when client is up to date', () => {
        manager.generateSnapshotEvent();

        const event = manager.onReconnection('conn-456', 0);

        expect(event).toBeNull();
      });

      it('should return snapshot when no client version provided', () => {
        const event = manager.onReconnection('conn-456');
        expect(event).not.toBeNull();
      });

      it('should emit reconnection event', () => {
        const reconnections: string[] = [];
        manager.on('reconnection', (id: string) => reconnections.push(id));

        manager.onReconnection('conn-456');

        expect(reconnections).toContain('conn-456');
      });
    });

    describe('onDisconnection', () => {
      it('should clear connection ID', () => {
        manager.onConnection('conn-123');
        manager.onDisconnection('conn-123');

        expect(manager.getConnectionId()).toBeNull();
      });

      it('should emit disconnection event', () => {
        const disconnections: string[] = [];
        manager.on('disconnection', (id: string) => disconnections.push(id));

        manager.onConnection('conn-123');
        manager.onDisconnection('conn-123');

        expect(disconnections).toContain('conn-123');
      });

      it('should not clear connection ID for different connection', () => {
        manager.onConnection('conn-123');
        manager.onDisconnection('conn-999');

        expect(manager.getConnectionId()).toBe('conn-123');
      });
    });
  });

  // ============================================================================
  // Query Operations
  // ============================================================================

  describe('Query Operations', () => {
    beforeEach(() => {
      manager.setState({
        user: { name: 'Alice', age: 30 },
        items: [1, 2, 3],
        active: true,
      });
    });

    describe('getValue', () => {
      it('should get value at path', () => {
        expect(manager.getValue('/user/name')).toBe('Alice');
        expect(manager.getValue('/items/1')).toBe(2);
        expect(manager.getValue('/active')).toBe(true);
      });

      it('should return undefined for non-existent path', () => {
        expect(manager.getValue('/nonexistent')).toBeUndefined();
      });

      it('should support generic type', () => {
        const name = manager.getValue<string>('/user/name');
        expect(name).toBe('Alice');
      });
    });

    describe('hasPath', () => {
      it('should return true for existing paths', () => {
        expect(manager.hasPath('/user')).toBe(true);
        expect(manager.hasPath('/user/name')).toBe(true);
        expect(manager.hasPath('/items/0')).toBe(true);
      });

      it('should return false for non-existent paths', () => {
        expect(manager.hasPath('/nonexistent')).toBe(false);
        expect(manager.hasPath('/user/email')).toBe(false);
      });
    });

    describe('equals', () => {
      it('should return true for equal states', () => {
        const otherState = {
          user: { name: 'Alice', age: 30 },
          items: [1, 2, 3],
          active: true,
        };
        expect(manager.equals(otherState)).toBe(true);
      });

      it('should return false for different states', () => {
        const otherState = {
          user: { name: 'Bob', age: 25 },
          items: [1, 2],
          active: false,
        };
        expect(manager.equals(otherState)).toBe(false);
      });
    });
  });

  // ============================================================================
  // Reset and Clear
  // ============================================================================

  describe('Reset and Clear', () => {
    describe('reset', () => {
      it('should reset to initial state', () => {
        manager.setState({ count: 100, name: 'changed' });
        manager.reset();

        expect(manager.getState()).toEqual({ count: 0, name: 'test' });
        expect(manager.getVersion()).toBe(0);
      });

      it('should clear history', () => {
        manager.setState({ count: 10, name: 'test' });
        manager.setState({ count: 20, name: 'test' });
        manager.reset();

        const history = manager.getHistory();
        expect(history).toHaveLength(1);
      });

      it('should return delta from current to initial', () => {
        manager.setState({ count: 100, name: 'changed' });
        const delta = manager.reset();

        expect(delta.length).toBeGreaterThan(0);
      });

      it('should emit reset event', () => {
        const resets: JsonPatchOperation[][] = [];
        manager.on('reset', (delta: JsonPatchOperation[]) => resets.push(delta));

        manager.setState({ count: 10, name: 'test' });
        manager.reset();

        expect(resets).toHaveLength(1);
      });
    });

    describe('clear', () => {
      it('should set state to empty object', () => {
        manager.setState({ count: 100, name: 'test' });
        manager.clear();

        expect(manager.getState()).toEqual({});
      });

      it('should return delta operations', () => {
        const delta = manager.clear();
        expect(delta.length).toBeGreaterThan(0);
      });
    });

    describe('clearHistory', () => {
      it('should clear history but keep current state', () => {
        manager.setState({ count: 10, name: 'test' });
        manager.setState({ count: 20, name: 'test' });
        manager.clearHistory();

        const history = manager.getHistory();
        expect(history).toHaveLength(1);
        expect(manager.getState()).toEqual({ count: 20, name: 'test' });
      });
    });
  });
});

// ============================================================================
// Event Emission Tests
// ============================================================================

describe('Event Emission', () => {
  describe('emitEvents config', () => {
    it('should not emit events when disabled', () => {
      const manager = createStateManager({
        initialState: { count: 0 },
        emitEvents: false,
      });

      const events: StateChangeEvent[] = [];
      manager.on('change', (e: StateChangeEvent) => events.push(e));

      manager.setState({ count: 10 });

      expect(events).toHaveLength(0);
    });

    it('should emit events when enabled', () => {
      const manager = createStateManager({
        initialState: { count: 0 },
        emitEvents: true,
      });

      const events: StateChangeEvent[] = [];
      manager.on('change', (e: StateChangeEvent) => events.push(e));

      manager.setState({ count: 10 });

      expect(events).toHaveLength(1);
    });
  });

  describe('custom generators', () => {
    it('should use custom ID generator', () => {
      let counter = 0;
      const manager = createStateManager({
        idGenerator: () => `custom-${++counter}`,
      });

      // The ID generator is available but primarily used internally
      expect(manager).toBeInstanceOf(StateManager);
    });

    it('should use custom timestamp generator', () => {
      const fixedTime = '2026-01-30T12:00:00.000Z';
      const manager = createStateManager({
        initialState: { count: 0 },
        timestampGenerator: () => fixedTime,
      });

      const events: StateChangeEvent[] = [];
      manager.on('change', (e: StateChangeEvent) => events.push(e));

      manager.setState({ count: 10 });

      expect(events[0].timestamp).toBe(fixedTime);
    });
  });
});

// ============================================================================
// Integration with EventAdapter
// ============================================================================

describe('Integration Patterns', () => {
  it('should support typical state sync workflow', () => {
    const manager = createStateManager({
      initialState: {
        user: { name: 'Alice', preferences: { theme: 'light' } },
        messages: [],
      },
    });

    // Client connects - send snapshot
    const snapshotEvent = manager.onConnection('client-1');
    expect(snapshotEvent.type).toBe('STATE_SNAPSHOT');
    expect(snapshotEvent.state.user).toBeDefined();

    // State changes during session
    const delta1 = manager.updatePath('/user/preferences/theme', 'dark');
    expect(delta1).toContainEqual({
      op: 'replace',
      path: '/user/preferences/theme',
      value: 'dark',
    });

    const delta2 = manager.mergePath('/user', { lastActive: '2026-01-30' });
    expect(delta2.some((op) => op.path.includes('lastActive'))).toBe(true);

    // Client reconnects
    const reconnectEvent = manager.onReconnection('client-1', 0);
    expect(reconnectEvent).not.toBeNull();
    expect(reconnectEvent!.type).toBe('STATE_SNAPSHOT');
    expect(reconnectEvent!.state.user.preferences.theme).toBe('dark');
  });

  it('should handle concurrent state updates', () => {
    const manager = createStateManager({
      initialState: { counter: 0 },
    });

    // Simulate concurrent updates
    for (let i = 0; i < 10; i++) {
      const currentValue = manager.getValue<number>('/counter') ?? 0;
      manager.updatePath('/counter', currentValue + 1);
    }

    expect(manager.getValue('/counter')).toBe(10);
    expect(manager.getVersion()).toBe(10);
  });

  it('should support optimistic updates with rollback', () => {
    const manager = createStateManager({
      initialState: { data: 'original', version: 1 },
    });

    // Make changes
    manager.setState({ data: 'updated', version: 2 });
    manager.setState({ data: 'updated again', version: 3 });

    // Rollback on conflict
    manager.rollback(1);

    expect(manager.getState()).toEqual({ data: 'updated', version: 2 });
  });

  it('should handle complex nested state', () => {
    const manager = createStateManager({
      initialState: {
        app: {
          config: {
            features: {
              darkMode: false,
              notifications: true,
            },
          },
          session: {
            userId: null,
            token: null,
          },
        },
        data: {
          items: [],
          cache: {},
        },
      },
    });

    // Update nested values
    manager.updatePath('/app/session/userId', 'user-123');
    manager.updatePath('/app/session/token', 'jwt-token');
    manager.updatePath('/app/config/features/darkMode', true);

    // Add items
    const items = manager.getValue<unknown[]>('/data/items') ?? [];
    manager.updatePath('/data/items', [...items, { id: 1, name: 'Item 1' }]);

    expect(manager.getValue('/app/session/userId')).toBe('user-123');
    expect(manager.getValue('/app/config/features/darkMode')).toBe(true);
    expect((manager.getValue('/data/items') as unknown[]).length).toBe(1);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty initial state', () => {
    const manager = createStateManager();
    expect(manager.getState()).toEqual({});
    expect(manager.getSnapshot()).toEqual({});
  });

  it('should handle null values in state', () => {
    const manager = createStateManager({
      initialState: { nullable: null, value: 1 },
    });

    expect(manager.getValue('/nullable')).toBeNull();

    manager.updatePath('/nullable', 'not null');
    expect(manager.getValue('/nullable')).toBe('not null');
  });

  it('should handle array state', () => {
    const manager = createStateManager({
      initialState: { items: [1, 2, 3] },
    });

    manager.updatePath('/items/1', 99);
    expect(manager.getValue('/items')).toEqual([1, 99, 3]);
  });

  it('should handle special characters in paths', () => {
    const manager = createStateManager({
      initialState: { 'key/with/slashes': 1, 'key~with~tildes': 2 },
    });

    // These paths need proper escaping
    expect(manager.hasPath('/key~1with~1slashes')).toBe(true);
    expect(manager.hasPath('/key~0with~0tildes')).toBe(true);
  });

  it('should handle rapid state changes', () => {
    const manager = createStateManager({
      initialState: { count: 0 },
    });

    for (let i = 0; i < 100; i++) {
      manager.updatePath('/count', i);
    }

    expect(manager.getValue('/count')).toBe(99);
    expect(manager.getVersion()).toBe(100);
  });

  it('should handle deeply nested state changes', () => {
    const manager = createStateManager({
      initialState: {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
              },
            },
          },
        },
      },
    });

    manager.updatePath('/level1/level2/level3/level4/value', 'updated');
    expect(manager.getValue('/level1/level2/level3/level4/value')).toBe('updated');
  });
});
