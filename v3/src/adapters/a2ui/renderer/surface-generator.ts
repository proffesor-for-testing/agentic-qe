/**
 * A2UI Surface Generator
 *
 * Generates A2UI surfaces with unique IDs, version tracking, and
 * incremental updates. Manages component trees as flat adjacency lists.
 *
 * @module adapters/a2ui/renderer/surface-generator
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type {
  ComponentNode,
  SurfaceUpdateMessage,
  DataModelUpdateMessage,
  BeginRenderingMessage,
  DeleteSurfaceMessage,
  UserActionMessage,
  A2UIServerMessage,
} from './message-types.js';
import { ComponentBuilder, createComponentBuilder } from './component-builder.js';

// ============================================================================
// Surface State Types
// ============================================================================

/**
 * Surface state representation
 */
export interface SurfaceState {
  /** Surface identifier */
  id: string;
  /** Current version for optimistic updates */
  version: number;
  /** Component map (id -> component) */
  components: Map<string, ComponentNode>;
  /** Root component ID */
  rootComponentId: string | null;
  /** Surface title */
  title: string | null;
  /** Catalog ID */
  catalogId: string | null;
  /** Data model */
  data: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Is surface currently rendered */
  isRendered: boolean;
}

/**
 * Surface generator configuration
 */
export interface SurfaceGeneratorConfig {
  /** Custom ID generator */
  idGenerator?: () => string;
  /** Custom timestamp generator */
  timestampGenerator?: () => string;
  /** Default catalog ID */
  defaultCatalogId?: string;
  /** Emit events on changes */
  emitEvents?: boolean;
  /** Maximum surfaces to track */
  maxSurfaces?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<SurfaceGeneratorConfig> = {
  idGenerator: () => uuidv4(),
  timestampGenerator: () => new Date().toISOString(),
  defaultCatalogId: 'standard-v1',
  emitEvents: true,
  maxSurfaces: 100,
};

/**
 * Surface change event
 */
export interface SurfaceChangeEvent {
  type: 'created' | 'updated' | 'deleted' | 'rendered';
  surfaceId: string;
  timestamp: string;
  message?: A2UIServerMessage;
}

// ============================================================================
// Surface Generator Class
// ============================================================================

/**
 * A2UI Surface Generator
 *
 * Manages surface lifecycle, component trees, and message generation
 * for the A2UI protocol.
 */
export class SurfaceGenerator extends EventEmitter {
  private config: Required<SurfaceGeneratorConfig>;
  private surfaces: Map<string, SurfaceState> = new Map();

  constructor(config: SurfaceGeneratorConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // Surface Lifecycle
  // ============================================================================

  /**
   * Create a new surface
   */
  createSurface(
    surfaceId?: string,
    options?: {
      title?: string;
      catalogId?: string;
      rootComponentId?: string;
    }
  ): SurfaceState {
    const id = surfaceId || this.config.idGenerator();
    const timestamp = this.config.timestampGenerator();

    // Check max surfaces limit
    if (this.surfaces.size >= this.config.maxSurfaces) {
      throw new Error(
        `Maximum surfaces limit (${this.config.maxSurfaces}) reached`
      );
    }

    const surface: SurfaceState = {
      id,
      version: 1,
      components: new Map(),
      rootComponentId: options?.rootComponentId || null,
      title: options?.title || null,
      catalogId: options?.catalogId || this.config.defaultCatalogId,
      data: {},
      createdAt: timestamp,
      updatedAt: timestamp,
      isRendered: false,
    };

    this.surfaces.set(id, surface);

    if (this.config.emitEvents) {
      const event: SurfaceChangeEvent = {
        type: 'created',
        surfaceId: id,
        timestamp,
      };
      this.emit('surfaceCreated', event);
    }

    return surface;
  }

  /**
   * Get a surface by ID
   */
  getSurface(surfaceId: string): SurfaceState | undefined {
    return this.surfaces.get(surfaceId);
  }

  /**
   * Check if surface exists
   */
  hasSurface(surfaceId: string): boolean {
    return this.surfaces.has(surfaceId);
  }

  /**
   * Get all surface IDs
   */
  getSurfaceIds(): string[] {
    return Array.from(this.surfaces.keys());
  }

  /**
   * Get surface count
   */
  getSurfaceCount(): number {
    return this.surfaces.size;
  }

  /**
   * Delete a surface
   */
  deleteSurface(surfaceId: string): DeleteSurfaceMessage | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    this.surfaces.delete(surfaceId);

    const message: DeleteSurfaceMessage = {
      type: 'deleteSurface',
      surfaceId,
    };

    if (this.config.emitEvents) {
      const event: SurfaceChangeEvent = {
        type: 'deleted',
        surfaceId,
        timestamp: this.config.timestampGenerator(),
        message,
      };
      this.emit('surfaceDeleted', event);
    }

    return message;
  }

  // ============================================================================
  // Component Management
  // ============================================================================

  /**
   * Add a component to a surface
   */
  addComponent(
    surfaceId: string,
    component: ComponentNode
  ): SurfaceUpdateMessage | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    surface.components.set(component.id, component);
    surface.version++;
    surface.updatedAt = this.config.timestampGenerator();

    // Set as root if first component
    if (surface.components.size === 1 && !surface.rootComponentId) {
      surface.rootComponentId = component.id;
    }

    return this.generateSurfaceUpdate(surfaceId);
  }

  /**
   * Add multiple components at once
   */
  addComponents(
    surfaceId: string,
    components: ComponentNode[]
  ): SurfaceUpdateMessage | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    for (const component of components) {
      surface.components.set(component.id, component);
    }

    // Set first component as root if none set
    if (components.length > 0 && !surface.rootComponentId) {
      surface.rootComponentId = components[0].id;
    }

    surface.version++;
    surface.updatedAt = this.config.timestampGenerator();

    return this.generateSurfaceUpdate(surfaceId);
  }

  /**
   * Update a component
   */
  updateComponent(
    surfaceId: string,
    componentId: string,
    updates: Partial<Omit<ComponentNode, 'id'>>
  ): SurfaceUpdateMessage | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    const component = surface.components.get(componentId);
    if (!component) {
      return null;
    }

    // Merge updates
    if (updates.type !== undefined) {
      component.type = updates.type;
    }
    if (updates.properties !== undefined) {
      component.properties = { ...component.properties, ...updates.properties };
    }
    if (updates.children !== undefined) {
      component.children = updates.children;
    }

    surface.version++;
    surface.updatedAt = this.config.timestampGenerator();

    return this.generateSurfaceUpdate(surfaceId);
  }

  /**
   * Remove a component
   */
  removeComponent(
    surfaceId: string,
    componentId: string
  ): SurfaceUpdateMessage | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    surface.components.delete(componentId);

    // Remove from parent children lists
    for (const component of surface.components.values()) {
      if (component.children) {
        const index = component.children.indexOf(componentId);
        if (index !== -1) {
          component.children.splice(index, 1);
        }
      }
    }

    surface.version++;
    surface.updatedAt = this.config.timestampGenerator();

    return this.generateSurfaceUpdate(surfaceId);
  }

  /**
   * Get a component from a surface
   */
  getComponent(
    surfaceId: string,
    componentId: string
  ): ComponentNode | undefined {
    const surface = this.surfaces.get(surfaceId);
    return surface?.components.get(componentId);
  }

  /**
   * Get all components from a surface
   */
  getComponents(surfaceId: string): ComponentNode[] {
    const surface = this.surfaces.get(surfaceId);
    return surface ? Array.from(surface.components.values()) : [];
  }

  // ============================================================================
  // Hierarchy Management
  // ============================================================================

  /**
   * Add a child to a parent component
   */
  addChild(
    surfaceId: string,
    parentId: string,
    childId: string
  ): SurfaceUpdateMessage | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    const parent = surface.components.get(parentId);
    if (!parent) {
      return null;
    }

    if (!parent.children) {
      parent.children = [];
    }

    if (!parent.children.includes(childId)) {
      parent.children.push(childId);
      surface.version++;
      surface.updatedAt = this.config.timestampGenerator();
    }

    return this.generateSurfaceUpdate(surfaceId);
  }

  /**
   * Remove a child from a parent component
   */
  removeChild(
    surfaceId: string,
    parentId: string,
    childId: string
  ): SurfaceUpdateMessage | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    const parent = surface.components.get(parentId);
    if (!parent || !parent.children) {
      return null;
    }

    const index = parent.children.indexOf(childId);
    if (index !== -1) {
      parent.children.splice(index, 1);
      surface.version++;
      surface.updatedAt = this.config.timestampGenerator();
    }

    return this.generateSurfaceUpdate(surfaceId);
  }

  /**
   * Set children for a component
   */
  setChildren(
    surfaceId: string,
    parentId: string,
    childIds: string[]
  ): SurfaceUpdateMessage | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    const parent = surface.components.get(parentId);
    if (!parent) {
      return null;
    }

    parent.children = [...childIds];
    surface.version++;
    surface.updatedAt = this.config.timestampGenerator();

    return this.generateSurfaceUpdate(surfaceId);
  }

  // ============================================================================
  // Data Model Management
  // ============================================================================

  /**
   * Update surface data model
   */
  updateData(
    surfaceId: string,
    data: Record<string, unknown>
  ): DataModelUpdateMessage | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    surface.data = { ...surface.data, ...data };
    surface.updatedAt = this.config.timestampGenerator();

    return this.generateDataModelUpdate(surfaceId, data);
  }

  /**
   * Set surface data model (replace)
   */
  setData(
    surfaceId: string,
    data: Record<string, unknown>
  ): DataModelUpdateMessage | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    surface.data = { ...data };
    surface.updatedAt = this.config.timestampGenerator();

    return this.generateDataModelUpdate(surfaceId, data);
  }

  /**
   * Get surface data model
   */
  getData(surfaceId: string): Record<string, unknown> | undefined {
    const surface = this.surfaces.get(surfaceId);
    return surface?.data;
  }

  // ============================================================================
  // Message Generation
  // ============================================================================

  /**
   * Generate surfaceUpdate message
   */
  generateSurfaceUpdate(surfaceId: string): SurfaceUpdateMessage | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    const message: SurfaceUpdateMessage = {
      type: 'surfaceUpdate',
      surfaceId: surface.id,
      version: surface.version,
      components: Array.from(surface.components.values()),
    };

    if (this.config.emitEvents) {
      const event: SurfaceChangeEvent = {
        type: 'updated',
        surfaceId: surface.id,
        timestamp: surface.updatedAt,
        message,
      };
      this.emit('surfaceUpdated', event);
    }

    return message;
  }

  /**
   * Generate incremental surfaceUpdate with specific components
   */
  generateIncrementalUpdate(
    surfaceId: string,
    componentIds: string[]
  ): SurfaceUpdateMessage | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    const components: ComponentNode[] = [];
    for (const id of componentIds) {
      const component = surface.components.get(id);
      if (component) {
        components.push(component);
      }
    }

    return {
      type: 'surfaceUpdate',
      surfaceId: surface.id,
      version: surface.version,
      components,
    };
  }

  /**
   * Generate dataModelUpdate message
   */
  generateDataModelUpdate(
    surfaceId: string,
    data?: Record<string, unknown>
  ): DataModelUpdateMessage | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    return {
      type: 'dataModelUpdate',
      surfaceId: surface.id,
      data: data || surface.data,
    };
  }

  /**
   * Generate beginRendering message
   */
  generateBeginRendering(surfaceId: string): BeginRenderingMessage | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    surface.isRendered = true;

    const message: BeginRenderingMessage = {
      type: 'beginRendering',
      surfaceId: surface.id,
    };

    if (surface.title) {
      message.title = surface.title;
    }

    if (surface.rootComponentId) {
      message.rootComponentId = surface.rootComponentId;
    }

    if (surface.catalogId) {
      message.catalogId = surface.catalogId;
    }

    if (this.config.emitEvents) {
      const event: SurfaceChangeEvent = {
        type: 'rendered',
        surfaceId: surface.id,
        timestamp: this.config.timestampGenerator(),
        message,
      };
      this.emit('surfaceRendered', event);
    }

    return message;
  }

  /**
   * Generate deleteSurface message
   */
  generateDeleteSurface(surfaceId: string): DeleteSurfaceMessage | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    return {
      type: 'deleteSurface',
      surfaceId: surface.id,
    };
  }

  // ============================================================================
  // User Action Handling
  // ============================================================================

  /**
   * Create a userAction response message
   */
  createUserAction(
    surfaceId: string,
    componentId: string,
    actionId: string,
    payload?: Record<string, unknown>
  ): UserActionMessage {
    return {
      type: 'userAction',
      surfaceId,
      componentId,
      actionId,
      payload,
      timestamp: this.config.timestampGenerator(),
    };
  }

  /**
   * Handle incoming user action
   */
  handleUserAction(
    action: UserActionMessage,
    handler: (action: UserActionMessage) => void | Promise<void>
  ): void {
    const surface = this.surfaces.get(action.surfaceId);
    if (!surface) {
      throw new Error(`Surface ${action.surfaceId} not found`);
    }

    const component = surface.components.get(action.componentId);
    if (!component) {
      throw new Error(
        `Component ${action.componentId} not found in surface ${action.surfaceId}`
      );
    }

    handler(action);
  }

  // ============================================================================
  // Builder Integration
  // ============================================================================

  /**
   * Apply a builder's surface to this generator
   */
  applyBuilder(builder: ComponentBuilder): SurfaceUpdateMessage | null {
    const surfaceUpdate = builder.build();
    const beginRendering = builder.buildBeginRendering();

    let surface = this.getSurface(surfaceUpdate.surfaceId);

    if (!surface) {
      // Create new surface with metadata from builder
      surface = this.createSurface(surfaceUpdate.surfaceId, {
        title: beginRendering.title,
        catalogId: beginRendering.catalogId,
        rootComponentId: beginRendering.rootComponentId,
      });
    } else {
      // Update existing surface metadata
      if (beginRendering.title) {
        surface.title = beginRendering.title;
      }
      if (beginRendering.catalogId) {
        surface.catalogId = beginRendering.catalogId;
      }
      if (beginRendering.rootComponentId) {
        surface.rootComponentId = beginRendering.rootComponentId;
      }
    }

    // Add all components
    return this.addComponents(surfaceUpdate.surfaceId, surfaceUpdate.components);
  }

  /**
   * Create a builder for a surface
   */
  createBuilder(surfaceId?: string): ComponentBuilder {
    const id = surfaceId || this.config.idGenerator();
    const builder = createComponentBuilder();
    builder.beginSurface(id);

    // Pre-populate if surface exists
    const surface = this.surfaces.get(id);
    if (surface) {
      builder.setVersion(surface.version);
      if (surface.title) {
        builder.setTitle(surface.title);
      }
      if (surface.catalogId) {
        builder.setCatalog(surface.catalogId);
      }
      if (surface.rootComponentId) {
        builder.setRoot(surface.rootComponentId);
      }

      // Add existing components
      for (const component of surface.components.values()) {
        builder.addComponent(component.id, {
          type: component.type,
          ...component.properties,
        });
        if (component.children) {
          builder.setChildren(component.id, component.children);
        }
      }
    }

    return builder;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get all messages for a complete surface render
   */
  getAllMessages(surfaceId: string): {
    beginRendering: BeginRenderingMessage;
    surfaceUpdate: SurfaceUpdateMessage;
    dataModelUpdate: DataModelUpdateMessage;
  } | null {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      return null;
    }

    const beginRendering = this.generateBeginRendering(surfaceId);
    const surfaceUpdate = this.generateSurfaceUpdate(surfaceId);
    const dataModelUpdate = this.generateDataModelUpdate(surfaceId);

    if (!beginRendering || !surfaceUpdate || !dataModelUpdate) {
      return null;
    }

    return {
      beginRendering,
      surfaceUpdate,
      dataModelUpdate,
    };
  }

  /**
   * Clear all surfaces
   */
  clear(): void {
    const surfaceIds = this.getSurfaceIds();
    for (const id of surfaceIds) {
      this.deleteSurface(id);
    }
  }

  /**
   * Get generator statistics
   */
  getStats(): {
    surfaceCount: number;
    totalComponents: number;
    averageComponentsPerSurface: number;
    renderedSurfaces: number;
  } {
    let totalComponents = 0;
    let renderedSurfaces = 0;

    for (const surface of this.surfaces.values()) {
      totalComponents += surface.components.size;
      if (surface.isRendered) {
        renderedSurfaces++;
      }
    }

    return {
      surfaceCount: this.surfaces.size,
      totalComponents,
      averageComponentsPerSurface:
        this.surfaces.size > 0 ? totalComponents / this.surfaces.size : 0,
      renderedSurfaces,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new SurfaceGenerator instance
 */
export function createSurfaceGenerator(
  config?: SurfaceGeneratorConfig
): SurfaceGenerator {
  return new SurfaceGenerator(config);
}

// ============================================================================
// Export Types
// ============================================================================

export type {
  ComponentNode,
  SurfaceUpdateMessage,
  DataModelUpdateMessage,
  BeginRenderingMessage,
  DeleteSurfaceMessage,
  UserActionMessage,
  A2UIServerMessage,
};
