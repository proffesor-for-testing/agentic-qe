/**
 * Agentic QE v3 - NShift Client
 * Generic NShift carrier management REST client.
 *
 * Supports two access modes:
 *   1. Direct NShift Delivery API (api.unifaun.com/rs-extapi/v1)
 *      Auth: HTTP Basic (apiKeyId:apiKeySecret)
 *      Docs: https://help.unifaun.com/uo-se/en/integrations/integration-via-api.html
 *
 *   2. EAI Hub routing (e.g., apieai.omni-hub.adidas-group.com)
 *      Auth: Configurable (Basic/Bearer/API key per client config)
 *      Endpoints:
 *        /eai/nshift/shippingandreturn/shipment — shipment details
 *        /eai/nshift/shippingandreturn/label    — label PDF retrieval
 *
 * NShift Delivery API endpoints (api.unifaun.com/rs-extapi/v1):
 *   GET  /shipments                            — List/search shipments (max 100 per call)
 *   GET  /shipments/{shipmentId}               — Get shipment details
 *   GET  /shipments/{shipmentId}/prints         — List label PDFs for shipment
 *   GET  /shipments/{shipmentId}/prints/{printId} — Get specific label PDF (binary)
 *   POST /shipments                            — Create + print shipment
 *   DELETE /shipments/{shipmentId}              — Delete shipment
 *
 * NShift Track API (api.nshiftportal.com/track/shipmentdata):
 *   GET /Operational/Shipments/ByBarcode?barcode={trackingNo} — Tracking by barcode
 *   Auth: OAuth 2.0 Client Credentials
 *   Swagger: https://api.nshiftportal.com/track/swagger/index.html
 *
 * Note: Labels are returned as base64-encoded PDF/ZPL and expire after 1 hour.
 * The response envelope for Delivery API is a direct JSON array for GET /shipments
 * and a direct object for GET /shipments/{id}.
 */

import type { Result } from '../../shared/types';
import { ok, err } from '../../shared/types';
import { HttpClient, getHttpClient } from '../../shared/http/http-client';
import type { HttpError } from '../../shared/http/http-client';
import type {
  NShiftClient,
  NShiftClientConfig,
  NShiftShipment,
  NShiftError,
} from './types';

// ============================================================================
// NShift Client Implementation
// ============================================================================

class NShiftClientImpl implements NShiftClient {
  private http: HttpClient;
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;
  private mode: 'direct' | 'eai';

  constructor(config: NShiftClientConfig) {
    this.http = getHttpClient();
    this.timeout = 15000;

    // NShift can be accessed directly or through EAI hub
    if (config.apiHost && config.apiKey) {
      // Direct NShift Delivery API — api.unifaun.com/rs-extapi/v1
      // Auth: HTTP Basic with base64(apiKeyId:apiKeySecret)
      this.mode = 'direct';
      this.baseUrl = config.apiHost.replace(/\/$/, '');
      this.headers = {
        'Authorization': `Basic ${Buffer.from(config.apiKey).toString('base64')}`,
        'Accept': 'application/json',
      };
    } else if (config.eaiHubHost) {
      // EAI hub routing — Adidas and other clients route NShift through their EAI layer
      this.mode = 'eai';
      this.baseUrl = config.eaiHubHost.replace(/\/$/, '');
      this.headers = this.buildEaiHeaders(config);
    } else {
      throw new Error('NShift client requires either apiHost+apiKey or eaiHubHost');
    }
  }

  async getShipmentDetails(trackingNo: string): Promise<Result<NShiftShipment, NShiftError>> {
    // Direct API: GET /rs-extapi/v1/shipments?reference={trackingNo}&fetchId=-1
    // EAI hub:    GET /eai/nshift/shippingandreturn/shipment?trackingNumber={trackingNo}
    const url = this.mode === 'direct'
      ? `${this.baseUrl}/rs-extapi/v1/shipments?reference=${encodeURIComponent(trackingNo)}&fetchId=-1`
      : `${this.baseUrl}/eai/nshift/shippingandreturn/shipment?trackingNumber=${encodeURIComponent(trackingNo)}`;

    const result = await this.http.get(url, {
      headers: this.headers,
      timeout: this.timeout,
    });

    if (!result.success) {
      return err(this.toNShiftError(result.error));
    }

    return this.parseShipmentResponse(result.value, trackingNo);
  }

  async getLabelUrl(trackingNo: string): Promise<Result<string, NShiftError>> {
    if (this.mode === 'direct') {
      // Direct API: First get shipment, then get prints list
      // GET /rs-extapi/v1/shipments?reference={trackingNo}&fetchId=-1&returnFile=false
      const shipResult = await this.http.get(
        `${this.baseUrl}/rs-extapi/v1/shipments?reference=${encodeURIComponent(trackingNo)}&fetchId=-1`,
        { headers: this.headers, timeout: this.timeout }
      );

      if (!shipResult.success) {
        return err(this.toNShiftError(shipResult.error));
      }

      return this.parseLabelFromShipment(shipResult.value, trackingNo);
    }

    // EAI hub: Confirmed endpoint /eai/nshift/shippingandreturn/label
    const result = await this.http.get(
      `${this.baseUrl}/eai/nshift/shippingandreturn/label?trackingNumber=${encodeURIComponent(trackingNo)}`,
      { headers: this.headers, timeout: this.timeout }
    );

    if (!result.success) {
      return err(this.toNShiftError(result.error));
    }

    return this.parseEaiLabelResponse(result.value);
  }

  async getLabelPdf(trackingNo: string): Promise<Result<Buffer, NShiftError>> {
    // Step 1: Get the label URL
    const urlResult = await this.getLabelUrl(trackingNo);
    if (!urlResult.success) {
      return err(urlResult.error);
    }

    // Step 2: Fetch the PDF binary from the label URL
    // NShift label URLs are time-limited (1 hour) and return PDF or ZPL binary
    try {
      const pdfResponse = await fetch(urlResult.value, {
        headers: { 'Accept': 'application/pdf' },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!pdfResponse.ok) {
        return err({ message: `Label PDF fetch failed: HTTP ${pdfResponse.status}`, status: pdfResponse.status });
      }

      const arrayBuffer = await pdfResponse.arrayBuffer();
      return ok(Buffer.from(arrayBuffer));
    } catch (e) {
      return err({ message: `Label PDF fetch error: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  async healthCheck(): Promise<boolean> {
    if (this.mode === 'direct') {
      // Delivery API: a minimal GET /shipments with fetchId=-1 returns 200 with empty array
      return this.http.healthCheck(
        `${this.baseUrl}/rs-extapi/v1/shipments?fetchId=-1`
      );
    }
    // EAI hub: try a lightweight GET to the shipment endpoint — 400 (missing param) still
    // proves connectivity; only network errors (timeout, ECONNREFUSED) mean unreachable.
    try {
      const result = await this.http.get(
        `${this.baseUrl}/eai/nshift/shippingandreturn/shipment`,
        { headers: this.headers, timeout: 5000 }
      );
      // Any HTTP response (even 400/404) means the service is reachable
      return result.success || (!!result.error && !!result.error.status);
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async parseShipmentResponse(
    response: Response,
    trackingNo: string
  ): Promise<Result<NShiftShipment, NShiftError>> {
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      return err({
        message: `HTTP ${response.status}: ${response.statusText}${errorBody ? ` — ${errorBody.slice(0, 500)}` : ''}`,
        status: response.status,
      });
    }

    try {
      const body = await response.json();

      if (this.mode === 'direct') {
        // Delivery API returns an array of shipments (max 100 per call)
        const shipments = Array.isArray(body) ? body : [body];
        if (shipments.length === 0) {
          return err({ message: `No shipment found for tracking ${trackingNo}` });
        }
        const s = shipments[0];
        return ok({
          trackingNo: s.shipmentNo ?? s.orderNo ?? trackingNo,
          carrier: {
            name: s.serviceId ?? s.carrier ?? '',
            code: s.serviceId ?? '',
          },
          receiver: {
            name: s.receiver?.name ?? '',
            address1: s.receiver?.address1 ?? '',
            zipCode: s.receiver?.zipcode ?? '',
            city: s.receiver?.city ?? '',
            country: s.receiver?.country ?? '',
          },
          labelUrl: s.prints?.[0]?.href ?? undefined,
          status: s.status ?? 'unknown',
        });
      }

      // EAI hub — response shape depends on the specific EAI wrapper
      const data = body?.results?.[0] ?? body?.data ?? body;
      return ok(data as NShiftShipment);
    } catch (e) {
      return err({
        message: `JSON parse failed (getShipmentDetails): ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  private async parseLabelFromShipment(
    response: Response,
    trackingNo: string
  ): Promise<Result<string, NShiftError>> {
    if (!response.ok) {
      return err({
        message: `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
      });
    }

    try {
      const body = await response.json();
      const shipments = Array.isArray(body) ? body : [body];
      if (shipments.length === 0) {
        return err({ message: `No shipment found for tracking ${trackingNo}` });
      }

      // Each shipment has a prints[] array with { id, href } entries
      // The href is the URL to download the PDF (valid for 1 hour)
      const prints = shipments[0].prints ?? [];
      if (prints.length === 0) {
        return err({ message: 'Shipment has no label documents' });
      }

      const labelUrl = prints[0].href ?? '';
      if (!labelUrl) {
        return err({ message: 'Label print entry has no href URL' });
      }

      return ok(labelUrl as string);
    } catch (e) {
      return err({ message: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  private async parseEaiLabelResponse(response: Response): Promise<Result<string, NShiftError>> {
    if (!response.ok) {
      return err({
        message: `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
      });
    }

    try {
      const body = await response.json();
      const url = body?.labelUrl ?? body?.url ?? body?.href ?? '';
      if (!url) {
        return err({ message: 'No label URL in EAI response' });
      }
      return ok(url as string);
    } catch (e) {
      return err({ message: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  private buildEaiHeaders(config: NShiftClientConfig): Record<string, string> {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (config.eaiAuth) {
      switch (config.eaiAuth.method) {
        case 'basic': {
          const encoded = Buffer.from(
            `${config.eaiAuth.username ?? ''}:${config.eaiAuth.password ?? ''}`
          ).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
          break;
        }
        case 'bearer':
          headers['Authorization'] = `Bearer ${config.eaiAuth.token ?? ''}`;
          break;
        case 'apikey':
          headers[config.eaiAuth.headerName ?? 'X-API-Key'] = config.eaiAuth.token ?? '';
          break;
      }
    }
    return headers;
  }

  private toNShiftError(httpError: HttpError): NShiftError {
    return {
      message: httpError.message,
      status: httpError.status,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a NShift carrier management client.
 *
 * Direct API mode:
 *   config.apiHost = 'https://api.unifaun.com' (or demo.shipmentserver.com for test)
 *   config.apiKey = 'apiKeyId:apiKeySecret' (colon-separated, used as HTTP Basic auth)
 *
 * EAI hub mode (Adidas and similar clients):
 *   config.eaiHubHost = 'https://apieai.omni-hub.adidas-group.com'
 *   config.eaiAuth = { method: 'basic', username: '...', password: '...' }
 */
export function createNShiftClient(config: NShiftClientConfig): NShiftClient {
  return new NShiftClientImpl(config);
}
