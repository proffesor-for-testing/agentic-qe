/**
 * Surface State Bridge
 *
 * Bridges A2UI surfaces to AG-UI state by managing bound surfaces
 * and applying state changes to surface components via data bindings.
 *
 * @module adapters/a2ui/integration/surface-state-bridge
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { JsonPatchOperation } from '../../ag-ui/index.js';
import {
  SurfaceGenerator,
  createSurfaceGenerator,
  ComponentBuilder,
  createComponentBuilder,
  type SurfaceGeneratorConfig,
  type SurfaceState,
  type SurfaceUpdateMessage,
  type ComponentNode,
} from '../renderer/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Component binding to state path
 */
export interface ComponentBinding {
  /** Component ID within the surface */
  readonly componentId: string;
  /** Component property to bind */
  readonly property: string;
  /** AG-UI state path (JSON Pointer) */
  readonly statePath: string;
  /** Transform function for value conversion */
  readonly transform?: (value: unknown) => unknown;
}

/**
 * Bound surface configuration
 */
export interface BoundSurfaceConfig {
  /** Surface identifier */
  readonly surfaceId: string;
  /** Template function to build surface components */
  readonly template: (builder: ComponentBuilder) => ComponentBuilder;
  /** Component bindings to state paths */
  readonly bindings: ComponentBinding[];
  /** Initial data for the surface */
  readonly initialData?: Record<string, unknown>;
  /** Surface title */
  readonly title?: string;
  /** Catalog ID */
  readonly catalogId?: string;
}

/**
 * Surface state bridge configuration
 */
export interface SurfaceStateBridgeConfig {
  /** Custom ID generator */
  readonly idGenerator?: () => string;
  /** Custom timestamp generator */
  readonly timestampGenerator?: () => string;
  /** Surface generator config */
  readonly surfaceGeneratorConfig?: SurfaceGeneratorConfig;
  /** Enable debug logging */
  readonly debug?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<SurfaceStateBridgeConfig> = {
  idGenerator: () => uuidv4(),
  timestampGenerator: () => new Date().toISOString(),
  surfaceGeneratorConfig: {},
  debug: false,
};

/**
 * Bridge update event
 */
export interface BridgeUpdateEvent {
  readonly type: 'binding' | 'delta' | 'snapshot';
  readonly surfaceId: string;
  readonly componentId?: string;
  readonly property?: string;
  readonly statePath: string;
  readonly value?: unknown;
  readonly timestamp: string;
}

/**
 * Managed surface entry
 */
interface ManagedSurface {
  readonly surfaceId: string;
  readonly generator: SurfaceGenerator;
  readonly bindings: ComponentBinding[];
  readonly config: BoundSurfaceConfig;
}

// ============================================================================
// Surface State Bridge Implementation
// ============================================================================

/**
 * Surface State Bridge
 *
 * Manages A2UI surfaces bound to AG-UI state paths. When state changes,
 * the bridge automatically updates the bound component properties.
 */
export class SurfaceStateBridge extends EventEmitter {
  private config: Required<SurfaceStateBridgeConfig>;
  private surfaces: Map<string, ManagedSurface> = new Map();
  private pathToSurfaces: Map<string, Set<string>> = new Map();
  private currentState: Record<string, unknown> = {};

  constructor(config: SurfaceStateBridgeConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // Surface Management
  // ============================================================================

  /**
   * Create a surface bound to AG-UI state
   */
  createBoundSurface(config: BoundSurfaceConfig): SurfaceGenerator {
    const { surfaceId, template, bindings, initialData, title, catalogId } = config;

    // Check for existing surface
    if (this.surfaces.has(surfaceId)) {
      this.log(`Surface ${surfaceId} already exists, replacing`);
      this.removeSurface(surfaceId);
    }

    // Create surface generator
    const generator = createSurfaceGenerator(this.config.surfaceGeneratorConfig);

    // Create surface from template
    const builder = createComponentBuilder();
    builder.beginSurface(surfaceId);

    if (title) {
      builder.setTitle(title);
    }
    if (catalogId) {
      builder.setCatalog(catalogId);
    }

    // Apply template
    template(builder);

    // Apply builder to generator
    generator.applyBuilder(builder);

    // Set initial data
    if (initialData) {
      generator.setData(surfaceId, initialData);
    }

    // Register surface
    const managed: ManagedSurface = {
      surfaceId,
      generator,
      bindings,
      config,
    };
    this.surfaces.set(surfaceId, managed);

    // Register path mappings
    for (const binding of bindings) {
      this.registerPathMapping(binding.statePath, surfaceId);
    }

    this.log(`Created bound surface: ${surfaceId} with ${bindings.length} bindings`);
    this.emit('surfaceCreated', { surfaceId, bindings });

    // Initialize from current state
    this.initializeSurfaceFromState(surfaceId);

    return generator;
  }

  /**
   * Get surface generator by ID
   */
  getSurface(surfaceId: string): SurfaceGenerator | undefined {
    return this.surfaces.get(surfaceId)?.generator;
  }

  /**
   * Get all surfaces
   */
  getAllSurfaces(): Map<string, SurfaceGenerator> {
    const result = new Map<string, SurfaceGenerator>();
    for (const [id, managed] of this.surfaces) {
      result.set(id, managed.generator);
    }
    return result;
  }

  /**
   * Get surface IDs
   */
  getSurfaceIds(): string[] {
    return Array.from(this.surfaces.keys());
  }

  /**
   * Remove a surface
   */
  removeSurface(surfaceId: string): void {
    const managed = this.surfaces.get(surfaceId);
    if (!managed) {
      return;
    }

    // Unregister path mappings
    for (const binding of managed.bindings) {
      this.unregisterPathMapping(binding.statePath, surfaceId);
    }

    // Remove surface from generator
    managed.generator.deleteSurface(surfaceId);

    this.surfaces.delete(surfaceId);
    this.log(`Removed surface: ${surfaceId}`);
    this.emit('surfaceRemoved', { surfaceId });
  }

  /**
   * Get bindings for a surface
   */
  getBindings(surfaceId: string): readonly ComponentBinding[] {
    const managed = this.surfaces.get(surfaceId);
    return managed ? [...managed.bindings] : [];
  }

  /**
   * Add binding to existing surface
   */
  addBinding(surfaceId: string, binding: ComponentBinding): void {
    const managed = this.surfaces.get(surfaceId);
    if (!managed) {
      throw new Error(`Surface ${surfaceId} not found`);
    }

    // Add to bindings array (create new array to maintain immutability intent)
    const newManaged: ManagedSurface = {
      ...managed,
      bindings: [...managed.bindings, binding],
    };
    this.surfaces.set(surfaceId, newManaged);

    // Register path mapping
    this.registerPathMapping(binding.statePath, surfaceId);

    // Apply current state value to binding
    const value = this.getValueAtPath(this.currentState, binding.statePath);
    if (value !== undefined) {
      this.applyBindingUpdate(surfaceId, binding, value);
    }

    this.log(`Added binding to ${surfaceId}: ${binding.componentId}.${binding.property} -> ${binding.statePath}`);
    this.emit('bindingAdded', { surfaceId, binding });
  }

  /**
   * Remove binding from surface
   */
  removeBinding(surfaceId: string, componentId: string, property: string): void {
    const managed = this.surfaces.get(surfaceId);
    if (!managed) {
      return;
    }

    const bindingIndex = managed.bindings.findIndex(
      (b) => b.componentId === componentId && b.property === property
    );

    if (bindingIndex === -1) {
      return;
    }

    const binding = managed.bindings[bindingIndex];

    // Remove from bindings array
    const newBindings = [...managed.bindings];
    newBindings.splice(bindingIndex, 1);
    const newManaged: ManagedSurface = { ...managed, bindings: newBindings };
    this.surfaces.set(surfaceId, newManaged);

    // Unregister path mapping if no other bindings use it
    const hasOtherBindings = newBindings.some((b) => b.statePath === binding.statePath);
    if (!hasOtherBindings) {
      this.unregisterPathMapping(binding.statePath, surfaceId);
    }

    this.log(`Removed binding from ${surfaceId}: ${componentId}.${property}`);
    this.emit('bindingRemoved', { surfaceId, componentId, property });
  }

  // ============================================================================
  // State Updates
  // ============================================================================

  /**
   * Update all surfaces from full state snapshot
   */
  updateFromState(state: Record<string, unknown>): void {
    this.currentState = state;

    for (const [surfaceId, managed] of this.surfaces) {
      for (const binding of managed.bindings) {
        const value = this.getValueAtPath(state, binding.statePath);
        if (value !== undefined) {
          this.applyBindingUpdate(surfaceId, binding, value);
        }
      }
    }

    this.log(`Updated all surfaces from state snapshot`);
    this.emit('stateUpdated', { state });
  }

  /**
   * Apply JSON Patch delta to surfaces
   */
  applyDelta(delta: JsonPatchOperation[]): void {
    for (const operation of delta) {
      // Update internal state
      this.applyOperationToState(operation);

      // Find affected surfaces
      const affectedSurfaces = this.getSurfacesForPath(operation.path);

      for (const surfaceId of affectedSurfaces) {
        const managed = this.surfaces.get(surfaceId);
        if (!managed) continue;

        // Find bindings affected by this path
        const affectedBindings = this.getBindingsForPath(managed.bindings, operation.path);

        for (const binding of affectedBindings) {
          const value = operation.op === 'remove'
            ? undefined
            : this.resolveValueForBinding(operation, binding);

          this.applyBindingUpdate(surfaceId, binding, value);

          const event: BridgeUpdateEvent = {
            type: 'delta',
            surfaceId,
            componentId: binding.componentId,
            property: binding.property,
            statePath: binding.statePath,
            value,
            timestamp: this.config.timestampGenerator(),
          };
          this.emit('bridgeUpdate', event);
        }
      }
    }

    this.log(`Applied delta with ${delta.length} operations`);
  }

  /**
   * Get surfaces affected by a state path
   */
  getSurfacesForPath(path: string): string[] {
    const result = new Set<string>();

    // Check exact path
    const exact = this.pathToSurfaces.get(path);
    if (exact) {
      for (const id of exact) {
        result.add(id);
      }
    }

    // Check parent paths (e.g., /a/b affects bindings to /a/b/c)
    for (const [registeredPath, surfaces] of this.pathToSurfaces) {
      if (path.startsWith(registeredPath + '/') || registeredPath.startsWith(path + '/')) {
        for (const id of surfaces) {
          result.add(id);
        }
      }
    }

    return Array.from(result);
  }

  /**
   * Get current state
   */
  getCurrentState(): Record<string, unknown> {
    return { ...this.currentState };
  }

  // ============================================================================
  // Surface Generation
  // ============================================================================

  /**
   * Generate surface update message for a surface
   */
  generateSurfaceUpdate(surfaceId: string): SurfaceUpdateMessage | null {
    const managed = this.surfaces.get(surfaceId);
    return managed?.generator.generateSurfaceUpdate(surfaceId) ?? null;
  }

  /**
   * Get all messages for a surface (beginRendering + surfaceUpdate + dataModelUpdate)
   */
  getAllMessages(surfaceId: string): ReturnType<SurfaceGenerator['getAllMessages']> {
    const managed = this.surfaces.get(surfaceId);
    return managed?.generator.getAllMessages(surfaceId) ?? null;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get bridge statistics
   */
  getStats(): {
    surfaceCount: number;
    totalBindings: number;
    pathMappingCount: number;
    averageBindingsPerSurface: number;
  } {
    let totalBindings = 0;
    for (const managed of this.surfaces.values()) {
      totalBindings += managed.bindings.length;
    }

    return {
      surfaceCount: this.surfaces.size,
      totalBindings,
      pathMappingCount: this.pathToSurfaces.size,
      averageBindingsPerSurface:
        this.surfaces.size > 0 ? totalBindings / this.surfaces.size : 0,
    };
  }

  /**
   * Clear all surfaces
   */
  clear(): void {
    const surfaceIds = this.getSurfaceIds();
    for (const id of surfaceIds) {
      this.removeSurface(id);
    }
    this.currentState = {};
    this.pathToSurfaces.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Register a path to surface mapping
   */
  private registerPathMapping(path: string, surfaceId: string): void {
    let surfaces = this.pathToSurfaces.get(path);
    if (!surfaces) {
      surfaces = new Set();
      this.pathToSurfaces.set(path, surfaces);
    }
    surfaces.add(surfaceId);
  }

  /**
   * Unregister a path to surface mapping
   */
  private unregisterPathMapping(path: string, surfaceId: string): void {
    const surfaces = this.pathToSurfaces.get(path);
    if (surfaces) {
      surfaces.delete(surfaceId);
      if (surfaces.size === 0) {
        this.pathToSurfaces.delete(path);
      }
    }
  }

  /**
   * Initialize surface from current state
   */
  private initializeSurfaceFromState(surfaceId: string): void {
    const managed = this.surfaces.get(surfaceId);
    if (!managed) return;

    for (const binding of managed.bindings) {
      const value = this.getValueAtPath(this.currentState, binding.statePath);
      if (value !== undefined) {
        this.applyBindingUpdate(surfaceId, binding, value);
      }
    }
  }

  /**
   * Apply binding update to surface component
   */
  private applyBindingUpdate(
    surfaceId: string,
    binding: ComponentBinding,
    value: unknown
  ): void {
    const managed = this.surfaces.get(surfaceId);
    if (!managed) return;

    // Transform value if needed
    const transformedValue = binding.transform ? binding.transform(value) : value;

    // Get component from generator
    const component = managed.generator.getComponent(surfaceId, binding.componentId);
    if (!component) {
      this.log(`Component ${binding.componentId} not found in surface ${surfaceId}`);
      return;
    }

    // Update component property
    const updates: Partial<ComponentNode> = {
      properties: {
        ...component.properties,
        [binding.property]: transformedValue,
      },
    };

    managed.generator.updateComponent(surfaceId, binding.componentId, updates);

    // Also update surface data
    const surfaceState = managed.generator.getSurface(surfaceId);
    if (surfaceState) {
      const newData = { ...surfaceState.data };
      this.setValueAtPath(newData, binding.statePath, transformedValue);
      managed.generator.setData(surfaceId, newData);
    }

    this.log(`Updated ${surfaceId}/${binding.componentId}.${binding.property}`);
  }

  /**
   * Get bindings affected by a path change
   */
  private getBindingsForPath(
    bindings: readonly ComponentBinding[],
    path: string
  ): ComponentBinding[] {
    return bindings.filter((b) => {
      // Exact match
      if (b.statePath === path) return true;
      // Path is parent of binding path (e.g., /a affects /a/b)
      if (b.statePath.startsWith(path + '/')) return true;
      // Binding path is parent of changed path (e.g., binding to /a is affected by /a/b change)
      if (path.startsWith(b.statePath + '/')) return true;
      return false;
    });
  }

  /**
   * Resolve value for a binding from an operation
   */
  private resolveValueForBinding(
    operation: JsonPatchOperation,
    binding: ComponentBinding
  ): unknown {
    if (operation.path === binding.statePath) {
      return operation.value;
    }

    // If operation is on a child path, get the full value from state
    if (operation.path.startsWith(binding.statePath + '/')) {
      return this.getValueAtPath(this.currentState, binding.statePath);
    }

    // If operation is on a parent path, extract the relevant portion
    if (binding.statePath.startsWith(operation.path + '/')) {
      const relativePath = binding.statePath.slice(operation.path.length);
      return this.getValueAtPath(operation.value as Record<string, unknown>, relativePath);
    }

    return operation.value;
  }

  /**
   * Apply operation to internal state
   */
  private applyOperationToState(operation: JsonPatchOperation): void {
    switch (operation.op) {
      case 'add':
      case 'replace':
        this.setValueAtPath(this.currentState, operation.path, operation.value);
        break;
      case 'remove':
        this.deleteValueAtPath(this.currentState, operation.path);
        break;
      case 'move':
        if (operation.from) {
          const value = this.getValueAtPath(this.currentState, operation.from);
          this.deleteValueAtPath(this.currentState, operation.from);
          this.setValueAtPath(this.currentState, operation.path, value);
        }
        break;
      case 'copy':
        if (operation.from) {
          const value = this.getValueAtPath(this.currentState, operation.from);
          this.setValueAtPath(this.currentState, operation.path, value);
        }
        break;
    }
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
      if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
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
      console.log(`[SurfaceStateBridge] ${message}`);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new SurfaceStateBridge instance
 */
export function createSurfaceStateBridge(
  config?: SurfaceStateBridgeConfig
): SurfaceStateBridge {
  return new SurfaceStateBridge(config);
}

// ============================================================================
// Convenience Builder
// ============================================================================

/**
 * Create a bound surface configuration
 */
export function boundSurface(
  surfaceId: string,
  template: (builder: ComponentBuilder) => ComponentBuilder,
  bindings: ComponentBinding[],
  options?: {
    initialData?: Record<string, unknown>;
    title?: string;
    catalogId?: string;
  }
): BoundSurfaceConfig {
  return {
    surfaceId,
    template,
    bindings,
    initialData: options?.initialData,
    title: options?.title,
    catalogId: options?.catalogId,
  };
}

/**
 * Create a component binding
 */
export function binding(
  componentId: string,
  property: string,
  statePath: string,
  transform?: (value: unknown) => unknown
): ComponentBinding {
  return { componentId, property, statePath, transform };
}
