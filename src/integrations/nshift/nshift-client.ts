/**
 * Agentic QE v3 - NShift Client (STUB)
 * Generic NShift carrier management REST client.
 *
 * !! STUB WARNING !!
 * All endpoint URLs below are PLACEHOLDERS. NShift's actual API paths, auth
 * scheme, and response shapes must be confirmed against NShift developer docs
 * before this client will work. The structure (interface-driven, Result<T,E>,
 * HttpClient) is production-ready; the URLs are not.
 *
 * TODO before first real use:
 * 1. Get NShift API docs (developer.nshift.com or via Adidas logistics team)
 * 2. Replace placeholder URLs with actual API endpoints
 * 3. Confirm auth method (API key header vs OAuth 2.0 vs session token)
 * 4. Confirm response envelope shape (results[]? data? direct?)
 * 5. Write integration test against NShift sandbox
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
// NShift Client Implementation (STUB — endpoints are placeholders)
// ============================================================================

class NShiftClientImpl implements NShiftClient {
  private http: HttpClient;
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;

  constructor(config: NShiftClientConfig) {
    this.http = getHttpClient();
    this.timeout = 15000;

    // NShift can be accessed directly or through EAI hub
    if (config.apiHost && config.apiKey) {
      this.baseUrl = config.apiHost.replace(/\/$/, '');
      this.headers = {
        'X-API-Key': config.apiKey,         // PLACEHOLDER — confirm actual auth header
        'Accept': 'application/json',
      };
    } else if (config.eaiHubHost) {
      this.baseUrl = config.eaiHubHost.replace(/\/$/, '');
      this.headers = this.buildEaiHeaders(config);
    } else {
      throw new Error('NShift client requires either apiHost+apiKey or eaiHubHost');
    }
  }

  async getShipmentDetails(trackingNo: string): Promise<Result<NShiftShipment, NShiftError>> {
    // EAI hub routing confirmed: apieai.omni-hub.adidas-group.com/eai/nshift/shippingandreturn/label
    // PLACEHOLDER — confirm tracking lookup endpoint with NShift docs (may differ from label endpoint)
    const result = await this.http.get(
      `${this.baseUrl}/eai/nshift/shipments?trackingNumber=${encodeURIComponent(trackingNo)}`,
      { headers: this.headers, timeout: this.timeout }
    );

    if (!result.success) {
      return err(this.toNShiftError(result.error));
    }

    return this.parseJsonResponse<NShiftShipment>(result.value, 'getShipmentDetails');
  }

  async getLabelUrl(trackingNo: string): Promise<Result<string, NShiftError>> {
    // Confirmed EAI hub endpoint: /eai/nshift/shippingandreturn/label
    const result = await this.http.get(
      `${this.baseUrl}/eai/nshift/shippingandreturn/label?trackingNumber=${encodeURIComponent(trackingNo)}`,
      { headers: this.headers, timeout: this.timeout }
    );

    if (!result.success) {
      return err(this.toNShiftError(result.error));
    }

    return this.parseLabelResponse(result.value);
  }

  async healthCheck(): Promise<boolean> {
    return this.http.healthCheck(`${this.baseUrl}/health`);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async parseJsonResponse<T>(
    response: Response,
    apiName: string
  ): Promise<Result<T, NShiftError>> {
    if (!response.ok) {
      // Read error body as text — error responses may not be JSON
      const errorBody = await response.text().catch(() => '');
      return err({
        message: `HTTP ${response.status}: ${response.statusText}${errorBody ? ` — ${errorBody.slice(0, 500)}` : ''}`,
        status: response.status,
      });
    }

    try {
      const body = await response.json();
      // PLACEHOLDER envelope — confirm actual NShift response shape
      const data = body?.results?.[0] ?? body?.data ?? body;
      return ok(data as T);
    } catch (e) {
      return err({
        message: `JSON parse failed (${apiName}): ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  private async parseLabelResponse(response: Response): Promise<Result<string, NShiftError>> {
    if (!response.ok) {
      return err({
        message: `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
      });
    }

    try {
      const body = await response.json();
      const url = body?.labelUrl ?? body?.url ?? '';
      if (!url) {
        return err({ message: 'No label URL in response' });
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
 * Supports direct NShift API access or routing through an EAI hub.
 *
 * WARNING: Endpoint URLs are placeholders. See STUB WARNING at top of file.
 */
export function createNShiftClient(config: NShiftClientConfig): NShiftClient {
  return new NShiftClientImpl(config);
}
