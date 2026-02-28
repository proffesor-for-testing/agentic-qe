/**
 * Agentic QE v3 - Sterling XAPI HTTP Tester Client
 *
 * Sends XML payloads to the Sterling XAPI HTTP API Tester endpoint.
 * Used for lifecycle operations that require write/mutate access
 * (create order, ship confirm, deliver, return, etc.).
 *
 * Endpoint: POST https://<host>/smcfs/yfshttpapi/yantrahttpapitester.jsp
 * Auth: Basic (always)
 * Body: application/x-www-form-urlencoded with form fields:
 *   YFSEnvironment, YantraMessageGroupId, APIName, IsFlow, InteropType=SYNC, InputXml
 *
 * Unlike the REST client (JSON, read-only), this client:
 *   - Sends XML payloads via form-encoded POST
 *   - Supports write/mutate operations
 *   - Detects Sterling 200-OK-with-error-body responses
 *   - Retries on transient HTTP errors with exponential backoff
 *
 * Ported from the proven Adidas O2C POC implementation.
 */

import type { XAPIClientConfig, XAPIClient, XAPIResponse } from './types';
import type { Result } from '../../shared/types';
import { ok, err } from '../../shared/types';

// ============================================================================
// Known Service Flows
// ============================================================================

/**
 * Services that are "flows" (composite services) vs simple API calls.
 * The XAPI tester JSP needs IsFlow=Y for these.
 */
const KNOWN_SERVICE_FLOWS = new Set([
  'adidasWE_CreateOrderSync',
  'adidasWE_CheckAdyenAsyncResponseSvc',
  'adidasWE_ProcessSHPConfirmation',
  'adidas_UpdateSOAcknowledgmentSvc',
  'adidasWE_ProcessPODUpdate',
  'adidasWE_CreateReturnFromSSRSvc',
  'adidasWE_ProcessReturnPODUpdates',
  'adidasWE_ProcessReturnCompletionUpdateSvc',
]);

function isServiceFlow(serviceName: string): boolean {
  return KNOWN_SERVICE_FLOWS.has(serviceName);
}

// ============================================================================
// Error Detection
// ============================================================================

/**
 * Check if an XML response body contains a Sterling error.
 * Sterling returns 200 OK even for logical errors -- the error is buried in the XML body.
 *
 * Three detection patterns:
 *  1. ErrorDescription attribute: `<Error ... ErrorDescription="..." />`
 *  2. ErrorCode attribute: `<Error ... ErrorCode="..." />`
 *  3. Generic Error element: `<Error>...</Error>`
 */
export function extractSterlingXmlError(xml: string): string | undefined {
  // Pattern 1: ErrorDescription attribute
  const descMatch = xml.match(/ErrorDescription="([^"]+)"/);
  if (descMatch) return descMatch[1];

  // Pattern 2: ErrorCode attribute
  const codeMatch = xml.match(/ErrorCode="([^"]+)"/);
  if (codeMatch) return `Error code: ${codeMatch[1]}`;

  // Pattern 3: Generic Error element with body text
  const errorMatch = xml.match(/<Error[^>]*>(.*?)<\/Error>/s);
  if (errorMatch) return errorMatch[1].trim() || 'Unknown Sterling error';

  return undefined;
}

// ============================================================================
// Helpers
// ============================================================================

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function isNetworkError(error: Error): boolean {
  return (
    error.name === 'AbortError' ||
    error.message.includes('fetch failed') ||
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('ECONNRESET') ||
    error.message.includes('ETIMEDOUT')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// XAPI Client Implementation
// ============================================================================

class XAPIClientImpl implements XAPIClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelay: number;

  constructor(config: XAPIClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 60_000;
    this.maxRetries = config.maxRetries ?? 2;
    this.retryBaseDelay = config.retryBaseDelay ?? 2_000;
    this.authHeader = `Basic ${Buffer.from(
      `${config.username}:${config.password}`,
    ).toString('base64')}`;
  }

  // --------------------------------------------------------------------------
  // Core request method
  // --------------------------------------------------------------------------

  async invoke(serviceName: string, xmlPayload: string): Promise<XAPIResponse> {
    const startTotal = Date.now();
    let lastError: Error | null = null;

    // Build form-encoded body that the XAPI tester JSP expects
    const formBody = new URLSearchParams();
    formBody.append('YFSEnvironment', '');
    formBody.append('YantraMessageGroupId', '');
    formBody.append('APIName', serviceName);
    formBody.append('IsFlow', isServiceFlow(serviceName) ? 'Y' : 'N');
    formBody.append('InteropType', 'SYNC');
    formBody.append('InputXml', xmlPayload);

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Exponential backoff with jitter on retries
      if (attempt > 0) {
        const delay =
          this.retryBaseDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
        await sleep(delay);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: this.authHeader,
          },
          body: formBody.toString(),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const duration = Date.now() - startTotal;

        // Retry on transient HTTP errors
        if (isRetryableStatus(response.status) && attempt < this.maxRetries) {
          lastError = new Error(`HTTP ${response.status} from ${serviceName}`);
          continue;
        }

        // Non-OK HTTP status — throw immediately (not retryable)
        if (!response.ok) {
          const bodyText = await response.text();
          const preview = bodyText.slice(0, 200).replace(/\n/g, ' ');
          throw new Error(
            `HTTP ${response.status} from XAPI ${serviceName} after ${attempt} retries: ${preview}`,
          );
        }

        // Parse 200 response — check for Sterling error-in-body
        const body = await response.text();
        const error = extractSterlingXmlError(body);

        return {
          body,
          status: response.status,
          duration,
          retries: attempt,
          success: !error,
          error,
        };
      } catch (catchErr) {
        clearTimeout(timeoutId);
        lastError =
          catchErr instanceof Error ? catchErr : new Error(String(catchErr));

        // Only retry on network/timeout errors; anything else propagates
        if (!isNetworkError(lastError) || attempt >= this.maxRetries) {
          throw lastError;
        }
      }
    }

    throw (
      lastError ??
      new Error(
        `XAPI ${serviceName} failed after ${this.maxRetries} retries`,
      )
    );
  }

  // --------------------------------------------------------------------------
  // Convenience: invoke and assert success
  // --------------------------------------------------------------------------

  async invokeOrThrow(
    serviceName: string,
    xmlPayload: string,
  ): Promise<XAPIResponse> {
    const result = await this.invoke(serviceName, xmlPayload);
    if (!result.success) {
      throw new Error(
        `XAPI ${serviceName} returned error: ${result.error}\nResponse: ${result.body.slice(0, 500)}`,
      );
    }
    return result;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an XAPI client for Sterling OMS.
 *
 * @returns A Result wrapping the client, or an error if config validation fails.
 *
 * @example
 * ```ts
 * const result = createXAPIClient({
 *   baseUrl: 'https://host/smcfs/yfshttpapi/yantrahttpapitester.jsp',
 *   username: 'admin',
 *   password: 'secret',
 * });
 * if (!result.success) throw new Error(result.error);
 * const response = await result.value.invoke('getOrderDetails', orderXml);
 * ```
 */
export function createXAPIClient(
  config: XAPIClientConfig,
): Result<XAPIClient, string> {
  if (!config.baseUrl) {
    return err('XAPIClientConfig.baseUrl is required');
  }
  if (!config.username || !config.password) {
    return err('XAPIClientConfig.username and password are required');
  }
  return ok(new XAPIClientImpl(config));
}
