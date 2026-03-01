/**
 * AG-UI Sync Service
 *
 * Connects A2UI surfaces to AG-UI state synchronization for reactive updates.
 * Handles bidirectional sync between AG-UI state events and A2UI surfaces.
 *
 * @module adapters/a2ui/integration/agui-sync
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type {
  StateManager,
  StateChangeEvent,
  JsonPatchOperation,
} from '../../ag-ui/index.js';
import type {
  SurfaceGenerator,
  SurfaceState,
  SurfaceUpdateMessage,
  DataModelUpdateMessage,
  DeleteSurfaceMessage,
  UserActionMessage,
} from '../renderer/index.js';
import type { EventAdapter } from '../../ag-ui/event-adapter.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Path mapping between AG-UI state and A2UI surface data
 */
export interface PathMapping {
  /** AG-UI state path (JSON Pointer) */
  readonly aguiPath: string;
  /** A2UI surface data path (JSON Pointer) */
  readonly a2uiPath: string;
  /** Surface ID this mapping applies to (optional, applies to all if not set) */
  readonly surfaceId?: string;
  /** Transform function for value conversion */
  readonly transform?: (value: unknown) => unknown;
  /** Inverse transform for bidirectional sync */
  readonly inverseTransform?: (value: unknown) => unknown;
}

/**
 * A2UI CUSTOM event names
 */
export type A2UICustomEventName =
  | 'a2ui:surfaceUpdate'
  | 'a2ui:surfaceDelete'
  | 'a2ui:userAction'
  | 'a2ui:dataUpdate';

/**
 * A2UI CUSTOM event payload types
 */
export interface A2UICustomEventPayload {
  'a2ui:surfaceUpdate': SurfaceUpdateMessage;
  'a2ui:surfaceDelete': DeleteSurfaceMessage;
  'a2ui:userAction': UserActionMessage;
  'a2ui:dataUpdate': DataModelUpdateMessage;
}

/**
 * User action to state update mapping
 */
export interface ActionStateMapping {
  /** Action ID pattern (supports wildcards with *) */
  readonly actionPattern: string;
  /** State path to update */
  readonly statePath: string;
  /** Payload key to use as value (or function) */
  readonly valueExtractor: string | ((payload: Record<string, unknown>) => unknown);
}

/**
 * AG-UI Sync Service configuration
 */
export interface AGUISyncServiceConfig {
  /** State manager instance (required) */
  readonly stateManager: StateManager;
  /** Event adapter for emitting CUSTOM events (optional) */
  readonly eventAdapter?: EventAdapter;
  /** Whether to emit surface updates as AG-UI CUSTOM events */
  readonly emitSurfaceEvents?: boolean;
  /** Whether to handle user actions and update state */
  readonly handleUserActions?: boolean;
  /** Custom ID generator */
  readonly idGenerator?: () => string;
  /** Custom timestamp generator */
  readonly timestampGenerator?: () => string;
  /** Enable debug logging */
  readonly debug?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  emitSurfaceEvents: true,
  handleUserActions: true,
  idGenerator: () => uuidv4(),
  timestampGenerator: () => new Date().toISOString(),
  debug: false,
};

/**
 * Sync service state
 */
export interface SyncServiceState {
  /** Connected state manager */
  readonly stateManager: StateManager | null;
  /** Connected event adapter */
  readonly eventAdapter: EventAdapter | null;
  /** Connected surfaces */
  readonly surfaces: Map<string, SurfaceGenerator>;
  /** Active path mappings */
  readonly pathMappings: PathMapping[];
  /** Action to state mappings */
  readonly actionMappings: ActionStateMapping[];
  /** Whether service is connected */
  readonly isConnected: boolean;
}

/**
 * Sync event for monitoring
 */
export interface SyncEvent {
  readonly type: 'stateToSurface' | 'surfaceToState' | 'userAction';
  readonly timestamp: string;
  readonly sourceId: string;
  readonly targetId?: string;
  readonly path: string;
  readonly value?: unknown;
}

// ============================================================================
// AG-UI Sync Service Implementation
// ============================================================================

/**
 * AG-UI Sync Service
 *
 * Provides bidirectional synchronization between AG-UI state manager
 * and A2UI surface generators.
 */
export class AGUISyncService extends EventEmitter {
  private config: Required<Omit<AGUISyncServiceConfig, 'stateManager' | 'eventAdapter'>> & {
    stateManager: StateManager;
    eventAdapter: EventAdapter | null;
  };
  private surfaces: Map<string, SurfaceGenerator> = new Map();
  private pathMappings: PathMapping[] = [];
  private actionMappings: ActionStateMapping[] = [];
  private isConnected: boolean = false;

  // Subscriptions for cleanup
  private stateSubscription: (() => void) | null = null;
  private surfaceSubscriptions: Map<string, () => void> = new Map();

  constructor(config: AGUISyncServiceConfig) {
    super();

    this.config = {
      ...DEFAULT_CONFIG,
      stateManager: config.stateManager,
      eventAdapter: config.eventAdapter ?? null,
      emitSurfaceEvents: config.emitSurfaceEvents ?? DEFAULT_CONFIG.emitSurfaceEvents,
      handleUserActions: config.handleUserActions ?? DEFAULT_CONFIG.handleUserActions,
      idGenerator: config.idGenerator ?? DEFAULT_CONFIG.idGenerator,
      timestampGenerator: config.timestampGenerator ?? DEFAULT_CONFIG.timestampGenerator,
      debug: config.debug ?? DEFAULT_CONFIG.debug,
    };

    this.connect();
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Connect to state manager and start listening for state changes
   */
  connect(): void {
    if (this.isConnected) {
      return;
    }

    // Subscribe to state manager changes
    this.config.stateManager.on('change', this.handleStateChange.bind(this));
    this.config.stateManager.on('delta', this.handleStateDelta.bind(this));

    this.isConnected = true;
    this.log('Connected to state manager');
    this.emit('connected');
  }

  /**
   * Disconnect from state manager and all surfaces
   */
  disconnect(): void {
    if (!this.isConnected) {
      return;
    }

    // Remove state manager listeners
    this.config.stateManager.removeAllListeners('change');
    this.config.stateManager.removeAllListeners('delta');

    // Remove surface subscriptions
    for (const [surfaceId, unsubscribe] of this.surfaceSubscriptions) {
      unsubscribe();
    }
    this.surfaceSubscriptions.clear();

    // Clear surfaces
    this.surfaces.clear();

    this.isConnected = false;
    this.log('Disconnected from state manager');
    this.emit('disconnected');
  }

  /**
   * Connect a surface generator
   */
  connectSurface(surfaceId: string, surface: SurfaceGenerator): void {
    if (this.surfaces.has(surfaceId)) {
      this.log(`Surface ${surfaceId} already connected, replacing`);
      this.disconnectSurface(surfaceId);
    }

    this.surfaces.set(surfaceId, surface);

    // Subscribe to surface events
    const handleSurfaceUpdate = (event: { message?: SurfaceUpdateMessage }) => {
      if (event.message && this.config.emitSurfaceEvents) {
        this.emitSurfaceUpdate(event.message);
      }
    };

    const handleSurfaceDelete = (event: { message?: DeleteSurfaceMessage }) => {
      if (event.message && this.config.emitSurfaceEvents) {
        this.emitSurfaceDelete(event.message);
      }
    };

    surface.on('surfaceUpdated', handleSurfaceUpdate);
    surface.on('surfaceDeleted', handleSurfaceDelete);

    // Store unsubscribe function
    this.surfaceSubscriptions.set(surfaceId, () => {
      surface.removeListener('surfaceUpdated', handleSurfaceUpdate);
      surface.removeListener('surfaceDeleted', handleSurfaceDelete);
    });

    // Initialize surface with current state
    this.initializeSurfaceFromState(surfaceId, surface);

    this.log(`Connected surface: ${surfaceId}`);
    this.emit('surfaceConnected', { surfaceId });
  }

  /**
   * Disconnect a surface generator
   */
  disconnectSurface(surfaceId: string): void {
    const unsubscribe = this.surfaceSubscriptions.get(surfaceId);
    if (unsubscribe) {
      unsubscribe();
      this.surfaceSubscriptions.delete(surfaceId);
    }

    this.surfaces.delete(surfaceId);
    this.log(`Disconnected surface: ${surfaceId}`);
    this.emit('surfaceDisconnected', { surfaceId });
  }

  // ============================================================================
  // Path Mapping
  // ============================================================================

  /**
   * Map an AG-UI state path to an A2UI surface data path
   */
  mapStatePath(
    aguiPath: string,
    a2uiPath: string,
    options?: {
      surfaceId?: string;
      transform?: (value: unknown) => unknown;
      inverseTransform?: (value: unknown) => unknown;
    }
  ): void {
    const mapping: PathMapping = {
      aguiPath,
      a2uiPath,
      surfaceId: options?.surfaceId,
      transform: options?.transform,
      inverseTransform: options?.inverseTransform,
    };

    this.pathMappings.push(mapping);
    this.log(`Added path mapping: ${aguiPath} -> ${a2uiPath}`);
    this.emit('pathMapped', mapping);
  }

  /**
   * Remove a path mapping
   */
  unmapStatePath(aguiPath: string, a2uiPath?: string): void {
    this.pathMappings = this.pathMappings.filter(
      (m) => m.aguiPath !== aguiPath || (a2uiPath && m.a2uiPath !== a2uiPath)
    );
    this.log(`Removed path mapping for: ${aguiPath}`);
  }

  /**
   * Get all path mappings
   */
  getPathMappings(): readonly PathMapping[] {
    return [...this.pathMappings];
  }

  /**
   * Get mappings for a specific AG-UI path
   */
  getMappingsForPath(aguiPath: string): PathMapping[] {
    return this.pathMappings.filter(
      (m) => m.aguiPath === aguiPath || aguiPath.startsWith(m.aguiPath + '/')
    );
  }

  // ============================================================================
  // Action Mapping
  // ============================================================================

  /**
   * Map user actions to state updates
   */
  mapAction(
    actionPattern: string,
    statePath: string,
    valueExtractor: string | ((payload: Record<string, unknown>) => unknown)
  ): void {
    const mapping: ActionStateMapping = {
      actionPattern,
      statePath,
      valueExtractor,
    };

    this.actionMappings.push(mapping);
    this.log(`Added action mapping: ${actionPattern} -> ${statePath}`);
    this.emit('actionMapped', mapping);
  }

  /**
   * Remove an action mapping
   */
  unmapAction(actionPattern: string): void {
    this.actionMappings = this.actionMappings.filter(
      (m) => m.actionPattern !== actionPattern
    );
  }

  /**
   * Get all action mappings
   */
  getActionMappings(): readonly ActionStateMapping[] {
    return [...this.actionMappings];
  }

  // ============================================================================
  // State Event Handlers
  // ============================================================================

  /**
   * Handle STATE_SNAPSHOT from AG-UI
   */
  onStateSnapshot(state: Record<string, unknown>): void {
    this.log('Received state snapshot');

    // Update all connected surfaces
    for (const [surfaceId, surface] of this.surfaces) {
      this.updateSurfaceFromState(surfaceId, surface, state);
    }

    this.emit('stateSnapshot', { state });
  }

  /**
   * Handle STATE_DELTA from AG-UI
   */
  onStateDelta(delta: JsonPatchOperation[]): void {
    this.log(`Received state delta with ${delta.length} operations`);

    // Apply delta to affected surfaces
    for (const operation of delta) {
      this.applyDeltaToSurfaces(operation);
    }

    this.emit('stateDelta', { delta });
  }

  // ============================================================================
  // Surface Update Emission
  // ============================================================================

  /**
   * Emit A2UI surface update as AG-UI CUSTOM event
   */
  emitSurfaceUpdate(message: SurfaceUpdateMessage): void {
    if (!this.config.eventAdapter) {
      this.emit('surfaceUpdate', message);
      return;
    }

    this.config.eventAdapter.emitCustom('a2ui:surfaceUpdate', message);
    this.log(`Emitted surface update for: ${message.surfaceId}`);
  }

  /**
   * Emit A2UI surface delete as AG-UI CUSTOM event
   */
  emitSurfaceDelete(message: DeleteSurfaceMessage): void {
    if (!this.config.eventAdapter) {
      this.emit('surfaceDelete', message);
      return;
    }

    this.config.eventAdapter.emitCustom('a2ui:surfaceDelete', message);
    this.log(`Emitted surface delete for: ${message.surfaceId}`);
  }

  /**
   * Emit A2UI data update as AG-UI CUSTOM event
   */
  emitDataUpdate(message: DataModelUpdateMessage): void {
    if (!this.config.eventAdapter) {
      this.emit('dataUpdate', message);
      return;
    }

    this.config.eventAdapter.emitCustom('a2ui:dataUpdate', message);
    this.log(`Emitted data update for: ${message.surfaceId}`);
  }

  /**
   * Emit user action as AG-UI CUSTOM event
   */
  emitUserAction(message: UserActionMessage): void {
    if (!this.config.eventAdapter) {
      this.emit('userAction', message);
      return;
    }

    this.config.eventAdapter.emitCustom('a2ui:userAction', message);
    this.log(`Emitted user action: ${message.actionId}`);
  }

  // ============================================================================
  // User Action Handling
  // ============================================================================

  /**
   * Handle incoming user action from A2UI
   */
  handleUserAction(action: UserActionMessage): void {
    this.log(`Handling user action: ${action.actionId} from ${action.surfaceId}`);

    // Emit as AG-UI CUSTOM event
    this.emitUserAction(action);

    if (!this.config.handleUserActions) {
      return;
    }

    // Find matching action mapping
    const mapping = this.findActionMapping(action.actionId);
    if (!mapping) {
      this.log(`No mapping found for action: ${action.actionId}`);
      return;
    }

    // Extract value from action payload
    const value = this.extractActionValue(action.payload ?? {}, mapping.valueExtractor);

    // Update state
    this.config.stateManager.updatePath(mapping.statePath, value);
    this.log(`Updated state at ${mapping.statePath} from action ${action.actionId}`);

    const syncEvent: SyncEvent = {
      type: 'userAction',
      timestamp: this.config.timestampGenerator(),
      sourceId: action.actionId,
      targetId: mapping.statePath,
      path: mapping.statePath,
      value,
    };
    this.emit('sync', syncEvent);
  }

  // ============================================================================
  // State Access
  // ============================================================================

  /**
   * Get current service state
   */
  getState(): SyncServiceState {
    return {
      stateManager: this.config.stateManager,
      eventAdapter: this.config.eventAdapter,
      surfaces: new Map(this.surfaces),
      pathMappings: [...this.pathMappings],
      actionMappings: [...this.actionMappings],
      isConnected: this.isConnected,
    };
  }

  /**
   * Get connected surfaces
   */
  getSurfaces(): Map<string, SurfaceGenerator> {
    return new Map(this.surfaces);
  }

  /**
   * Get surface by ID
   */
  getSurface(surfaceId: string): SurfaceGenerator | undefined {
    return this.surfaces.get(surfaceId);
  }

  /**
   * Check if connected
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Handle state change event from StateManager
   */
  private handleStateChange(event: StateChangeEvent): void {
    if (event.type === 'snapshot' && event.state) {
      this.onStateSnapshot(event.state);
    } else if (event.type === 'delta' && event.delta) {
      this.onStateDelta(event.delta);
    }
  }

  /**
   * Handle state delta event from StateManager
   */
  private handleStateDelta(delta: JsonPatchOperation[], version: number): void {
    this.onStateDelta(delta);
  }

  /**
   * Initialize surface from current state
   */
  private initializeSurfaceFromState(surfaceId: string, surface: SurfaceGenerator): void {
    const state = this.config.stateManager.getSnapshot();
    this.updateSurfaceFromState(surfaceId, surface, state);
  }

  /**
   * Update surface from full state
   */
  private updateSurfaceFromState(
    surfaceId: string,
    surface: SurfaceGenerator,
    state: Record<string, unknown>
  ): void {
    // Find mappings for this surface
    const mappings = this.pathMappings.filter(
      (m) => !m.surfaceId || m.surfaceId === surfaceId
    );

    // Build surface data from state
    const surfaceData: Record<string, unknown> = {};

    for (const mapping of mappings) {
      const value = this.getValueAtPath(state, mapping.aguiPath);
      if (value !== undefined) {
        const transformedValue = mapping.transform ? mapping.transform(value) : value;
        this.setValueAtPath(surfaceData, mapping.a2uiPath, transformedValue);
      }
    }

    // Update surface data for all surfaces managed by this generator
    for (const sid of surface.getSurfaceIds()) {
      if (sid === surfaceId || surfaceId === '*') {
        const existingSurface = surface.getSurface(sid);
        if (existingSurface) {
          surface.setData(sid, { ...existingSurface.data, ...surfaceData });
        }
      }
    }

    this.log(`Updated surface ${surfaceId} from state`);
  }

  /**
   * Apply a single delta operation to affected surfaces
   */
  private applyDeltaToSurfaces(operation: JsonPatchOperation): void {
    const mappings = this.getMappingsForPath(operation.path);

    for (const mapping of mappings) {
      const surfaces = mapping.surfaceId
        ? this.surfaces.has(mapping.surfaceId)
          ? [[mapping.surfaceId, this.surfaces.get(mapping.surfaceId)!] as const]
          : []
        : Array.from(this.surfaces.entries());

      for (const [surfaceId, surface] of surfaces) {
        this.applyDeltaToSurface(surfaceId, surface, operation, mapping);
      }
    }
  }

  /**
   * Apply delta to a specific surface
   */
  private applyDeltaToSurface(
    surfaceId: string,
    surface: SurfaceGenerator,
    operation: JsonPatchOperation,
    mapping: PathMapping
  ): void {
    // Calculate relative path if operation path is nested under mapping path
    let targetPath = mapping.a2uiPath;
    if (operation.path.length > mapping.aguiPath.length) {
      const relativePath = operation.path.slice(mapping.aguiPath.length);
      targetPath = targetPath + relativePath;
    }

    // Transform value if needed
    const value = mapping.transform && operation.value !== undefined
      ? mapping.transform(operation.value)
      : operation.value;

    // Apply to all surfaces managed by this generator
    for (const sid of surface.getSurfaceIds()) {
      const existingSurface = surface.getSurface(sid);
      if (!existingSurface) continue;

      const newData = { ...existingSurface.data };

      switch (operation.op) {
        case 'add':
        case 'replace':
          this.setValueAtPath(newData, targetPath, value);
          break;
        case 'remove':
          this.deleteValueAtPath(newData, targetPath);
          break;
        // move and copy are less common, handle if needed
      }

      surface.setData(sid, newData);
    }

    const syncEvent: SyncEvent = {
      type: 'stateToSurface',
      timestamp: this.config.timestampGenerator(),
      sourceId: operation.path,
      targetId: surfaceId,
      path: targetPath,
      value,
    };
    this.emit('sync', syncEvent);
  }

  /**
   * Find action mapping by action ID
   */
  private findActionMapping(actionId: string): ActionStateMapping | undefined {
    return this.actionMappings.find((m) => {
      if (m.actionPattern.includes('*')) {
        const regex = new RegExp('^' + m.actionPattern.replace(/\*/g, '.*') + '$');
        return regex.test(actionId);
      }
      return m.actionPattern === actionId;
    });
  }

  /**
   * Extract value from action payload
   */
  private extractActionValue(
    payload: Record<string, unknown>,
    extractor: string | ((payload: Record<string, unknown>) => unknown)
  ): unknown {
    if (typeof extractor === 'function') {
      return extractor(payload);
    }

    // Handle nested paths like "value.nested"
    const parts = extractor.split('.');
    let value: unknown = payload;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  /**
   * Get value at JSON Pointer path
   */
  private getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
    if (path === '' || path === '/') {
      return obj;
    }

    const parts = path.split('/').filter(Boolean);
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Set value at JSON Pointer path
   */
  private setValueAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    if (path === '' || path === '/') {
      Object.assign(obj, value);
      return;
    }

    const parts = path.split('/').filter(Boolean);
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Delete value at JSON Pointer path
   */
  private deleteValueAtPath(obj: Record<string, unknown>, path: string): void {
    if (path === '' || path === '/') {
      return;
    }

    const parts = path.split('/').filter(Boolean);
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        return;
      }
      current = current[part] as Record<string, unknown>;
    }

    delete current[parts[parts.length - 1]];
  }

  /**
   * Debug logging
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[AGUISyncService] ${message}`);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new AGUISyncService instance
 */
export function createAGUISyncService(config: AGUISyncServiceConfig): AGUISyncService {
  return new AGUISyncService(config);
}
