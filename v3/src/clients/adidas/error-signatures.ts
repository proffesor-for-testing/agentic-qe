/**
 * Agentic QE v3 - Adidas Error Signatures
 * Adidas-specific error patterns for TestOutputObserver classification.
 * Used by InfraHealingOrchestrator to identify which service is failing.
 */

// ============================================================================
// Error Signature Type
// ============================================================================

export interface InfraErrorSignature {
  pattern: RegExp;
  service: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

// ============================================================================
// Adidas Error Signatures
// ============================================================================

export const ADIDAS_ERROR_SIGNATURES: InfraErrorSignature[] = [
  {
    pattern: /Sterling.*ECONNREFUSED/i,
    service: 'omnihub-oms',
    severity: 'critical',
  },
  {
    pattern: /IIB.*timeout|MF_ADS.*timeout/i,
    service: 'iib-integration-bus',
    severity: 'high',
  },
  {
    pattern: /EAI.*502|eai.*Bad Gateway/i,
    service: 'eai-hub',
    severity: 'high',
  },
  {
    pattern: /nshift.*ECONNREFUSED|nshift.*timeout/i,
    service: 'nshift-via-eai',
    severity: 'medium',
  },
  {
    pattern: /SAP.*RFC.*connection failed/i,
    service: 'sap-cpi',
    severity: 'medium',
  },
];
