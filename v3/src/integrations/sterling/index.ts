/**
 * Agentic QE v3 - Sterling OMS Integration
 * Barrel export for the generic Sterling OMS client.
 */

export { createSterlingClient } from './sterling-client';
export { createXAPIClient, extractSterlingXmlError } from './xapi-client';
export { createSterlingXmlParser, ensureArray } from './xml-helpers';
export type {
  SterlingClient,
  SterlingClientConfig,
  SterlingAuthConfig,
  SterlingApiError,
  XAPIClient,
  XAPIClientConfig,
  XAPIResponse,
  OrderDetailsParams,
  ShipmentListParams,
  InvoiceParams,
  ChangeOrderInput,
  PollOptions,
  Order,
  OrderLine,
  Shipment,
  OrderInvoice,
  OrderNote,
  PaymentMethod,
  PersonInfo,
} from './types';
