/**
 * A2UI Component Builder
 *
 * Fluent API for building A2UI component trees with flat adjacency list structure.
 * Supports incremental updates, version tracking, and parent-child relationships.
 *
 * @module adapters/a2ui/renderer/component-builder
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ComponentNode,
  SurfaceUpdateMessage,
  DataModelUpdateMessage,
  BeginRenderingMessage,
  DeleteSurfaceMessage,
  UserActionMessage,
  BoundValue,
  ComponentChildren,
  A2UIAccessibility,
  ExplicitList,
  TemplateChildren,
} from './message-types.js';
import {
  literal,
  path,
  children,
  isExplicitList,
} from './message-types.js';

// ============================================================================
// Builder Configuration
// ============================================================================

/**
 * Component builder configuration
 */
export interface ComponentBuilderConfig {
  /** Custom ID generator */
  idGenerator?: () => string;
  /** Whether to auto-generate component IDs */
  autoGenerateIds?: boolean;
  /** Default accessibility attributes */
  defaultAccessibility?: Partial<A2UIAccessibility>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<ComponentBuilderConfig> = {
  idGenerator: () => uuidv4(),
  autoGenerateIds: false,
  defaultAccessibility: {},
};

// ============================================================================
// Component Properties Builder
// ============================================================================

/**
 * Properties builder for individual components
 */
export interface ComponentPropertiesBuilder {
  [key: string]: unknown;
}

// ============================================================================
// Component Builder Class
// ============================================================================

/**
 * Fluent builder for A2UI surfaces and component trees
 */
export class ComponentBuilder {
  private config: Required<ComponentBuilderConfig>;
  private surfaceId: string = '';
  private version: number = 1;
  private components: Map<string, ComponentNode> = new Map();
  private rootComponentId: string | null = null;
  private title: string | null = null;
  private catalogId: string | null = null;

  constructor(config: ComponentBuilderConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // Surface Lifecycle
  // ============================================================================

  /**
   * Begin a new surface
   */
  beginSurface(surfaceId: string): this {
    this.surfaceId = surfaceId;
    this.components.clear();
    this.rootComponentId = null;
    this.title = null;
    this.version = 1;
    return this;
  }

  /**
   * Set surface title
   */
  setTitle(title: string): this {
    this.title = title;
    return this;
  }

  /**
   * Set catalog ID
   */
  setCatalog(catalogId: string): this {
    this.catalogId = catalogId;
    return this;
  }

  /**
   * Set surface version
   */
  setVersion(version: number): this {
    this.version = version;
    return this;
  }

  /**
   * Increment version
   */
  incrementVersion(): this {
    this.version++;
    return this;
  }

  /**
   * Set root component
   */
  setRoot(componentId: string): this {
    this.rootComponentId = componentId;
    return this;
  }

  // ============================================================================
  // Component Management
  // ============================================================================

  /**
   * Add a component to the surface
   */
  addComponent(
    id: string,
    properties: {
      type: string;
      [key: string]: unknown;
    }
  ): this {
    const { type, ...props } = properties;

    const node: ComponentNode = {
      id,
      type,
      properties: props,
    };

    // Set as root if first component
    if (this.components.size === 0 && !this.rootComponentId) {
      this.rootComponentId = id;
    }

    this.components.set(id, node);
    return this;
  }

  /**
   * Add a child component under a parent
   */
  addChild(
    parentId: string,
    childId: string,
    properties: {
      type: string;
      [key: string]: unknown;
    }
  ): this {
    // Add the child component first
    this.addComponent(childId, properties);

    // Update parent's children list
    const parent = this.components.get(parentId);
    if (parent) {
      if (!parent.children) {
        parent.children = [];
      }
      if (!parent.children.includes(childId)) {
        parent.children.push(childId);
      }
    }

    return this;
  }

  /**
   * Add multiple children at once
   */
  addChildren(
    parentId: string,
    childrenComponents: Array<{
      id: string;
      type: string;
      [key: string]: unknown;
    }>
  ): this {
    for (const child of childrenComponents) {
      const { id, ...props } = child;
      this.addChild(parentId, id, props as { type: string; [key: string]: unknown });
    }
    return this;
  }

  /**
   * Update an existing component's properties
   */
  updateComponent(
    id: string,
    properties: Record<string, unknown>
  ): this {
    const component = this.components.get(id);
    if (component) {
      component.properties = {
        ...component.properties,
        ...properties,
      };
    }
    return this;
  }

  /**
   * Remove a component
   */
  removeComponent(id: string): this {
    this.components.delete(id);

    // Remove from parent's children lists
    for (const component of this.components.values()) {
      if (component.children) {
        const index = component.children.indexOf(id);
        if (index !== -1) {
          component.children.splice(index, 1);
        }
      }
    }

    return this;
  }

  /**
   * Get a component by ID
   */
  getComponent(id: string): ComponentNode | undefined {
    return this.components.get(id);
  }

  /**
   * Check if component exists
   */
  hasComponent(id: string): boolean {
    return this.components.has(id);
  }

  /**
   * Get all component IDs
   */
  getComponentIds(): string[] {
    return Array.from(this.components.keys());
  }

  /**
   * Get component count
   */
  getComponentCount(): number {
    return this.components.size;
  }

  // ============================================================================
  // Hierarchy Management
  // ============================================================================

  /**
   * Set explicit children for a component
   */
  setChildren(parentId: string, childIds: string[]): this {
    const parent = this.components.get(parentId);
    if (parent) {
      parent.children = [...childIds];
    }
    return this;
  }

  /**
   * Append children to existing list
   */
  appendChildren(parentId: string, childIds: string[]): this {
    const parent = this.components.get(parentId);
    if (parent) {
      if (!parent.children) {
        parent.children = [];
      }
      for (const childId of childIds) {
        if (!parent.children.includes(childId)) {
          parent.children.push(childId);
        }
      }
    }
    return this;
  }

  /**
   * Remove a child from a parent
   */
  removeChild(parentId: string, childId: string): this {
    const parent = this.components.get(parentId);
    if (parent && parent.children) {
      const index = parent.children.indexOf(childId);
      if (index !== -1) {
        parent.children.splice(index, 1);
      }
    }
    return this;
  }

  /**
   * Move a component to a new parent
   */
  moveComponent(componentId: string, newParentId: string): this {
    // Remove from all current parents
    for (const component of this.components.values()) {
      if (component.children) {
        const index = component.children.indexOf(componentId);
        if (index !== -1) {
          component.children.splice(index, 1);
        }
      }
    }

    // Add to new parent
    const newParent = this.components.get(newParentId);
    if (newParent) {
      if (!newParent.children) {
        newParent.children = [];
      }
      newParent.children.push(componentId);
    }

    return this;
  }

  /**
   * Get children of a component
   */
  getChildren(parentId: string): string[] {
    const parent = this.components.get(parentId);
    return parent?.children ? [...parent.children] : [];
  }

  /**
   * Find parent of a component
   */
  getParent(componentId: string): string | null {
    for (const [id, component] of this.components.entries()) {
      if (component.children?.includes(componentId)) {
        return id;
      }
    }
    return null;
  }

  // ============================================================================
  // Build Methods
  // ============================================================================

  /**
   * Build the surfaceUpdate message
   */
  build(): SurfaceUpdateMessage {
    if (!this.surfaceId) {
      throw new Error('Surface ID is required. Call beginSurface() first.');
    }

    return {
      type: 'surfaceUpdate',
      surfaceId: this.surfaceId,
      version: this.version,
      components: Array.from(this.components.values()),
    };
  }

  /**
   * Build beginRendering message
   */
  buildBeginRendering(): BeginRenderingMessage {
    if (!this.surfaceId) {
      throw new Error('Surface ID is required. Call beginSurface() first.');
    }

    const message: BeginRenderingMessage = {
      type: 'beginRendering',
      surfaceId: this.surfaceId,
    };

    if (this.title) {
      message.title = this.title;
    }

    if (this.rootComponentId) {
      message.rootComponentId = this.rootComponentId;
    }

    if (this.catalogId) {
      message.catalogId = this.catalogId;
    }

    return message;
  }

  /**
   * Build deleteSurface message
   */
  buildDeleteSurface(): DeleteSurfaceMessage {
    if (!this.surfaceId) {
      throw new Error('Surface ID is required. Call beginSurface() first.');
    }

    return {
      type: 'deleteSurface',
      surfaceId: this.surfaceId,
    };
  }

  /**
   * Build all messages for a complete surface lifecycle
   */
  buildAll(): {
    beginRendering: BeginRenderingMessage;
    surfaceUpdate: SurfaceUpdateMessage;
  } {
    return {
      beginRendering: this.buildBeginRendering(),
      surfaceUpdate: this.build(),
    };
  }

  // ============================================================================
  // Incremental Updates
  // ============================================================================

  /**
   * Build an incremental update with only specific components
   */
  buildIncrementalUpdate(componentIds: string[]): SurfaceUpdateMessage {
    if (!this.surfaceId) {
      throw new Error('Surface ID is required. Call beginSurface() first.');
    }

    const components: ComponentNode[] = [];
    for (const id of componentIds) {
      const component = this.components.get(id);
      if (component) {
        components.push(component);
      }
    }

    return {
      type: 'surfaceUpdate',
      surfaceId: this.surfaceId,
      version: this.version,
      components,
    };
  }

  /**
   * Clone the builder with current state
   */
  clone(): ComponentBuilder {
    const cloned = new ComponentBuilder(this.config);
    cloned.surfaceId = this.surfaceId;
    cloned.version = this.version;
    cloned.rootComponentId = this.rootComponentId;
    cloned.title = this.title;
    cloned.catalogId = this.catalogId;

    for (const [id, component] of this.components) {
      cloned.components.set(id, {
        ...component,
        properties: { ...component.properties },
        children: component.children ? [...component.children] : undefined,
      });
    }

    return cloned;
  }

  /**
   * Reset the builder to initial state
   */
  reset(): this {
    this.surfaceId = '';
    this.version = 1;
    this.components.clear();
    this.rootComponentId = null;
    this.title = null;
    this.catalogId = null;
    return this;
  }
}

// ============================================================================
// Component Helper Functions
// ============================================================================

/**
 * Create a Row layout component
 */
export function row(
  id: string,
  childIds: string[],
  properties?: Record<string, unknown>
): { id: string; type: string; [key: string]: unknown } {
  return {
    id,
    type: 'Row',
    children: children(...childIds),
    ...properties,
  };
}

/**
 * Create a Column layout component
 */
export function column(
  id: string,
  childIds: string[],
  properties?: Record<string, unknown>
): { id: string; type: string; [key: string]: unknown } {
  return {
    id,
    type: 'Column',
    children: children(...childIds),
    ...properties,
  };
}

/**
 * Create a Card container component
 */
export function card(
  id: string,
  title: string | BoundValue,
  childIds: string[],
  properties?: Record<string, unknown>
): { id: string; type: string; [key: string]: unknown } {
  return {
    id,
    type: 'Card',
    title: typeof title === 'string' ? literal(title) : title,
    children: children(...childIds),
    ...properties,
  };
}

/**
 * Create a Text display component
 */
export function text(
  id: string,
  textContent: string | BoundValue,
  properties?: Record<string, unknown>
): { id: string; type: string; [key: string]: unknown } {
  return {
    id,
    type: 'Text',
    text: typeof textContent === 'string' ? literal(textContent) : textContent,
    ...properties,
  };
}

/**
 * Create a Button interactive component
 */
export function button(
  id: string,
  label: string | BoundValue,
  actionName: string,
  properties?: Record<string, unknown>
): { id: string; type: string; [key: string]: unknown } {
  return {
    id,
    type: 'Button',
    label: typeof label === 'string' ? literal(label) : label,
    action: { name: actionName },
    ...properties,
  };
}

/**
 * Create a List layout component
 */
export function list(
  id: string,
  childrenSpec: string[] | TemplateChildren,
  properties?: Record<string, unknown>
): { id: string; type: string; [key: string]: unknown } {
  return {
    id,
    type: 'List',
    children: Array.isArray(childrenSpec) ? children(...childrenSpec) : childrenSpec,
    ...properties,
  };
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ComponentBuilder instance
 */
export function createComponentBuilder(
  config?: ComponentBuilderConfig
): ComponentBuilder {
  return new ComponentBuilder(config);
}

// ============================================================================
// Convenience Builder
// ============================================================================

/**
 * Quick surface builder for simple use cases
 */
export function buildSurface(
  surfaceId: string,
  components: Array<{
    id: string;
    type: string;
    parentId?: string;
    [key: string]: unknown;
  }>
): SurfaceUpdateMessage {
  const builder = createComponentBuilder();
  builder.beginSurface(surfaceId);

  // First pass: add all components
  for (const comp of components) {
    const { id, type, parentId, ...props } = comp;
    builder.addComponent(id, { type, ...props });
  }

  // Second pass: set up parent-child relationships
  for (const comp of components) {
    if (comp.parentId) {
      builder.appendChildren(comp.parentId, [comp.id]);
    }
  }

  return builder.build();
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
  BoundValue,
  ComponentChildren,
  A2UIAccessibility,
};
