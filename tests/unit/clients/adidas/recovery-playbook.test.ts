/**
 * Recovery Playbook Unit Tests
 * Tests the invoice delay recovery with mocked XAPIClient (Playwright JSP).
 *
 * The recovery playbook was refactored from REST SterlingClient to XAPI.
 * All calls go through xapiClient.invoke(serviceName, xmlPayload).
 *
 * NOTE: The recovery function uses sleep() for polling intervals.
 * Tests use vi.useFakeTimers() to avoid real delays.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recoverInvoiceGeneration } from '../../../../src/clients/adidas/recovery-playbook';
import type { XAPIClient, XAPIResponse } from '../../../../src/integrations/sterling/types';

// ============================================================================
// Mock Builder
// ============================================================================

function xapiOk(body: string): XAPIResponse {
  return { success: true, body, status: 200, duration: 50, retries: 0 };
}

function xapiErr(error: string): XAPIResponse {
  return { success: false, body: '', status: 500, duration: 50, retries: 0, error };
}

/**
 * Build a mock XAPIClient where invoke() dispatches by serviceName.
 */
function mockXapiClient(overrides: Partial<Record<string, XAPIResponse>> = {}): XAPIClient {
  const defaults: Record<string, XAPIResponse> = {
    getShipmentListForOrder: xapiOk('<Shipments><Shipment ShipmentKey="SK-001" ShipmentNo="SN-001" Status="3700"/></Shipments>'),
    manageTaskQueue: xapiOk('<TaskQueue TaskQKey="TQ-001" AvailableDate="2099-01-01 00:00:00.000" DataKey="SK-001"/>'),
    getOrderInvoiceList: xapiOk('<OrderInvoiceList><OrderInvoice InvoiceNo="INV-001" InvoiceType="INVOICE" TotalAmount="120.00"/></OrderInvoiceList>'),
    processOrderPayments: xapiOk('<Order OrderNo="APT123"/>'),
    getOrderList: xapiOk('<OrderList><Order OrderNo="APT123" PaymentStatus="INVOICED" Status="3700"/>'),
    changeAvailDateInTaskQueue: xapiOk('<TaskQueue/>'),
  };

  const responses = { ...defaults, ...overrides };
  const callCounts: Record<string, number> = {};

  const invoke = vi.fn().mockImplementation((serviceName: string) => {
    callCounts[serviceName] = (callCounts[serviceName] ?? 0) + 1;

    // manageTaskQueue is called twice: first to query (returns TaskQKey), second to update
    if (serviceName === 'manageTaskQueue' && callCounts[serviceName] === 2) {
      return Promise.resolve(xapiOk('<TaskQueue/>'));
    }

    const resp = responses[serviceName];
    return Promise.resolve(resp ?? xapiErr(`Unknown service: ${serviceName}`));
  });

  return { invoke, invokeOrThrow: invoke };
}

// ============================================================================
// Tests
// ============================================================================

describe('recoverInvoiceGeneration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds when full 6-step flow completes', async () => {
    const client = mockXapiClient();

    const promise = recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');
    // Flush all timers (10s poll sleep + 3s verify sleep)
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.recovered).toBe(true);
      expect(result.value.strategy).toBe('fix-invoice-generation');
      expect(result.value.details).toContain('ShipmentKey: SK-001');
      expect(result.value.details).toContain('TaskQKey: TQ-001');
      expect(result.value.details).toContain('processOrderPayments: triggered');
    }
  });

  it('returns not-recovered when no ShipmentKey in response', async () => {
    const client = mockXapiClient({
      getShipmentListForOrder: xapiOk('<Shipments/>'),
    });

    const promise = recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.recovered).toBe(false);
      expect(result.value.details).toContain('No ShipmentKey found');
    }
  });

  it('returns not-recovered when no task in queue', async () => {
    const client = mockXapiClient({
      manageTaskQueue: xapiOk('<TaskQueue/>'),
    });

    const promise = recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.recovered).toBe(false);
      expect(result.value.details).toContain('No task found');
    }
  });

  it('returns not-recovered when getShipmentListForOrder fails', async () => {
    const client = mockXapiClient({
      getShipmentListForOrder: xapiErr('Connection refused'),
    });

    const promise = recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.recovered).toBe(false);
      expect(result.value.details).toContain('getShipmentListForOrder failed');
    }
  });

  it('tries changeAvailDateInTaskQueue fallback when manageTaskQueue update fails', async () => {
    const callCounts: Record<string, number> = {};
    const invoke = vi.fn().mockImplementation((serviceName: string) => {
      callCounts[serviceName] = (callCounts[serviceName] ?? 0) + 1;

      if (serviceName === 'getShipmentListForOrder') {
        return Promise.resolve(xapiOk('<Shipment ShipmentKey="SK-001"/>'));
      }
      if (serviceName === 'manageTaskQueue') {
        if (callCounts[serviceName] === 1) {
          return Promise.resolve(xapiOk('<TaskQueue TaskQKey="TQ-001" AvailableDate="2099-01-01"/>'));
        }
        return Promise.resolve(xapiErr('HTTP 400'));
      }
      if (serviceName === 'changeAvailDateInTaskQueue') {
        return Promise.resolve(xapiOk('<TaskQueue/>'));
      }
      if (serviceName === 'getOrderInvoiceList') {
        return Promise.resolve(xapiOk('<OrderInvoice InvoiceNo="INV-001" InvoiceType="INVOICE"/>'));
      }
      if (serviceName === 'processOrderPayments') {
        return Promise.resolve(xapiOk('<Order/>'));
      }
      if (serviceName === 'getOrderList') {
        return Promise.resolve(xapiOk('<Order PaymentStatus="INVOICED"/>'));
      }
      return Promise.resolve(xapiErr('unknown'));
    });

    const client: XAPIClient = { invoke, invokeOrThrow: invoke };

    const promise = recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(invoke).toHaveBeenCalledWith('changeAvailDateInTaskQueue', expect.any(String));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.recovered).toBe(true);
    }
  });
});
