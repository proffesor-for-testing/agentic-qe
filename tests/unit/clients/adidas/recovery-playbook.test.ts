/**
 * Recovery Playbook Unit Tests
 * Tests the invoice delay recovery with mocked XAPIClient (Playwright JSP).
 *
 * v3.2 improvements:
 *   - Backdate verification: retry once, abort if still future (not just log)
 *   - executeTask API probe: force immediate task execution
 *   - Adaptive poll backoff: 5s → 30s cap, wall-clock 600s budget
 *   - Shared verifyBackdateAndKick helper (no duplication)
 *
 * NOTE: Tests use vi.useFakeTimers() to avoid real delays.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  recoverInvoiceGeneration,
  recoverCreditNote,
  nextPollInterval,
  INVOICE_POLL_INITIAL_MS,
  INVOICE_POLL_MAX_MS,
  INVOICE_POLL_BUDGET_MS,
  INVOICE_POLL_KICKED_BUDGET_MS,
} from '../../../../src/clients/adidas/recovery-playbook';
import type { XAPIClient, XAPIResponse } from '../../../../src/integrations/sterling/types';

// ============================================================================
// Mock Builder — dispatches by serviceName + XML content (not call order)
// ============================================================================

function xapiOk(body: string): XAPIResponse {
  return { success: true, body, status: 200, duration: 50, retries: 0 };
}

function xapiErr(error: string): XAPIResponse {
  return { success: false, body: '', status: 500, duration: 50, retries: 0, error };
}

type InvokeHandler = (service: string, xml: string) => XAPIResponse;

/**
 * Build a mock XAPIClient dispatching by serviceName + XML content.
 * For manageTaskQueue: XML containing AvailableDate= is an UPDATE,
 * XML without it is a QUERY. This avoids fragile call-count coupling.
 */
function buildMockXapi(handler: InvokeHandler): XAPIClient {
  const invoke = vi.fn().mockImplementation(
    (svc: string, xml: string) => Promise.resolve(handler(svc, xml)),
  );
  return { invoke, invokeOrThrow: invoke };
}

/** Default happy-path handler: backdate persists, invoice found on first poll. */
function happyPathHandler(overrides?: Partial<Record<string, InvokeHandler>>): InvokeHandler {
  const pastDate = '2026-03-01 12:00:00.000';

  return (service, xml) => {
    // Allow per-service overrides
    if (overrides?.[service]) return overrides[service]!(service, xml);

    switch (service) {
      case 'getShipmentListForOrder':
        return xapiOk('<Shipment ShipmentKey="SK-001" ShipmentNo="SN-001" Status="3700"/>');

      case 'manageTaskQueue':
        // UPDATE call: XML contains AvailableDate= attribute being SET
        if (xml.includes('AvailableDate=') && xml.includes('TaskQKey=')) {
          return xapiOk('<TaskQueue/>');
        }
        // QUERY call: return task with past date (backdate already persisted)
        return xapiOk(`<TaskQueue TaskQKey="TQ-001" AvailableDate="${pastDate}" DataKey="SK-001"/>`);

      case 'executeTask':
        return xapiErr('API not available on this deployment');

      case 'changeAvailDateInTaskQueue':
        return xapiOk('<TaskQueue/>');

      case 'getOrderInvoiceList':
        return xapiOk('<OrderInvoice InvoiceNo="INV-001" InvoiceType="INVOICE" TotalAmount="120.00"/>');

      case 'processOrderPayments':
        return xapiOk('<Order OrderNo="APT123"/>');

      case 'getOrderList':
        return xapiOk('<Order PaymentStatus="INVOICED" Status="3700"/>');

      default:
        return xapiErr(`Unknown service: ${service}`);
    }
  };
}

// ============================================================================
// recoverInvoiceGeneration — core flow
// ============================================================================

describe('recoverInvoiceGeneration', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('succeeds when full flow completes', async () => {
    const client = buildMockXapi(happyPathHandler());

    const promise = recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');
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
    const client = buildMockXapi(happyPathHandler({
      getShipmentListForOrder: () => xapiOk('<Shipments/>'),
    }));

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
    const client = buildMockXapi(happyPathHandler({
      manageTaskQueue: () => xapiOk('<TaskQueue/>'),
    }));

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
    const client = buildMockXapi(happyPathHandler({
      getShipmentListForOrder: () => xapiErr('Connection refused'),
    }));

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
    const client = buildMockXapi(happyPathHandler({
      manageTaskQueue: (_svc, xml) => {
        // UPDATE call fails
        if (xml.includes('AvailableDate=') && xml.includes('TaskQKey=')) {
          return xapiErr('HTTP 400');
        }
        // QUERY calls succeed with past date
        return xapiOk('<TaskQueue TaskQKey="TQ-001" AvailableDate="2026-03-01 12:00:00.000"/>');
      },
    }));

    const promise = recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(client.invoke).toHaveBeenCalledWith('changeAvailDateInTaskQueue', expect.any(String));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.recovered).toBe(true);
    }
  });
});

// ============================================================================
// Adaptive Poll Backoff
// ============================================================================

describe('nextPollInterval — adaptive backoff', () => {
  it('starts at INVOICE_POLL_INITIAL_MS for attempt 0', () => {
    expect(nextPollInterval(0)).toBe(INVOICE_POLL_INITIAL_MS);
  });

  it('grows by backoff factor each attempt', () => {
    const first = nextPollInterval(0);
    const second = nextPollInterval(1);
    expect(second).toBeCloseTo(first * 1.5, 0);
  });

  it('caps at INVOICE_POLL_MAX_MS and never exceeds it', () => {
    for (let i = 10; i < 50; i++) {
      expect(nextPollInterval(i)).toBe(INVOICE_POLL_MAX_MS);
    }
  });

  it('reaches cap at attempt 5 (5000 * 1.5^5 = 37968 > 30000)', () => {
    expect(nextPollInterval(4)).toBeLessThan(INVOICE_POLL_MAX_MS);
    expect(nextPollInterval(5)).toBe(INVOICE_POLL_MAX_MS);
  });

  it('exhausts 600s budget in 20-25 sleep-only polls', () => {
    let total = 0;
    let attempt = 0;
    while (total < INVOICE_POLL_BUDGET_MS) {
      total += nextPollInterval(attempt);
      attempt++;
    }
    expect(attempt).toBeGreaterThan(15);
    expect(attempt).toBeLessThan(30);
  });
});

// ============================================================================
// Backdate Verification — actionable (retry + abort)
// ============================================================================

describe('recoverInvoiceGeneration — backdate verification', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('logs "Backdate verified" when read-back shows past date', async () => {
    const client = buildMockXapi(happyPathHandler());

    const promise = recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.details).toContain('Backdate verified');
      expect(result.value.details).not.toContain('BACKDATE NOT PERSISTED');
    }
  });

  it('retries backdate once when read-back shows future date', async () => {
    let manageUpdateCalls = 0;

    const client = buildMockXapi(happyPathHandler({
      manageTaskQueue: (_svc, xml) => {
        // UPDATE calls
        if (xml.includes('AvailableDate=') && xml.includes('TaskQKey=')) {
          manageUpdateCalls++;
          return xapiOk('<TaskQueue/>');
        }
        // QUERY calls: always return future date (backdate never persists)
        return xapiOk('<TaskQueue TaskQKey="TQ-001" AvailableDate="2099-12-31 23:59:59.000"/>');
      },
      executeTask: () => xapiErr('not available'),
      getOrderInvoiceList: () => xapiOk('<OrderInvoiceList TotalNumberOfRecords="0"/>'),
    }));

    const promise = recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.recovered).toBe(false);
      // Should have retried the backdate (original + 1 retry = 2 update calls)
      expect(manageUpdateCalls).toBe(2);
      expect(result.value.details).toContain('BACKDATE NOT PERSISTED');
      // The key behavior: aborts immediately, doesn't burn 600s polling
      expect(result.value.details).toContain('Aborting');
    }
  });

  it('aborts immediately when backdate fails and executeTask unavailable', async () => {
    const client = buildMockXapi(happyPathHandler({
      manageTaskQueue: (_svc, xml) => {
        if (xml.includes('AvailableDate=') && xml.includes('TaskQKey=')) {
          return xapiOk('<TaskQueue/>');
        }
        return xapiOk('<TaskQueue TaskQKey="TQ-001" AvailableDate="2099-12-31 23:59:59.000"/>');
      },
      executeTask: () => xapiErr('not available'),
      getOrderInvoiceList: () => xapiOk('<OrderInvoiceList TotalNumberOfRecords="0"/>'),
    }));

    const promise = recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.recovered).toBe(false);
      // Must NOT contain poll evidence — aborted before polling
      expect(result.value.details).not.toContain('polls');
      expect(result.value.details).toContain('Aborting');
    }
  });

  it('proceeds to poll when backdate fails but executeTask succeeds', async () => {
    const client = buildMockXapi(happyPathHandler({
      manageTaskQueue: (_svc, xml) => {
        if (xml.includes('AvailableDate=') && xml.includes('TaskQKey=')) {
          return xapiOk('<TaskQueue/>');
        }
        // Read-back always shows future (backdate not persisted)
        return xapiOk('<TaskQueue TaskQKey="TQ-001" AvailableDate="2099-12-31 23:59:59.000"/>');
      },
      executeTask: () => xapiOk('<TaskQueue Status="EXECUTED"/>'),
    }));

    const promise = recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    if (result.success) {
      // executeTask saved us — should still recover via poll
      expect(result.value.details).toContain('executeTask succeeded');
      expect(result.value.recovered).toBe(true);
    }
  });
});

// ============================================================================
// executeTask API Probe
// ============================================================================

describe('recoverInvoiceGeneration — executeTask probe', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('records "executeTask succeeded" when API returns success', async () => {
    const client = buildMockXapi(happyPathHandler({
      executeTask: () => xapiOk('<TaskQueue TaskQKey="TQ-001" Status="EXECUTED"/>'),
    }));

    const promise = recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.details).toContain('executeTask succeeded');
      expect(result.value.recovered).toBe(true);
    }
  });

  it('uses shorter poll budget when executeTask succeeds', async () => {
    let pollCalls = 0;

    const client = buildMockXapi(happyPathHandler({
      executeTask: () => xapiOk('<TaskQueue Status="EXECUTED"/>'),
      getOrderInvoiceList: () => {
        pollCalls++;
        return xapiOk('<OrderInvoiceList TotalNumberOfRecords="0"/>');
      },
    }));

    const promise = recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.recovered).toBe(false);
      // 60s kicked budget: ~5-8 polls (not 20+)
      expect(pollCalls).toBeLessThan(15);
      expect(pollCalls).toBeGreaterThan(2);
    }
  });
});

// ============================================================================
// recoverCreditNote — same verifyBackdateAndKick behavior
// ============================================================================

describe('recoverCreditNote — backdate verification + executeTask', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('verifies backdate and reports in credit note recovery', async () => {
    const pastDate = '2026-03-01 12:00:00.000';

    const client = buildMockXapi((service, xml) => {
      if (service === 'getOrderInvoiceList') {
        // Step 1: No existing return invoice
        return xapiOk('<OrderInvoiceList TotalNumberOfRecords="0"/>');
      }
      if (service === 'getShipmentListForOrder') {
        return xapiOk('<Shipment ShipmentKey="SK-789"/>');
      }
      if (service === 'manageTaskQueue') {
        if (xml.includes('AvailableDate=') && xml.includes('TaskQKey=')) {
          return xapiOk('<TaskQueue/>');
        }
        return xapiOk(`<TaskQueue TaskQKey="TQ-999" AvailableDate="${pastDate}"/>`);
      }
      if (service === 'executeTask') return xapiErr('Not available');
      return xapiOk('<OK/>');
    });

    const promise = recoverCreditNote(client, 'APT111', 'APT111', 'adidas_PT');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.details).toContain('Backdate verified');
      expect(result.value.details).toContain('executeTask not available');
    }
  });

  it('aborts when backdate fails and executeTask unavailable (credit note)', async () => {
    const client = buildMockXapi((service, xml) => {
      if (service === 'getOrderInvoiceList') {
        return xapiOk('<OrderInvoiceList TotalNumberOfRecords="0"/>');
      }
      if (service === 'getShipmentListForOrder') {
        return xapiOk('<Shipment ShipmentKey="SK-789"/>');
      }
      if (service === 'manageTaskQueue') {
        if (xml.includes('AvailableDate=') && xml.includes('TaskQKey=')) {
          return xapiOk('<TaskQueue/>');
        }
        // Always future — backdate never persists
        return xapiOk('<TaskQueue TaskQKey="TQ-999" AvailableDate="2099-12-31 23:59:59.000"/>');
      }
      if (service === 'executeTask') return xapiErr('Not available');
      return xapiOk('<OK/>');
    });

    const promise = recoverCreditNote(client, 'APT111', 'APT111', 'adidas_PT');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.recovered).toBe(false);
      expect(result.value.details).toContain('BACKDATE NOT PERSISTED');
      expect(result.value.details).toContain('Aborting');
      // Must NOT have polled — aborted before that
      expect(result.value.details).not.toContain('polls');
    }
  });

  it('finds existing return invoice and short-circuits (no recovery needed)', async () => {
    const client = buildMockXapi((service, xml) => {
      if (service === 'getOrderInvoiceList' && xml.includes('DocumentType="0003"')) {
        return xapiOk('<OrderInvoice InvoiceNo="CRED-001" InvoiceType="RETURN" TotalAmount="50.00"/>');
      }
      return xapiOk('<OK/>');
    });

    const promise = recoverCreditNote(client, 'APT111', 'APT111', 'adidas_PT');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.recovered).toBe(true);
      expect(result.value.details).toContain('Return invoice already exists');
      expect(result.value.details).toContain('CRED-001');
    }
  });
});

// ============================================================================
// Named constants (behavioral — kicked budget is strictly less than full)
// ============================================================================

describe('poll budget constants', () => {
  it('kicked budget is strictly less than full budget', () => {
    expect(INVOICE_POLL_KICKED_BUDGET_MS).toBeLessThan(INVOICE_POLL_BUDGET_MS);
  });

  it('full budget spans at least 2 batch agent cycles (>= 600s)', () => {
    expect(INVOICE_POLL_BUDGET_MS).toBeGreaterThanOrEqual(600_000);
  });

  it('initial interval is faster than max interval', () => {
    expect(INVOICE_POLL_INITIAL_MS).toBeLessThan(INVOICE_POLL_MAX_MS);
  });
});
