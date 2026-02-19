/**
 * Agentic QE v3 - Sterling OMS Types
 * Generic Sterling Order Management System API types.
 * Reusable across all Sterling OMS clients.
 */

import type { Result } from '../../shared/types';

// ============================================================================
// Client Configuration
// ============================================================================

export interface SterlingClientConfig {
  baseUrl: string;                     // e.g., https://<host>/smcfs/restapi
  auth: SterlingAuthConfig;
  timeout?: number;                    // Default: 30000
  healthUrl?: string;                  // Default: baseUrl with /smcfs/restapi → /smcfs/console/health
  inputFormat?: 'json' | 'xml';       // Default: 'xml' (Sterling-native). Set 'json' if deployment accepts JSON POST.
}

export interface SterlingAuthConfig {
  method: 'basic' | 'bearer' | 'apikey';
  username?: string;
  password?: string;
  token?: string;
  headerName?: string;                 // For apikey method, e.g. 'X-API-Key'
}

// ============================================================================
// API Request Parameters
// ============================================================================

export interface OrderDetailsParams {
  OrderNo: string;
  DocumentType?: string;               // '0001' (sales) or '0003' (return)
}

export interface ShipmentListParams {
  OrderNo: string;
  DocumentType?: string;
}

export interface InvoiceParams {
  OrderNo: string;
  DocumentType?: string;
}

export interface ChangeOrderInput {
  OrderNo: string;
  DocumentType?: string;
  Action?: string;
  Modifications?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PollOptions {
  maxAttempts: number;                 // Default: 20
  intervalMs: number;                  // Default: 5000
}

export interface CreateOrderInput {
  DocumentType?: string;               // '0001' = sales order (default)
  EnterpriseCode: string;
  SellerOrganizationCode: string;      // Required by Sterling — most deployments reject without this
  OrderLines: {
    OrderLine: Array<{
      ItemID: string;
      OrderedQty: string;
      ShipNode?: string;
      [key: string]: unknown;
    }>;
  };
  PersonInfoShipTo?: PersonInfo;
  PaymentMethods?: { PaymentMethod: Array<Partial<PaymentMethod>> };
  [key: string]: unknown;
}

export interface OrderAuditListParams {
  OrderNo: string;
  DocumentType?: string;
  AuditType?: string;
}

export interface OrderAudit {
  OrderAuditKey: string;
  ModificationType: string;
  ModificationLevel: string;
  Modifyts: string;
  ModifyuseridProgid: string;
  ReasonCode?: string;
  ReasonText?: string;
  [key: string]: unknown;
}

// ============================================================================
// API Response Types
// PROVISIONAL: update after Phase 0 captures real responses from first client.
// WARNING: Field names below are guesses from documentation screenshots.
// Real API may return different casing, additional fields, or nested structures.
// ============================================================================

export interface Order {
  OrderNo: string;
  DocumentType: string;
  Status: string;
  SCAC?: string;
  CarrierServiceCode?: string;
  ShipNode?: string;
  OrderLines: { OrderLine: OrderLine[] };
  Shipments?: { Shipment: Shipment[] };
  Notes?: { Note: OrderNote[] };
  PaymentMethods?: { PaymentMethod: PaymentMethod[] };
  PersonInfoShipTo?: PersonInfo;
  ReceivingNode?: string;
  [key: string]: unknown;              // Escape hatch for undocumented fields
}

export interface OrderLine {
  ItemID: string;
  OrderedQty: string;
  SCAC: string;
  CarrierServiceCode: string;
  ShipNode: string;
  LineTotal?: string;
  [key: string]: unknown;
}

export interface Shipment {
  ShipmentNo: string;
  Status: string;
  SCAC: string;
  TrackingNo: string;
  ShipNode: string;
  [key: string]: unknown;
}

export interface OrderInvoice {
  InvoiceNo: string;
  InvoiceType: string;
  TotalAmount: string;
  [key: string]: unknown;
}

export interface OrderNote {
  NoteText: string;
  ContactType?: string;
  ReasonCode?: string;
  [key: string]: unknown;
}

export interface PaymentMethod {
  PaymentType?: string;
  DisplayPaymentReference?: string;
  MaxChargeAmount?: string;
  [key: string]: unknown;
}

export interface PersonInfo {
  FirstName?: string;
  LastName?: string;
  AddressLine1?: string;
  City?: string;
  ZipCode?: string;
  Country?: string;
  [key: string]: unknown;
}

// ============================================================================
// Error Types
// ============================================================================

export interface SterlingApiError {
  message: string;
  status?: number;
  apiName: string;
  rawResponse?: string;
}

// ============================================================================
// Client Interface
// ============================================================================

export interface SterlingClient {
  getOrderDetails(params: OrderDetailsParams): Promise<Result<Order, SterlingApiError>>;
  createOrder(payload: CreateOrderInput): Promise<Result<Order, SterlingApiError>>;
  changeOrder(payload: ChangeOrderInput): Promise<Result<Order, SterlingApiError>>;
  getShipmentList(params: ShipmentListParams): Promise<Result<Shipment[], SterlingApiError>>;
  getOrderInvoiceDetails(params: InvoiceParams): Promise<Result<OrderInvoice[], SterlingApiError>>;
  getOrderAuditList(params: OrderAuditListParams): Promise<Result<OrderAudit[], SterlingApiError>>;
  healthCheck(): Promise<boolean>;
  pollUntil<T>(
    fn: () => Promise<Result<T, SterlingApiError>>,
    predicate: (value: T) => boolean,
    options?: PollOptions
  ): Promise<Result<T, SterlingApiError>>;
}
