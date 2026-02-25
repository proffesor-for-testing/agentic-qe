/**
 * Sterling OMS REST API Client — Adidas O2C POC
 *
 * Wrapper around Sterling OmniHub REST API at:
 *   POST https://{host}/smcfs/restapi/invoke/{apiName}
 *
 * Environment: SIT Omni (stgem.omnihub.3stripes.net)
 * Enterprise: adidasEM_TH
 */

// ============================================================================
// Types
// ============================================================================

export interface SterlingConfig {
  /** Base URL e.g. https://stgem.omnihub.3stripes.net */
  baseUrl: string;
  /** Auth headers (Bearer token, Basic, etc.) */
  authHeaders?: Record<string, string>;
  /** Request timeout in ms (default 30000) */
  timeout?: number;
  /** Enterprise code (default: adidasEM_TH) */
  enterpriseCode?: string;
}

export interface SterlingResponse<T = unknown> {
  data: T;
  status: number;
  duration: number;
  headers: Record<string, string>;
}

export interface OrderListRequest {
  DocumentType?: string;
  OrderNo?: string;
  EnterpriseCode?: string;
  Status?: string;
  CustomerEMailID?: string;
  CustomerPONo?: string;
  OrderDate?: string;
  EntryType?: string;
  MaximumRecords?: string;
  [key: string]: string | undefined;
}

export interface OrderListResponse {
  Order: SterlingOrder[];
  ReadFromHistory: string;
  TotalOrderList: string;
  LastRecordSet: string;
  LastOrderHeaderKey: string;
}

export interface SterlingOrder {
  OrderHeaderKey: string;
  OrderNo: string;
  DocumentType: string;
  EnterpriseCode: string;
  OrderType: string;
  OrderDate: string;
  Status: string;
  MinOrderStatus: string;
  MinOrderStatusDesc: string;
  MaxOrderStatus: string;
  MaxOrderStatusDesc: string;
  PaymentStatus: string;
  HoldFlag: string;
  HoldReasonCode: string;
  DraftOrderFlag: string;
  EnteredBy: string;
  EntryType: string;
  CustomerEMailID: string;
  CustomerPONo: string;
  OrderName: string;
  CarrierAccountNo: string;
  CarrierServiceCode: string;
  SCAC: string;
  AllocationRuleID: string;
  NotificationReference: string;
  NotificationType: string;
  SellerOrganizationCode: string;
  TaxExemptionFlag: string;
  TaxExemptionCertificate: string;
  TotalAdjustmentAmount: string;
  FreightTerms: string;
  ChargeActualFreightFlag: string;
  isHistory: string;
  InvoicedTotals: FinancialTotals;
  OverallTotals: FinancialTotals;
  RemainingTotals: FinancialTotals;
  PriceInfo: PriceInfo;
  [key: string]: unknown;
}

export interface FinancialTotals {
  GrandCharges: string;
  GrandTax: string;
  HdrTax: string;
  GrandTotal: string;
  LineSubTotal?: string;
  HdrDiscount?: string;
  HdrCharges?: string;
  GrandDiscount?: string;
  HdrTotal?: string;
  OtherCharges?: string;
}

export interface PriceInfo {
  Currency: string;
  TotalAmount: string;
  EnterpriseCurrency: string;
  ReportingConversionRate: string;
  ReportingConversionDate: string;
}

export interface OrderDetailRequest {
  OrderHeaderKey?: string;
  OrderNo?: string;
  EnterpriseCode?: string;
  DocumentType?: string;
}

export interface ShipmentListRequest {
  OrderHeaderKey?: string;
  OrderNo?: string;
  EnterpriseCode?: string;
  DocumentType?: string;
  ShipmentNo?: string;
  ShipNode?: string;
}

export interface InvoiceListRequest {
  OrderHeaderKey?: string;
  OrderNo?: string;
  EnterpriseCode?: string;
  DocumentType?: string;
  InvoiceNo?: string;
  InvoiceType?: string;
}

// ============================================================================
// Client
// ============================================================================

export class SterlingOMSClient {
  private readonly config: Required<SterlingConfig>;

  constructor(config: SterlingConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      authHeaders: config.authHeaders ?? {},
      timeout: config.timeout ?? 30_000,
      enterpriseCode: config.enterpriseCode ?? 'adidasEM_TH',
    };
  }

  // --------------------------------------------------------------------------
  // Core request method
  // --------------------------------------------------------------------------

  async invoke<T = unknown>(apiName: string, body: Record<string, unknown>): Promise<SterlingResponse<T>> {
    const url = `${this.config.baseUrl}/smcfs/restapi/invoke/${apiName}`;
    const start = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.authHeaders,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const duration = Date.now() - start;
      const data = await response.json() as T;

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return { data, status: response.status, duration, headers };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // --------------------------------------------------------------------------
  // Order APIs
  // --------------------------------------------------------------------------

  async getOrderList(params: OrderListRequest): Promise<SterlingResponse<OrderListResponse>> {
    return this.invoke<OrderListResponse>('getOrderList', {
      EnterpriseCode: this.config.enterpriseCode,
      ...params,
    });
  }

  async getOrderDetails(params: OrderDetailRequest): Promise<SterlingResponse<unknown>> {
    return this.invoke('getOrderDetails', {
      EnterpriseCode: this.config.enterpriseCode,
      ...params,
    });
  }

  async changeOrder(params: Record<string, unknown>): Promise<SterlingResponse<unknown>> {
    return this.invoke('changeOrder', {
      EnterpriseCode: this.config.enterpriseCode,
      ...params,
    });
  }

  async getOrderLineList(params: OrderDetailRequest): Promise<SterlingResponse<unknown>> {
    return this.invoke('getOrderLineList', {
      EnterpriseCode: this.config.enterpriseCode,
      ...params,
    });
  }

  async getOrderReleaseList(params: OrderDetailRequest): Promise<SterlingResponse<unknown>> {
    return this.invoke('getOrderReleaseList', {
      EnterpriseCode: this.config.enterpriseCode,
      ...params,
    });
  }

  async getOrderAuditList(params: OrderDetailRequest): Promise<SterlingResponse<unknown>> {
    return this.invoke('getOrderAuditList', {
      EnterpriseCode: this.config.enterpriseCode,
      ...params,
    });
  }

  // --------------------------------------------------------------------------
  // Shipment APIs
  // --------------------------------------------------------------------------

  async getShipmentListForOrder(params: ShipmentListRequest): Promise<SterlingResponse<unknown>> {
    return this.invoke('getShipmentListForOrder', {
      EnterpriseCode: this.config.enterpriseCode,
      ...params,
    });
  }

  async getShipmentDetails(params: { ShipmentKey?: string; ShipmentNo?: string }): Promise<SterlingResponse<unknown>> {
    return this.invoke('getShipmentDetails', params);
  }

  // --------------------------------------------------------------------------
  // Invoice APIs
  // --------------------------------------------------------------------------

  async getOrderInvoiceList(params: InvoiceListRequest): Promise<SterlingResponse<unknown>> {
    return this.invoke('getOrderInvoiceList', {
      EnterpriseCode: this.config.enterpriseCode,
      ...params,
    });
  }

  async getOrderInvoiceDetails(params: InvoiceListRequest): Promise<SterlingResponse<unknown>> {
    return this.invoke('getOrderInvoiceDetails', {
      EnterpriseCode: this.config.enterpriseCode,
      ...params,
    });
  }

  // --------------------------------------------------------------------------
  // Inventory APIs
  // --------------------------------------------------------------------------

  async getAvailableInventory(params: {
    OrganizationCode?: string;
    ItemID?: string;
    UnitOfMeasure?: string;
    ProductClass?: string;
  }): Promise<SterlingResponse<unknown>> {
    return this.invoke('getAvailableInventory', {
      OrganizationCode: this.config.enterpriseCode,
      ...params,
    });
  }

  // --------------------------------------------------------------------------
  // Return APIs
  // --------------------------------------------------------------------------

  async getOrdersForReturn(params: OrderDetailRequest): Promise<SterlingResponse<unknown>> {
    return this.invoke('getOrdersForReturn', {
      EnterpriseCode: this.config.enterpriseCode,
      ...params,
    });
  }

  // --------------------------------------------------------------------------
  // Health Check
  // --------------------------------------------------------------------------

  async healthCheck(): Promise<{ healthy: boolean; duration: number; status: number }> {
    const url = `${this.config.baseUrl}/smcfs/console/health`;
    const start = Date.now();

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.config.authHeaders,
        signal: AbortSignal.timeout(10_000),
      });
      return { healthy: response.ok, duration: Date.now() - start, status: response.status };
    } catch {
      return { healthy: false, duration: Date.now() - start, status: 0 };
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createSterlingClient(config: SterlingConfig): SterlingOMSClient {
  return new SterlingOMSClient(config);
}

/**
 * Create a SIT environment client (default for POC)
 */
export function createSITClient(authHeaders?: Record<string, string>): SterlingOMSClient {
  return new SterlingOMSClient({
    baseUrl: 'https://stgem.omnihub.3stripes.net',
    enterpriseCode: 'adidasEM_TH',
    authHeaders,
    timeout: 30_000,
  });
}
