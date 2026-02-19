/**
 * Agentic QE v3 - Sterling OMS Client
 * Generic Sterling Order Management System REST client.
 * Reusable across all Sterling OMS clients — pass different SterlingClientConfig per customer.
 *
 * Follows VibiumClientImpl pattern: interface-driven, Result<T,E> returns,
 * circuit breaker via HttpClient, factory function for DI.
 */

import type { Result } from '../../shared/types';
import { ok, err } from '../../shared/types';
import { HttpClient, getHttpClient } from '../../shared/http/http-client';
import type { HttpError } from '../../shared/http/http-client';
import { createSterlingXmlParser, ensureArray } from './xml-helpers';
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
  PollOptions,
  Order,
  Shipment,
  OrderInvoice,
  OrderAudit,
} from './types';

// ============================================================================
// Auth Header Builder
// ============================================================================

function buildAuthHeaders(auth: SterlingAuthConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Accept': 'application/xml' };
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
// Query String Builder
// ============================================================================

function buildQueryString(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  );
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries).toString();
}

// ============================================================================
// XML Body Serializer (Sterling XAPI REST format)
// ============================================================================

/**
 * Serialize a JS object to Sterling XML format.
 * Convention: scalar values → XML attributes, objects → child elements, arrays → repeated elements.
 */
function sterlingObjectToXml(obj: Record<string, unknown>, rootElement: string): string {
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
// Sterling Client Implementation
// ============================================================================

class SterlingClientImpl implements SterlingClient {
  private http: HttpClient;
  private parser: ReturnType<typeof createSterlingXmlParser>;
  private baseUrl: string;
  private healthUrl: string;
  private authHeaders: Record<string, string>;
  private timeout: number;
  private inputFormat: 'json' | 'xml';

  constructor(config: SterlingClientConfig) {
    this.http = getHttpClient();
    this.parser = createSterlingXmlParser();
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.healthUrl = config.healthUrl ?? this.baseUrl.replace('/smcfs/restapi', '/smcfs/console/health');
    this.authHeaders = buildAuthHeaders(config.auth);
    this.timeout = config.timeout ?? 30000;
    this.inputFormat = config.inputFormat ?? 'xml';
  }

  async getOrderDetails(params: OrderDetailsParams): Promise<Result<Order, SterlingApiError>> {
    const qs = buildQueryString({
      OrderNo: params.OrderNo,
      DocumentType: params.DocumentType,
    });

    const result = await this.http.get(`${this.baseUrl}/getOrderDetails${qs}`, {
      headers: this.authHeaders,
      timeout: this.timeout,
    });

    if (!result.success) {
      return err(this.toSterlingError(result.error, 'getOrderDetails'));
    }

    return this.parseXmlResponse<Order>(result.value, 'Order', 'getOrderDetails');
  }

  async changeOrder(payload: ChangeOrderInput): Promise<Result<Order, SterlingApiError>> {
    const result = await this.postToSterling(
      `${this.baseUrl}/changeOrder`,
      payload as Record<string, unknown>,
      'Order'
    );

    if (!result.success) {
      return err(this.toSterlingError(result.error, 'changeOrder'));
    }

    return this.parseXmlResponse<Order>(result.value, 'Order', 'changeOrder');
  }

  async createOrder(payload: CreateOrderInput): Promise<Result<Order, SterlingApiError>> {
    const result = await this.postToSterling(
      `${this.baseUrl}/createOrder`,
      payload as Record<string, unknown>,
      'Order'
    );

    if (!result.success) {
      return err(this.toSterlingError(result.error, 'createOrder'));
    }

    return this.parseXmlResponse<Order>(result.value, 'Order', 'createOrder');
  }

  async getOrderAuditList(params: OrderAuditListParams): Promise<Result<OrderAudit[], SterlingApiError>> {
    const auditQuery: Record<string, unknown> = {
      OrderNo: params.OrderNo,
      ...(params.DocumentType ? { DocumentType: params.DocumentType } : {}),
      ...(params.AuditType ? { AuditType: params.AuditType } : {}),
    };

    const result = await this.postToSterling(
      `${this.baseUrl}/getOrderAuditList`,
      auditQuery,
      'OrderAudit'
    );

    if (!result.success) {
      return err(this.toSterlingError(result.error, 'getOrderAuditList'));
    }

    return this.parseXmlListResponse<OrderAudit>(
      result.value,
      (parsed) => ensureArray(parsed?.OrderAudits?.OrderAudit ?? parsed?.OrderAudit),
      'getOrderAuditList'
    );
  }

  async getShipmentList(params: ShipmentListParams): Promise<Result<Shipment[], SterlingApiError>> {
    const qs = buildQueryString({
      OrderNo: params.OrderNo,
      DocumentType: params.DocumentType,
    });

    const result = await this.http.get(`${this.baseUrl}/getShipmentList${qs}`, {
      headers: this.authHeaders,
      timeout: this.timeout,
    });

    if (!result.success) {
      return err(this.toSterlingError(result.error, 'getShipmentList'));
    }

    return this.parseXmlListResponse<Shipment>(
      result.value,
      (parsed) => ensureArray(parsed?.Shipments?.Shipment ?? parsed?.Shipment),
      'getShipmentList'
    );
  }

  async getOrderInvoiceDetails(params: InvoiceParams): Promise<Result<OrderInvoice[], SterlingApiError>> {
    const qs = buildQueryString({
      OrderNo: params.OrderNo,
      DocumentType: params.DocumentType,
    });

    const result = await this.http.get(`${this.baseUrl}/getOrderInvoiceDetails${qs}`, {
      headers: this.authHeaders,
      timeout: this.timeout,
    });

    if (!result.success) {
      return err(this.toSterlingError(result.error, 'getOrderInvoiceDetails'));
    }

    return this.parseXmlListResponse<OrderInvoice>(
      result.value,
      (parsed) => ensureArray(parsed?.OrderInvoiceList?.OrderInvoice ?? parsed?.OrderInvoice),
      'getOrderInvoiceDetails'
    );
  }

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

  // ============================================================================
  // POST Body Handling (JSON / XML)
  // ============================================================================

  private async postToSterling(
    url: string,
    body: Record<string, unknown>,
    rootElement: string
  ): Promise<Result<Response, HttpError>> {
    if (this.inputFormat === 'xml') {
      return this.http.postRaw(
        url,
        sterlingObjectToXml(body, rootElement),
        'application/xml',
        { headers: this.authHeaders, timeout: this.timeout }
      );
    }
    // Sterling JSON format requires root element wrapper: { "Order": { ... } }
    return this.http.post(url, { [rootElement]: body }, {
      headers: this.authHeaders,
      timeout: this.timeout,
    });
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async parseXmlResponse<T>(
    response: Response,
    rootElement: string,
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

      const parsed = this.parser.parse(body);
      const data = parsed?.[rootElement] ?? parsed;
      return ok(data as T);
    } catch (e) {
      return err({
        message: `XML parse failed: ${e instanceof Error ? e.message : String(e)}`,
        apiName,
      });
    }
  }

  private async parseXmlListResponse<T>(
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

      const parsed = this.parser.parse(body);
      return ok(extractor(parsed));
    } catch (e) {
      return err({
        message: `XML parse failed: ${e instanceof Error ? e.message : String(e)}`,
        apiName,
      });
    }
  }

  private toSterlingError(httpError: HttpError, apiName: string): SterlingApiError {
    return {
      message: httpError.message,
      status: httpError.status,
      apiName,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Sterling OMS client. Pass client-specific config —
 * the client implementation is generic across all Sterling instances.
 */
export function createSterlingClient(config: SterlingClientConfig): SterlingClient {
  return new SterlingClientImpl(config);
}
