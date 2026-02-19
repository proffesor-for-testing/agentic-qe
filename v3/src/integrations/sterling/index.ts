/**
 * Agentic QE v3 - Sterling OMS Integration
 * Barrel export for the generic Sterling OMS client.
 */

export { createSterlingClient } from './sterling-client';
export { createSterlingXmlParser, ensureArray } from './xml-helpers';
export type {
  SterlingClient,
  SterlingClientConfig,
  SterlingAuthConfig,
  SterlingApiError,
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
