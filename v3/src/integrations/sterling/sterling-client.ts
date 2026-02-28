/**
 * Agentic QE v3 - Sterling OMS Client
 * Generic Sterling Order Management System REST client.
 * Reusable across all Sterling OMS clients -- pass different SterlingClientConfig per customer.
 *
 * All API calls use POST /invoke/{apiName} with JSON body.
 * EnterpriseCode is auto-injected into every request.
 * Responses are JSON (not XML). The XML parser import is kept only for sterlingObjectToXml.
 *
 * Follows VibiumClientImpl pattern: interface-driven, Result<T,E> returns,
 * circuit breaker via HttpClient, factory function for DI.
 */

import type { Result } from '../../shared/types';
import { ok, err } from '../../shared/types';
import { HttpClient, getHttpClient } from '../../shared/http/http-client';
import type { HttpError } from '../../shared/http/http-client';
import { ensureArray } from './xml-helpers';
import type {
  SterlingClient,
  SterlingClientConfig,
  SterlingAuthConfig,
  SterlingApiError,
  OrderDetailsParams,
  ShipmentListParams,
  InvoiceParams,
  ChangeOrderInput,
  CreateOrderInput,
  OrderAuditListParams,
  OrderListParams,
  ManageTaskQueueParams,
  PollOptions,
  Order,
  OrderLine,
  OrderRelease,
  Shipment,
  OrderInvoice,
  OrderAudit,
} from './types';

// ============================================================================
// Auth Header Builder
// ============================================================================

function buildAuthHeaders(auth: SterlingAuthConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  switch (auth.method) {
    case 'basic': {
      const encoded = Buffer.from(`${auth.username ?? ''}:${auth.password ?? ''}`).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
      break;
    }
    case 'bearer':
      headers['Authorization'] = `Bearer ${auth.token ?? ''}`;
      break;
    case 'apikey':
      headers[auth.headerName ?? 'X-API-Key'] = auth.token ?? '';
      break;
  }
  return headers;
}

// ============================================================================
// XML Body Serializer (Sterling XAPI REST format)
// ============================================================================

/**
 * Serialize a JS object to Sterling XML format.
 * Convention: scalar values -> XML attributes, objects -> child elements, arrays -> repeated elements.
 * Kept for XAPI XML template building.
 */
export function sterlingObjectToXml(obj: Record<string, unknown>, rootElement: string): string {
  const attrs: string[] = [];
  const children: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      attrs.push(`${key}="${escapeXmlAttr(String(value))}"`);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          children.push(sterlingObjectToXml(item as Record<string, unknown>, key));
        }
      }
    } else if (typeof value === 'object') {
      children.push(sterlingObjectToXml(value as Record<string, unknown>, key));
    }
  }

  const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  if (children.length === 0) return `<${rootElement}${attrStr}/>`;
  return `<${rootElement}${attrStr}>${children.join('')}</${rootElement}>`;
}

function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================================
// Sterling JSON Error Extractor
// ============================================================================

/**
 * Check a JSON response body for Sterling error-in-body patterns.
 * Sterling can return HTTP 200 OK with an error payload inside the JSON.
 */
function extractSterlingJsonError(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    if (parsed?.Errors?.Error) {
      const errors = ensureArray(parsed.Errors.Error);
      return errors
        .map((e: Record<string, unknown>) => e.ErrorDescription || e.ErrorCode || 'Unknown error')
        .join('; ');
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Sterling Client Implementation
// ============================================================================

class SterlingClientImpl implements SterlingClient {
  private http: HttpClient;
  private baseUrl: string;
  private healthUrl: string;
  private authHeaders: Record<string, string>;
  private timeout: number;
  private enterpriseCode: string;

  constructor(config: SterlingClientConfig) {
    this.http = getHttpClient();
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.healthUrl = config.healthUrl ?? this.baseUrl.replace('/smcfs/restapi', '/smcfs/console/health');
    this.authHeaders = buildAuthHeaders(config.auth);
    this.timeout = config.timeout ?? 30000;
    this.enterpriseCode = config.enterpriseCode;
  }

  // --------------------------------------------------------------------------
  // Order CRUD
  // --------------------------------------------------------------------------

  async getOrderDetails(params: OrderDetailsParams): Promise<Result<Order, SterlingApiError>> {
    return this.invoke<Order>('getOrderDetails', {
      OrderNo: params.OrderNo,
      ...(params.DocumentType ? { DocumentType: params.DocumentType } : {}),
    });
  }

  async createOrder(payload: CreateOrderInput): Promise<Result<Order, SterlingApiError>> {
    return this.invoke<Order>('createOrder', payload as Record<string, unknown>);
  }

  async changeOrder(payload: ChangeOrderInput): Promise<Result<Order, SterlingApiError>> {
    return this.invoke<Order>('changeOrder', payload as Record<string, unknown>);
  }

  // --------------------------------------------------------------------------
  // Order Queries
  // --------------------------------------------------------------------------

  async getOrderList(params: OrderListParams): Promise<Result<Order[], SterlingApiError>> {
    const body = this.stripUndefined(params);
    return this.invokeList<Order>(
      'getOrderList',
      body,
      (parsed) => ensureArray(parsed?.OrderList?.Order ?? parsed?.Order),
    );
  }

  async getOrderLineList(params: OrderDetailsParams): Promise<Result<OrderLine[], SterlingApiError>> {
    return this.invokeList<OrderLine>(
      'getOrderLineList',
      {
        OrderNo: params.OrderNo,
        ...(params.DocumentType ? { DocumentType: params.DocumentType } : {}),
      },
      (parsed) => ensureArray(parsed?.OrderLineList?.OrderLine ?? parsed?.OrderLine),
    );
  }

  async getOrderReleaseList(params: OrderDetailsParams): Promise<Result<OrderRelease[], SterlingApiError>> {
    return this.invokeList<OrderRelease>(
      'getOrderReleaseList',
      {
        OrderNo: params.OrderNo,
        ...(params.DocumentType ? { DocumentType: params.DocumentType } : {}),
      },
      (parsed) => ensureArray(parsed?.OrderReleaseList?.OrderRelease ?? parsed?.OrderRelease),
    );
  }

  async getOrderAuditList(params: OrderAuditListParams): Promise<Result<OrderAudit[], SterlingApiError>> {
    return this.invokeList<OrderAudit>(
      'getOrderAuditList',
      {
        OrderNo: params.OrderNo,
        ...(params.DocumentType ? { DocumentType: params.DocumentType } : {}),
        ...(params.AuditType ? { AuditType: params.AuditType } : {}),
      },
      (parsed) => ensureArray(parsed?.OrderAudits?.OrderAudit ?? parsed?.OrderAudit),
    );
  }

  // --------------------------------------------------------------------------
  // Shipment Queries
  // --------------------------------------------------------------------------

  async getShipmentListForOrder(params: ShipmentListParams): Promise<Result<Shipment[], SterlingApiError>> {
    return this.invokeList<Shipment>(
      'getShipmentListForOrder',
      {
        OrderNo: params.OrderNo,
        ...(params.DocumentType ? { DocumentType: params.DocumentType } : {}),
      },
      (parsed) => ensureArray(parsed?.Shipments?.Shipment ?? parsed?.Shipment),
    );
  }

  async getShipmentDetails(
    params: { ShipmentKey?: string; ShipmentNo?: string }
  ): Promise<Result<Shipment, SterlingApiError>> {
    return this.invoke<Shipment>('getShipmentDetails', {
      ...(params.ShipmentKey ? { ShipmentKey: params.ShipmentKey } : {}),
      ...(params.ShipmentNo ? { ShipmentNo: params.ShipmentNo } : {}),
    });
  }

  // --------------------------------------------------------------------------
  // Invoice Queries
  // --------------------------------------------------------------------------

  async getOrderInvoiceList(params: InvoiceParams): Promise<Result<OrderInvoice[], SterlingApiError>> {
    return this.invokeList<OrderInvoice>(
      'getOrderInvoiceList',
      {
        OrderNo: params.OrderNo,
        ...(params.DocumentType ? { DocumentType: params.DocumentType } : {}),
      },
      (parsed) => ensureArray(parsed?.OrderInvoiceList?.OrderInvoice ?? parsed?.OrderInvoice),
    );
  }

  // --------------------------------------------------------------------------
  // Order Actions
  // --------------------------------------------------------------------------

  async scheduleOrder(params: OrderDetailsParams): Promise<Result<Order, SterlingApiError>> {
    return this.invoke<Order>('scheduleOrder', {
      OrderNo: params.OrderNo,
      ...(params.DocumentType ? { DocumentType: params.DocumentType } : {}),
    });
  }

  async releaseOrder(params: OrderDetailsParams): Promise<Result<Order, SterlingApiError>> {
    return this.invoke<Order>('releaseOrder', {
      OrderNo: params.OrderNo,
      ...(params.DocumentType ? { DocumentType: params.DocumentType } : {}),
    });
  }

  // --------------------------------------------------------------------------
  // Task Queue (Self-Healing Recovery)
  // --------------------------------------------------------------------------

  async manageTaskQueue(params: ManageTaskQueueParams): Promise<Result<unknown, SterlingApiError>> {
    return this.invoke<unknown>('manageTaskQueue', {
      ...(params.DataKey ? { DataKey: params.DataKey } : {}),
      ...(params.DataType ? { DataType: params.DataType } : {}),
      ...(params.TaskQKey ? { TaskQKey: params.TaskQKey } : {}),
      ...(params.AvailableDate ? { AvailableDate: params.AvailableDate } : {}),
      ...(params.TransactionId ? { TransactionId: params.TransactionId } : {}),
    });
  }

  // --------------------------------------------------------------------------
  // Infrastructure
  // --------------------------------------------------------------------------

  async healthCheck(): Promise<boolean> {
    return this.http.healthCheck(this.healthUrl);
  }

  async pollUntil<T>(
    fn: () => Promise<Result<T, SterlingApiError>>,
    predicate: (value: T) => boolean,
    options: PollOptions = { maxAttempts: 20, intervalMs: 5000 }
  ): Promise<Result<T, SterlingApiError>> {
    for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
      const result = await fn();
      if (!result.success) return result;
      if (predicate(result.value)) return result;
      await this.sleep(options.intervalMs);
    }
    return err({
      message: `Polling timed out after ${options.maxAttempts} attempts`,
      apiName: 'pollUntil',
    });
  }

  // ==========================================================================
  // Private: Core invoke method (POST /invoke/{apiName})
  // ==========================================================================

  /**
   * Invoke a Sterling REST API. All calls are POST to /invoke/{apiName}
   * with JSON body. EnterpriseCode is auto-injected.
   */
  private async invoke<T>(
    apiName: string,
    body: Record<string, unknown>
  ): Promise<Result<T, SterlingApiError>> {
    const url = `${this.baseUrl}/invoke/${apiName}`;
    const requestBody = { EnterpriseCode: this.enterpriseCode, ...body };

    const result = await this.http.post(url, requestBody, {
      headers: this.authHeaders,
      timeout: this.timeout,
    });

    if (!result.success) {
      return err(this.toSterlingError(result.error, apiName));
    }

    return this.parseJsonResponse<T>(result.value, apiName);
  }

  /**
   * Invoke a Sterling list API and extract the array from the response wrapper.
   * Sterling wraps lists: e.g., { "Shipments": { "Shipment": [...] } }.
   * The extractor function pulls the array out and ensureArray normalizes it.
   */
  private async invokeList<T>(
    apiName: string,
    body: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extractor: (parsed: any) => T[],
  ): Promise<Result<T[], SterlingApiError>> {
    const url = `${this.baseUrl}/invoke/${apiName}`;
    const requestBody = { EnterpriseCode: this.enterpriseCode, ...body };

    const result = await this.http.post(url, requestBody, {
      headers: this.authHeaders,
      timeout: this.timeout,
    });

    if (!result.success) {
      return err(this.toSterlingError(result.error, apiName));
    }

    return this.parseJsonListResponse<T>(result.value, extractor, apiName);
  }

  // ==========================================================================
  // Private: JSON Response Parsing
  // ==========================================================================

  private async parseJsonResponse<T>(
    response: Response,
    apiName: string
  ): Promise<Result<T, SterlingApiError>> {
    try {
      const body = await response.text();

      if (!response.ok) {
        return err({
          message: `HTTP ${response.status}: ${response.statusText}`,
          status: response.status,
          apiName,
          rawResponse: body.slice(0, 1000),
        });
      }

      // Check for Sterling error-in-body (200 OK with error payload)
      const sterlingError = extractSterlingJsonError(body);
      if (sterlingError) {
        return err({ message: sterlingError, apiName, rawResponse: body.slice(0, 500) });
      }

      const data = JSON.parse(body) as T;
      return ok(data);
    } catch (e) {
      return err({
        message: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
        apiName,
      });
    }
  }

  private async parseJsonListResponse<T>(
    response: Response,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extractor: (parsed: any) => T[],
    apiName: string
  ): Promise<Result<T[], SterlingApiError>> {
    try {
      const body = await response.text();

      if (!response.ok) {
        return err({
          message: `HTTP ${response.status}: ${response.statusText}`,
          status: response.status,
          apiName,
          rawResponse: body.slice(0, 1000),
        });
      }

      // Check for Sterling error-in-body (200 OK with error payload)
      const sterlingError = extractSterlingJsonError(body);
      if (sterlingError) {
        return err({ message: sterlingError, apiName, rawResponse: body.slice(0, 500) });
      }

      const parsed = JSON.parse(body);
      return ok(extractor(parsed));
    } catch (e) {
      return err({
        message: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
        apiName,
      });
    }
  }

  // ==========================================================================
  // Private: Helpers
  // ==========================================================================

  private toSterlingError(httpError: HttpError, apiName: string): SterlingApiError {
    return {
      message: httpError.message,
      status: httpError.status,
      apiName,
    };
  }

  /** Strip undefined values from a params object for clean request bodies. */
  private stripUndefined(params: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Sterling OMS client. Pass client-specific config --
 * the client implementation is generic across all Sterling instances.
 */
export function createSterlingClient(config: SterlingClientConfig): SterlingClient {
  return new SterlingClientImpl(config);
}
