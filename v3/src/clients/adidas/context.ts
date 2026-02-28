/**
 * Agentic QE v3 - Adidas Test Context
 * Extends BaseTestContext with Adidas-specific fields for TC_01 E2E flows.
 */

import type { BaseTestContext } from '../../integrations/orchestration/base-context';
import type { BrowserProvider } from '../../integrations/browser/types';
import type { EmailProvider } from '../../integrations/email/types';
import type { PdfExtractor } from '../../integrations/pdf/types';
import type { XAPIClient } from '../../integrations/sterling/types';
import type { AdidasClientConfig } from './config';
import { createSterlingClient } from '../../integrations/sterling/sterling-client';
import { createXAPIClient } from '../../integrations/sterling/xapi-client';
import { createMQBrowseProvider } from '../../integrations/iib/providers/mq-browse';
import { createEpochDBProvider } from '../../integrations/iib/providers/epoch-db';
import { createNShiftClient } from '../../integrations/nshift/nshift-client';
import { createEmailProvider } from '../../integrations/email/email-provider';
import { createBrowserProvider } from '../../integrations/browser/playwright-provider';
import { createPdfExtractor } from '../../integrations/pdf/pdf-extractor';
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

  // Lifecycle state — populated during stage execution for XML templates
  shipNode?: string;
  releaseNo?: string;

  // Config pass-through for XAPI templates and recovery
  enterpriseCode: string;

  // XAPI client — available when XAPI URL + credentials are configured
  xapiClient?: XAPIClient;

  // Layer 3 providers — available when credentials/packages are configured
  emailProvider?: EmailProvider;
  pdfExtractor?: PdfExtractor;
  browserProvider?: BrowserProvider;

  // PDF buffers — populated during test execution when PDFs are retrieved
  forwardLabelPdf?: Buffer;
  returnLabelPdf?: Buffer;
  creditNotePdf?: Buffer;
}

// ============================================================================
// Context Factory
// ============================================================================

/**
 * Create an Adidas test context initialized with all available clients.
 * Mutable fields (shipments, invoiceNo, etc.) are populated by steps as they execute.
 *
 * Provider priority for Layer 2 (IIB):
 *   1. MQ Browse (primary — verifies actual IIB message flow execution)
 *   2. EPOCH DB (fallback — verifies Sterling DB state as indirect evidence)
 *
 * Layer 3 providers (Email, PDF, Browser) are wired when credentials are available.
 * Steps auto-skip when providers are missing.
 */
export function createAdidasTestContext(config: AdidasClientConfig): AdidasTestContext {
  const queueMappings = buildAdidasQueueMappings(config.region);

  // XAPI client — available when XAPI tester JSP URL + credentials are configured
  let xapiClient: XAPIClient | undefined;
  if (config.xapi?.enabled && config.xapi.config) {
    const result = createXAPIClient(config.xapi.config);
    if (result.success) {
      xapiClient = result.value;
    }
  }

  // Layer 2: MQ Browse is primary (verifies actual IIB message flow execution).
  // EPOCH DB is fallback only (verifies Sterling DB state — indirect evidence).
  const iibProvider = config.mqBrowse.enabled && config.mqBrowse.config
    ? createMQBrowseProvider(config.mqBrowse.config, queueMappings)
    : config.epochDB.enabled && config.epochDB.config
      ? createEpochDBProvider(config.epochDB.config, queueMappings)
      : undefined;

  return {
    // BaseTestContext fields
    orderId: '',
    documentType: '0001',
    sterlingClient: createSterlingClient(config.sterling),

    // Layer 2: IIB provider (MQ Browse primary, EPOCH DB fallback)
    iibProvider,

    // Layer 3: NShift client
    nshiftClient: config.nshift.enabled && config.nshift.config
      ? createNShiftClient(config.nshift.config)
      : undefined,

    // Layer 3: Email provider (IMAP or MS Graph)
    emailProvider: config.email.enabled && config.email.config
      ? createEmailProvider(config.email.config)
      : undefined,

    // Layer 3: PDF extractor (pdf-parse is loaded lazily on first use;
    // creating the extractor is safe — it fails at extraction time if not installed)
    pdfExtractor: createPdfExtractor(),

    // Layer 3: Browser provider (Playwright)
    browserProvider: config.browser.enabled && config.browser.config
      ? createBrowserProvider(config.browser.config)
      : undefined,

    // Adidas-specific fields — populated during test execution
    shipments: [],
    originalOrderTotal: '',
    paymentMethod: '',
    enterpriseCode: config.enterpriseCode,
  };
}
