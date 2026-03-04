/**
 * Agentic QE v3 - NShift Client Types
 * Generic NShift carrier management types.
 * Reusable across all clients using NShift for shipment tracking.
 *
 * Build decision: During Phase 0, check whether Sterling's getShipmentList
 * already returns tracking data, carrier codes, and label URLs via extension
 * attributes. If it does, NShift client is redundant.
 */

import type { Result } from '../../shared/types';

// ============================================================================
// NShift Client Interface
// ============================================================================

export interface NShiftClient {
  getShipmentDetails(trackingNo: string): Promise<Result<NShiftShipment, NShiftError>>;
  getLabelUrl(trackingNo: string): Promise<Result<string, NShiftError>>;
  getLabelPdf(trackingNo: string): Promise<Result<Buffer, NShiftError>>;
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// Response Types
// ============================================================================

export interface NShiftShipment {
  trackingNo: string;
  carrier: {
    name: string;
    code: string;
  };
  receiver: {
    name: string;
    address1: string;
    zipCode: string;
    city: string;
    country: string;
  };
  labelUrl?: string;
  status: string;
}

// ============================================================================
// Error Types
// ============================================================================

export interface NShiftError {
  message: string;
  status?: number;
}

// ============================================================================
// Configuration
// ============================================================================

export interface NShiftClientConfig {
  // Direct NShift Delivery API (api.unifaun.com/rs-extapi/v1)
  // Auth: HTTP Basic with base64(apiKeyId:apiKeySecret)
  apiHost?: string;                    // e.g., 'https://api.unifaun.com'
  apiKey?: string;                     // Format: 'apiKeyId:apiKeySecret' (colon-separated)

  // EAI hub routing (some clients route NShift through their EAI layer)
  eaiHubHost?: string;                 // e.g., 'https://apieai.omni-hub.adidas-group.com'
  eaiAuth?: {
    method: 'basic' | 'bearer' | 'apikey';
    username?: string;
    password?: string;
    token?: string;
    headerName?: string;
  };
}
