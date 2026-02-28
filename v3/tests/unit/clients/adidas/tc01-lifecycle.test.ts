/**
 * TC_01 Lifecycle Definition Tests
 * Validates the Adidas TC_01 lifecycle stages are correctly wired.
 */

import { describe, it, expect } from 'vitest';
import { buildTC01Lifecycle } from '../../../../src/clients/adidas/tc01-lifecycle';
import { tc01Steps } from '../../../../src/clients/adidas/tc01-steps';

describe('buildTC01Lifecycle', () => {
  const stages = buildTC01Lifecycle();

  it('returns 9 lifecycle stages', () => {
    expect(stages).toHaveLength(9);
  });

  it('every stage has required fields', () => {
    for (const stage of stages) {
      expect(stage.id).toBeTruthy();
      expect(stage.name).toBeTruthy();
      expect(stage.description).toBeTruthy();
      expect(Array.isArray(stage.verifyStepIds)).toBe(true);
      expect(['skip', 'manual', 'fail']).toContain(stage.fallback);
    }
  });

  it('stage IDs are unique', () => {
    const ids = stages.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stages are in correct lifecycle order', () => {
    const expectedOrder = [
      'create-order',
      'wait-for-release',
      'confirm-shipment',
      'delivery',
      'forward-invoice',
      'forward-comms',
      'create-return',
      'return-delivery',
      'return-comms',
    ];
    expect(stages.map((s) => s.id)).toEqual(expectedOrder);
  });

  it('action stages have act functions', () => {
    // All write stages now have act functions (XAPI primary, REST fallback)
    const actionStageIds = ['create-order', 'wait-for-release', 'confirm-shipment', 'delivery', 'create-return', 'return-delivery'];
    for (const id of actionStageIds) {
      const stage = stages.find((s) => s.id === id);
      expect(stage?.act, `${id} should have an act function`).toBeDefined();
    }
  });

  it('XAPI-driven stages have both act and poll', () => {
    // These stages now actively drive transitions via XAPI (or skip if XAPI not available)
    const xapiDrivenIds = ['wait-for-release', 'delivery', 'return-delivery'];
    for (const id of xapiDrivenIds) {
      const stage = stages.find((s) => s.id === id);
      expect(stage?.act, `${id} should have an act function (XAPI-driven)`).toBeDefined();
      expect(stage?.poll, `${id} should have a poll function`).toBeDefined();
    }
  });

  it('forward-invoice is poll-only (invoice is auto-generated)', () => {
    const stage = stages.find((s) => s.id === 'forward-invoice');
    expect(stage?.act, 'forward-invoice should NOT have an act function').toBeUndefined();
    expect(stage?.poll, 'forward-invoice should have a poll function').toBeDefined();
  });

  it('verify-only stages have neither act nor poll', () => {
    const verifyOnlyIds = ['forward-comms', 'return-comms'];
    for (const id of verifyOnlyIds) {
      const stage = stages.find((s) => s.id === id);
      expect(stage?.act, `${id} should NOT have an act function`).toBeUndefined();
      expect(stage?.poll, `${id} should NOT have a poll function`).toBeUndefined();
    }
  });

  it('action stages have fallback: "manual"', () => {
    const writeStageIds = ['create-order', 'confirm-shipment', 'create-return'];
    for (const id of writeStageIds) {
      const stage = stages.find((s) => s.id === id);
      expect(stage?.fallback, `${id} should fallback to manual`).toBe('manual');
    }
  });

  it('non-write stages have fallback: "skip"', () => {
    const skipFallbackIds = ['forward-invoice', 'forward-comms', 'return-comms'];
    for (const id of skipFallbackIds) {
      const stage = stages.find((s) => s.id === id);
      expect(stage?.fallback, `${id} should fallback to skip`).toBe('skip');
    }
  });

  it('XAPI-driven poll stages have fallback: "skip"', () => {
    const xapiDrivenIds = ['wait-for-release', 'delivery', 'return-delivery'];
    for (const id of xapiDrivenIds) {
      const stage = stages.find((s) => s.id === id);
      expect(stage?.fallback, `${id} should fallback to skip`).toBe('skip');
    }
  });

  it('create-order stage references step-01 for verification', () => {
    const stage = stages.find((s) => s.id === 'create-order');
    expect(stage?.verifyStepIds).toContain('step-01');
  });

  it('confirm-shipment stage references IIB and shipment verification steps', () => {
    const stage = stages.find((s) => s.id === 'confirm-shipment');
    expect(stage?.verifyStepIds).toContain('step-08'); // Shipment with tracking
    expect(stage?.verifyStepIds).toContain('step-09'); // NShift carrier details
  });

  it('return stages reference return flow verification steps', () => {
    const createReturn = stages.find((s) => s.id === 'create-return');
    expect(createReturn?.verifyStepIds).toContain('step-15');

    const returnDelivery = stages.find((s) => s.id === 'return-delivery');
    expect(returnDelivery?.verifyStepIds).toContain('step-25');
    expect(returnDelivery?.verifyStepIds).toContain('step-26');
  });

  it('accepts custom test data', () => {
    const customStages = buildTC01Lifecycle({
      enterpriseCode: 'CUSTOM',
      sellerOrganizationCode: 'CUSTOM_US',
      items: [{ itemId: 'CUSTOM-001', quantity: '3' }],
      shipTo: {
        firstName: 'Custom',
        lastName: 'User',
        addressLine1: '123 Custom St',
        city: 'New York',
        zipCode: '10001',
        country: 'US',
      },
    });

    expect(customStages).toHaveLength(9);
    expect(customStages[0].id).toBe('create-order');
  });

  it('total verification step references cover core TC_01 step IDs', () => {
    const allVerifyIds = stages.flatMap((s) => s.verifyStepIds);
    // Forward flow core steps
    expect(allVerifyIds).toContain('step-01');
    expect(allVerifyIds).toContain('step-02');
    expect(allVerifyIds).toContain('step-08');
    expect(allVerifyIds).toContain('step-12');
    // Return flow core steps
    expect(allVerifyIds).toContain('step-15');
    expect(allVerifyIds).toContain('step-25');
    expect(allVerifyIds).toContain('step-26');
  });

  // Fix #4 validation: every verifyStepId must exist in tc01Steps
  it('every verifyStepId references an actual step definition in tc01Steps', () => {
    const validStepIds = new Set(tc01Steps.map((s) => s.id));
    const allVerifyIds = stages.flatMap((s) => s.verifyStepIds);

    const missing = allVerifyIds.filter((id) => !validStepIds.has(id));
    expect(missing, `These step IDs are referenced in lifecycle but don't exist in tc01Steps: ${missing.join(', ')}`).toEqual([]);
  });
});
