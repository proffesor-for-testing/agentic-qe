/**
 * Agentic QE v3 - Adidas Test Context
 * Extends BaseTestContext with Adidas-specific fields for TC_01 E2E flows.
 */

import type { BaseTestContext } from '../../integrations/orchestration/base-context';
import type { AdidasClientConfig } from './config';
import { createSterlingClient } from '../../integrations/sterling/sterling-client';
import { createMQBrowseProvider } from '../../integrations/iib/providers/mq-browse';
import { createNShiftClient } from '../../integrations/nshift/nshift-client';
import { buildAdidasQueueMappings } from './queue-mapping';

// ============================================================================
// Adidas Test Context
// ============================================================================

/**
 * Adidas-specific test context. Extends the generic BaseTestContext with
 * fields needed by Adidas TC_01 step definitions (forward + return flow).
 */
export interface AdidasTestContext extends BaseTestContext {
  shipments: Array<{
    shipmentNo: string;
    trackingNo: string;
    containerNo: string;
    scac: string;
  }>;
  originalOrderTotal: string;
  paymentMethod: string;
  forwardInvoiceNo?: string;

  // Return flow fields
  returnOrderNo?: string;
  returnTracking?: string;
  creditNoteNo?: string;
}

// ============================================================================
// Context Factory
// ============================================================================

/**
 * Create an Adidas test context initialized with all available clients.
 * Mutable fields (shipments, invoiceNo, etc.) are populated by steps as they execute.
 *
 * Layer 2 (MQ browse) and Layer 3 (NShift) providers are wired up when
 * their credentials are available. Steps auto-skip when providers are missing.
 */
export function createAdidasTestContext(config: AdidasClientConfig): AdidasTestContext {
  return {
    // BaseTestContext fields
    orderId: '',
    documentType: '0001',
    sterlingClient: createSterlingClient(config.sterling),

    // Layer 2: MQ browse provider (biggest lever: +94 checks including schema validation)
    iibProvider: config.mqBrowse.enabled && config.mqBrowse.config
      ? createMQBrowseProvider(config.mqBrowse.config, buildAdidasQueueMappings(config.region))
      : undefined,

    // Layer 3: NShift client (+5 label checks)
    nshiftClient: config.nshift.enabled && config.nshift.config
      ? createNShiftClient(config.nshift.config)
      : undefined,

    // Adidas-specific fields — populated during test execution
    shipments: [],
    originalOrderTotal: '',
    paymentMethod: '',
  };
}
