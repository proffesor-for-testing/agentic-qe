/**
 * A2UI AG-UI Integration Module
 *
 * Provides integration between A2UI surfaces and AG-UI state synchronization.
 * Enables reactive updates when AG-UI state changes via STATE_SNAPSHOT and STATE_DELTA.
 *
 * @module adapters/a2ui/integration
 */

// ============================================================================
// AG-UI Sync Service
// ============================================================================

export {
  // Service Class
  AGUISyncService,
  createAGUISyncService,

  // Types
  type PathMapping,
  type A2UICustomEventName,
  type A2UICustomEventPayload,
  type ActionStateMapping,
  type AGUISyncServiceConfig,
  type SyncServiceState,
  type SyncEvent,
} from './agui-sync.js';

// ============================================================================
// Surface State Bridge
// ============================================================================

export {
  // Bridge Class
  SurfaceStateBridge,
  createSurfaceStateBridge,

  // Types
  type ComponentBinding,
  type BoundSurfaceConfig,
  type SurfaceStateBridgeConfig,
  type BridgeUpdateEvent,

  // Convenience Builders
  boundSurface,
  binding,
} from './surface-state-bridge.js';
