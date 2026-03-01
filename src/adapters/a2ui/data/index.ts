/**
 * A2UI Data Binding Module
 *
 * Provides data binding infrastructure for A2UI including:
 * - JSON Pointer (RFC 6901) parsing and resolution
 * - BoundValue types and resolution
 * - Reactive data store with subscriptions
 *
 * @module adapters/a2ui/data
 */

// ============================================================================
// JSON Pointer (RFC 6901)
// ============================================================================

export {
  // Error types
  JsonPointerError,
  type JsonPointerErrorCode,
  type ResolveResult,

  // Core functions
  escapeSegment,
  unescapeSegment,
  parseJsonPointer,
  buildJsonPointer,
  isValidPointer,
  resolvePointer,
  resolvePointerWithInfo,
  pointerExists,
  setAtPointer,
  deleteAtPointer,
  getAllPaths,

  // Path utilities
  isParentPointer,
  getParentPointer,
  getPointerKey,
  joinPointers,
  getRelativePath,
} from './json-pointer-resolver.js';

// ============================================================================
// BoundValue Types and Resolution
// ============================================================================

export {
  // Types
  type LiteralValue,
  type PathValue,
  type CombinedValue,
  type BoundValue,
  type ExplicitListChildren,
  type TemplateChildrenConfig,
  type TemplateChildren,
  type ComponentChildren,
  type ResolvedTemplateChild,
  type BoundValueResolverConfig,
  type IBoundValueResolver,

  // Type guards
  isLiteralValue,
  isPathValue,
  isCombinedValue,
  isBoundValue,
  isExplicitListChildren,
  isTemplateChildren,

  // Factory functions
  createLiteralValue,
  createPathValue,
  createCombinedValue,
  createExplicitListChildren,
  createTemplateChildren,

  // Resolver
  BoundValueResolver,
  createBoundValueResolver,

  // Utilities
  getStaticValue,
  getBindingPath,
  hasDynamicBinding,
  hasStaticDefault,
  toBoundValue,
  extractBoundPaths,
  resolveAllBoundValues,
} from './bound-value.js';

// ============================================================================
// Reactive Store
// ============================================================================

export {
  // Types
  type ChangeCallback,
  type GlobalChangeCallback,
  type StoreChange,
  type BatchUpdate,
  type Subscription,
  type ReactiveStoreConfig,
  type IReactiveStore,

  // Store implementation
  ReactiveStore,
  createReactiveStore,

  // Utilities
  createComputed,
  createSelector,
  combineStores,
} from './reactive-store.js';
