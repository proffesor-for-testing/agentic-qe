/**
 * Sterling OMS Environment Configuration — Adidas O2C POC
 *
 * Manages environment-specific settings for SIT, UAT, PRD.
 *
 * SIT auth: None required — network-level access (VPN/corporate network).
 * UAT/PRD: May require auth headers via env vars.
 */

import type { SterlingConfig } from './sterling-oms-client.js';

// ============================================================================
// Environment Types
// ============================================================================

export type SterlingEnvironment = 'sit' | 'uat' | 'prd';

export interface EnvironmentConfig extends SterlingConfig {
  name: SterlingEnvironment;
  description: string;
  healthEndpoint: string;
  /** Whether destructive operations (changeOrder, etc.) are allowed */
  allowMutations: boolean;
}

// ============================================================================
// Environment Definitions
// ============================================================================

const ENVIRONMENTS: Record<SterlingEnvironment, Omit<EnvironmentConfig, 'authHeaders'>> = {
  sit: {
    name: 'sit',
    description: 'SIT Omni — Staging Integration Test',
    baseUrl: 'https://stgem.omnihub.3stripes.net',
    enterpriseCode: 'adidasEM_TH',
    timeout: 30_000,
    healthEndpoint: 'https://stgem.omnihub.3stripes.net/smcfs/console/health',
    allowMutations: true,
  },
  uat: {
    name: 'uat',
    description: 'UAT Omni — User Acceptance Test',
    baseUrl: 'https://uatgem.omnihub.3stripes.net',
    enterpriseCode: 'adidasEM_TH',
    timeout: 30_000,
    healthEndpoint: 'https://uatgem.omnihub.3stripes.net/smcfs/console/health',
    allowMutations: false,
  },
  prd: {
    name: 'prd',
    description: 'Production Omni — Read-only',
    baseUrl: 'https://gem.omnihub.3stripes.net',
    enterpriseCode: 'adidasEM_TH',
    timeout: 15_000,
    healthEndpoint: 'https://gem.omnihub.3stripes.net/smcfs/console/health',
    allowMutations: false,
  },
};

// ============================================================================
// Config Factory
// ============================================================================

/**
 * Get environment config.
 *
 * SIT requires NO auth — just Content-Type: application/json.
 * Access is gated at network level (VPN/corporate network).
 *
 * Optional env vars (for UAT/PRD or if SIT auth changes):
 *   STERLING_ENV        — sit | uat | prd (default: sit)
 *   STERLING_AUTH_TOKEN  — Bearer token
 *   STERLING_USERNAME    — Basic auth username
 *   STERLING_PASSWORD    — Basic auth password
 *   STERLING_API_KEY     — API key
 */
export function getEnvironmentConfig(env?: SterlingEnvironment): EnvironmentConfig {
  const envName = env ?? (process.env.STERLING_ENV as SterlingEnvironment) ?? 'sit';
  const baseConfig = ENVIRONMENTS[envName];

  if (!baseConfig) {
    throw new Error(`Unknown Sterling environment: ${envName}. Valid: sit, uat, prd`);
  }

  const authHeaders: Record<string, string> = {};

  // Bearer token auth
  if (process.env.STERLING_AUTH_TOKEN) {
    authHeaders['Authorization'] = `Bearer ${process.env.STERLING_AUTH_TOKEN}`;
  }

  // Basic auth
  if (process.env.STERLING_USERNAME && process.env.STERLING_PASSWORD) {
    const credentials = Buffer.from(
      `${process.env.STERLING_USERNAME}:${process.env.STERLING_PASSWORD}`,
    ).toString('base64');
    authHeaders['Authorization'] = `Basic ${credentials}`;
  }

  // API key auth
  if (process.env.STERLING_API_KEY) {
    authHeaders['X-API-Key'] = process.env.STERLING_API_KEY;
  }

  return { ...baseConfig, authHeaders };
}

/**
 * Validate auth config.
 * SIT needs no auth (network-gated). UAT/PRD may require tokens.
 */
export function validateAuthConfig(env?: SterlingEnvironment): string[] {
  const envName = env ?? (process.env.STERLING_ENV as SterlingEnvironment) ?? 'sit';

  // SIT requires no auth — network-level access only
  if (envName === 'sit') {
    return [];
  }

  const hasToken = !!process.env.STERLING_AUTH_TOKEN;
  const hasBasic = !!process.env.STERLING_USERNAME && !!process.env.STERLING_PASSWORD;
  const hasApiKey = !!process.env.STERLING_API_KEY;

  if (!hasToken && !hasBasic && !hasApiKey) {
    return [
      `${envName.toUpperCase()} may require auth. Set one of: STERLING_AUTH_TOKEN, STERLING_USERNAME+STERLING_PASSWORD, or STERLING_API_KEY`,
    ];
  }

  return [];
}
