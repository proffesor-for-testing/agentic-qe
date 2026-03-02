/**
 * Tests for recoverCreditNote() in recovery-playbook.ts.
 * Uses mock XAPI client to test the recovery logic without Sterling.
 */

import { describe, it, expect } from 'vitest';
import type { XAPIClient } from '../../../../src/integrations/sterling/types';

function createMockXAPIClient(responses: Record<string, { success: boolean; body: string; error?: string }>): XAPIClient {
  return {
    invoke: async (apiName: string, _xml: string) => {
      const resp = responses[apiName];
      if (!resp) return { success: false, body: '', error: `Unmocked API: ${apiName}` };
      return resp;
    },
    close: async () => {},
  } as unknown as XAPIClient;
}

describe('recoverCreditNote', () => {
  it('returns recovered=true when return invoice already exists on return order', async () => {
    const { recoverCreditNote } = await import('../../../../src/clients/adidas/recovery-playbook');

    const client = createMockXAPIClient({
      getOrderInvoiceList: {
        success: true,
        body: '<OrderInvoiceList><OrderInvoice InvoiceNo="RET-001" InvoiceType="RETURN"/></OrderInvoiceList>',
      },
    });

    const result = await recoverCreditNote(client, 'APT001', 'APT001', 'adidas_PT');

    expect(result.success).toBe(true);
    expect(result.value.recovered).toBe(true);
    expect(result.value.strategy).toBe('fix-credit-note');
    expect(result.value.details).toContain('RET-001');
  });

  it('returns recovered=true when return invoice exists on sales order', async () => {
    const { recoverCreditNote } = await import('../../../../src/clients/adidas/recovery-playbook');

    let callCount = 0;
    const client = {
      invoke: async (apiName: string, xml: string) => {
        if (apiName === 'getOrderInvoiceList') {
          callCount++;
          // First call (return order) — no return invoice
          if (callCount === 1) {
            return { success: true, body: '<OrderInvoiceList TotalNumberOfRecords="0"/>' };
          }
          // Second call (sales order) — has CREDIT_MEMO
          return {
            success: true,
            body: '<OrderInvoiceList><OrderInvoice InvoiceNo="CM-001" InvoiceType="CREDIT_MEMO"/></OrderInvoiceList>',
          };
        }
        return { success: false, body: '', error: 'unexpected' };
      },
      close: async () => {},
    } as unknown as XAPIClient;

    const result = await recoverCreditNote(client, 'APT001', 'APT001-RET', 'adidas_PT');

    expect(result.success).toBe(true);
    expect(result.value.recovered).toBe(true);
    expect(result.value.details).toContain('CM-001');
  });

  it('returns recovered=false when no shipments found', async () => {
    const { recoverCreditNote } = await import('../../../../src/clients/adidas/recovery-playbook');

    const client = {
      invoke: async (apiName: string) => {
        if (apiName === 'getOrderInvoiceList') {
          return { success: true, body: '<OrderInvoiceList TotalNumberOfRecords="0"/>' };
        }
        if (apiName === 'getShipmentListForOrder') {
          return { success: true, body: '<ShipmentList TotalNumberOfRecords="0"/>' };
        }
        return { success: false, body: '', error: 'unexpected' };
      },
      close: async () => {},
    } as unknown as XAPIClient;

    const result = await recoverCreditNote(client, 'APT001', 'APT001', 'adidas_PT');

    expect(result.success).toBe(true);
    expect(result.value.recovered).toBe(false);
    expect(result.value.details).toContain('No shipments found');
  });

  it('returns recovered=false when no task in queue for shipment', async () => {
    const { recoverCreditNote } = await import('../../../../src/clients/adidas/recovery-playbook');

    const client = {
      invoke: async (apiName: string) => {
        if (apiName === 'getOrderInvoiceList') {
          return { success: true, body: '<OrderInvoiceList TotalNumberOfRecords="0"/>' };
        }
        if (apiName === 'getShipmentListForOrder') {
          return { success: true, body: '<ShipmentList><Shipment ShipmentKey="SK1"/></ShipmentList>' };
        }
        if (apiName === 'manageTaskQueue') {
          return { success: true, body: '<TaskQueueList TotalNumberOfRecords="0"/>' };
        }
        return { success: false, body: '', error: 'unexpected' };
      },
      close: async () => {},
    } as unknown as XAPIClient;

    const result = await recoverCreditNote(client, 'APT001', 'APT001', 'adidas_PT');

    expect(result.success).toBe(true);
    expect(result.value.recovered).toBe(false);
    expect(result.value.details).toContain('No task in YFS_TASK_Q');
  });

  it('handles errors gracefully', async () => {
    const { recoverCreditNote } = await import('../../../../src/clients/adidas/recovery-playbook');

    const client = {
      invoke: async () => {
        throw new Error('Connection refused');
      },
      close: async () => {},
    } as unknown as XAPIClient;

    const result = await recoverCreditNote(client, 'APT001', 'APT001', 'adidas_PT');

    expect(result.success).toBe(true); // ok() wrapper
    expect(result.value.recovered).toBe(false);
    expect(result.value.details).toContain('Connection refused');
  });
});
