/**
 * A2UI Message Types
 *
 * Type definitions for A2UI protocol messages including:
 * - Surface lifecycle (begin, update, delete)
 * - Data model updates
 * - User actions
 *
 * @module adapters/a2ui/renderer/message-types
 */

// ============================================================================
// BoundValue Types
// ============================================================================

/**
 * Static literal value
 */
export interface LiteralValue {
  literalString: string;
}

/**
 * Dynamic path-bound value (JSON Pointer RFC 6901)
 */
export interface PathValue {
  path: string;
}

/**
 * Combined literal and path value (default + binding)
 */
export interface CombinedValue {
  literalString: string;
  path: string;
}

/**
 * Any bound value type
 */
export type BoundValue = LiteralValue | PathValue | CombinedValue;

/**
 * Type guard for LiteralValue
 */
export function isLiteralValue(value: unknown): value is LiteralValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'literalString' in value &&
    typeof (value as LiteralValue).literalString === 'string' &&
    !('path' in value)
  );
}

/**
 * Type guard for PathValue
 */
export function isPathValue(value: unknown): value is PathValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    typeof (value as PathValue).path === 'string' &&
    !('literalString' in value)
  );
}

/**
 * Type guard for CombinedValue
 */
export function isCombinedValue(value: unknown): value is CombinedValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'literalString' in value &&
    'path' in value &&
    typeof (value as CombinedValue).literalString === 'string' &&
    typeof (value as CombinedValue).path === 'string'
  );
}

/**
 * Type guard for BoundValue
 */
export function isBoundValue(value: unknown): value is BoundValue {
  return isLiteralValue(value) || isPathValue(value) || isCombinedValue(value);
}

// ============================================================================
// Children Types
// ============================================================================

/**
 * Static list of child component IDs
 */
export interface ExplicitList {
  explicitList: string[];
}

/**
 * Dynamic template for repeating children
 */
export interface TemplateChildren {
  template: {
    dataBinding: string;  // JSON Pointer to array data
    componentId: string;  // Template component ID
  };
}

/**
 * Component children specification
 */
export type ComponentChildren = ExplicitList | TemplateChildren;

/**
 * Type guard for ExplicitList
 */
export function isExplicitList(children: unknown): children is ExplicitList {
  return (
    typeof children === 'object' &&
    children !== null &&
    'explicitList' in children &&
    Array.isArray((children as ExplicitList).explicitList)
  );
}

/**
 * Type guard for TemplateChildren
 */
export function isTemplateChildren(children: unknown): children is TemplateChildren {
  return (
    typeof children === 'object' &&
    children !== null &&
    'template' in children &&
    typeof (children as TemplateChildren).template === 'object' &&
    'dataBinding' in (children as TemplateChildren).template &&
    'componentId' in (children as TemplateChildren).template
  );
}

// ============================================================================
// Accessibility Types
// ============================================================================

/**
 * ARIA live region mode
 */
export type AriaLive = 'off' | 'polite' | 'assertive';

/**
 * Accessibility attributes for A2UI components
 */
export interface A2UIAccessibility {
  /** ARIA role */
  role?: string;
  /** Accessible label (aria-label) */
  label?: string;
  /** ID of describing element (aria-describedby) */
  describedBy?: string;
  /** Live region announcement mode */
  live?: AriaLive;
  /** Expanded state (aria-expanded) */
  expanded?: boolean;
  /** Selected state (aria-selected) */
  selected?: boolean;
  /** Disabled state (aria-disabled) */
  disabled?: boolean;
  /** Hidden from accessibility tree */
  hidden?: boolean;
  /** Current value for range widgets */
  valuenow?: number;
  /** Minimum value for range widgets */
  valuemin?: number;
  /** Maximum value for range widgets */
  valuemax?: number;
  /** Text alternative for valuenow */
  valuetext?: string;
}

// ============================================================================
// Component Types
// ============================================================================

/**
 * Component property value - can be static, bound, or nested children
 */
export type ComponentPropertyValue =
  | BoundValue
  | ComponentChildren
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[];

/**
 * Component properties object
 */
export interface ComponentProperties {
  [key: string]: ComponentPropertyValue;
}

/**
 * Component definition with type and properties
 */
export interface ComponentDefinition {
  [componentType: string]: ComponentProperties;
}

/**
 * Component node in the flat adjacency list
 */
export interface ComponentNode {
  /** Unique component identifier */
  id: string;
  /** Component type and properties */
  type: string;
  /** Component properties */
  properties: Record<string, unknown>;
  /** Child component IDs (for parent-child relationships) */
  children?: string[];
}

/**
 * A2UI component (legacy format for compatibility)
 */
export interface A2UIComponent {
  /** Unique component identifier */
  id: string;
  /** Component type and properties */
  component: ComponentDefinition;
}

// ============================================================================
// Action Types
// ============================================================================

/**
 * Button action definition
 */
export interface ComponentAction {
  /** Action name/identifier */
  name: string;
  /** Action parameters */
  parameters?: Record<string, BoundValue | unknown>;
}

// ============================================================================
// Server-to-Client Message Types
// ============================================================================

/**
 * surfaceUpdate - Delivers component definitions as flat adjacency list
 */
export interface SurfaceUpdateMessage {
  type: 'surfaceUpdate';
  /** Unique surface identifier */
  surfaceId: string;
  /** Version for optimistic updates */
  version: number;
  /** Flat list of components (adjacency list) */
  components: ComponentNode[];
}

/**
 * dataModelUpdate - Manages application state
 */
export interface DataModelUpdateMessage {
  type: 'dataModelUpdate';
  /** Surface this data belongs to */
  surfaceId: string;
  /** Data model updates */
  data: Record<string, unknown>;
}

/**
 * beginRendering - Signals UI readiness
 */
export interface BeginRenderingMessage {
  type: 'beginRendering';
  /** Surface to begin rendering */
  surfaceId: string;
  /** Surface title for display */
  title?: string;
  /** Root component ID */
  rootComponentId?: string;
  /** Catalog ID to use */
  catalogId?: string;
}

/**
 * deleteSurface - Removes UI region
 */
export interface DeleteSurfaceMessage {
  type: 'deleteSurface';
  /** Surface to delete */
  surfaceId: string;
}

/**
 * Server-to-client message union
 */
export type A2UIServerMessage =
  | SurfaceUpdateMessage
  | DataModelUpdateMessage
  | BeginRenderingMessage
  | DeleteSurfaceMessage;

// ============================================================================
// Client-to-Server Message Types
// ============================================================================

/**
 * userAction - Reports user interactions
 */
export interface UserActionMessage {
  type: 'userAction';
  /** Surface the action occurred in */
  surfaceId: string;
  /** Component that triggered the action */
  componentId: string;
  /** Action identifier */
  actionId: string;
  /** Action payload/context */
  payload?: Record<string, unknown>;
  /** Timestamp of the action */
  timestamp?: string;
}

/**
 * error - Client-side error report
 */
export interface ClientErrorMessage {
  type: 'error';
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Surface where error occurred */
  surfaceId?: string;
  /** Component where error occurred */
  componentId?: string;
}

/**
 * Client-to-server message union
 */
export type A2UIClientMessage = UserActionMessage | ClientErrorMessage;

/**
 * All A2UI message types
 */
export type A2UIMessage = A2UIServerMessage | A2UIClientMessage;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for SurfaceUpdateMessage
 */
export function isSurfaceUpdateMessage(msg: unknown): msg is SurfaceUpdateMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as SurfaceUpdateMessage).type === 'surfaceUpdate' &&
    typeof (msg as SurfaceUpdateMessage).surfaceId === 'string' &&
    typeof (msg as SurfaceUpdateMessage).version === 'number' &&
    Array.isArray((msg as SurfaceUpdateMessage).components)
  );
}

/**
 * Type guard for DataModelUpdateMessage
 */
export function isDataModelUpdateMessage(msg: unknown): msg is DataModelUpdateMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as DataModelUpdateMessage).type === 'dataModelUpdate' &&
    typeof (msg as DataModelUpdateMessage).surfaceId === 'string' &&
    typeof (msg as DataModelUpdateMessage).data === 'object'
  );
}

/**
 * Type guard for BeginRenderingMessage
 */
export function isBeginRenderingMessage(msg: unknown): msg is BeginRenderingMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as BeginRenderingMessage).type === 'beginRendering' &&
    typeof (msg as BeginRenderingMessage).surfaceId === 'string'
  );
}

/**
 * Type guard for DeleteSurfaceMessage
 */
export function isDeleteSurfaceMessage(msg: unknown): msg is DeleteSurfaceMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as DeleteSurfaceMessage).type === 'deleteSurface' &&
    typeof (msg as DeleteSurfaceMessage).surfaceId === 'string'
  );
}

/**
 * Type guard for UserActionMessage
 */
export function isUserActionMessage(msg: unknown): msg is UserActionMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as UserActionMessage).type === 'userAction' &&
    typeof (msg as UserActionMessage).surfaceId === 'string' &&
    typeof (msg as UserActionMessage).componentId === 'string' &&
    typeof (msg as UserActionMessage).actionId === 'string'
  );
}

/**
 * Type guard for ClientErrorMessage
 */
export function isClientErrorMessage(msg: unknown): msg is ClientErrorMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as ClientErrorMessage).type === 'error' &&
    typeof (msg as ClientErrorMessage).code === 'string' &&
    typeof (msg as ClientErrorMessage).message === 'string'
  );
}

/**
 * Type guard for server messages
 */
export function isServerMessage(msg: unknown): msg is A2UIServerMessage {
  return (
    isSurfaceUpdateMessage(msg) ||
    isDataModelUpdateMessage(msg) ||
    isBeginRenderingMessage(msg) ||
    isDeleteSurfaceMessage(msg)
  );
}

/**
 * Type guard for client messages
 */
export function isClientMessage(msg: unknown): msg is A2UIClientMessage {
  return isUserActionMessage(msg) || isClientErrorMessage(msg);
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a literal BoundValue
 */
export function literal(value: string): LiteralValue {
  return { literalString: value };
}

/**
 * Create a path-bound BoundValue
 */
export function path(jsonPointer: string): PathValue {
  return { path: jsonPointer };
}

/**
 * Create a combined BoundValue with default and binding
 */
export function boundWithDefault(defaultValue: string, jsonPointer: string): CombinedValue {
  return { literalString: defaultValue, path: jsonPointer };
}

/**
 * Create explicit children list
 */
export function children(...ids: string[]): ExplicitList {
  return { explicitList: ids };
}

/**
 * Create template children binding
 */
export function templateChildren(dataBinding: string, componentId: string): TemplateChildren {
  return {
    template: { dataBinding, componentId },
  };
}

/**
 * Create accessibility attributes
 */
export function a11y(attrs: A2UIAccessibility): A2UIAccessibility {
  return { ...attrs };
}
