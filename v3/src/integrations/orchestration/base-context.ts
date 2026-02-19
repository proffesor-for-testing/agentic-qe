/**
 * Agentic QE v3 - Base Test Context
 * Common test context shared by all clients.
 * Clients extend this with their own fields in clients/<name>/context.ts.
 */

import type { SterlingClient } from '../sterling/types';

// ============================================================================
// Optional Integration Providers (forward references)
// ============================================================================

// These use the generic interfaces from their respective integration modules.
// Imported as types to avoid circular dependencies during build.
import type { IIBPayloadProvider } from '../iib/types';
import type { NShiftClient } from '../nshift/types';

// ============================================================================
// Base Test Context
// ============================================================================

/**
 * Base context shared by all E2E test clients.
 * Every client extends this with their own fields.
 * The index signature allows client-specific fields without explicit declaration.
 */
export interface BaseTestContext {
  orderId: string;
  documentType: string;
  sterlingClient: SterlingClient;

  // Optional integration providers — available when Tier 2/3 credentials exist
  iibProvider?: IIBPayloadProvider;
  nshiftClient?: NShiftClient;

  // Client-specific fields go in the client's extended interface
  [key: string]: unknown;
}
