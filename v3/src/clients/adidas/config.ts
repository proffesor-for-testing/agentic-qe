/**
 * Agentic QE v3 - Adidas Client Configuration
 * Maps Adidas environment variables to generic adapter configs.
 * This is the ONLY file that knows about Adidas env var naming conventions.
 */

import type { SterlingClientConfig } from '../../integrations/sterling/types';
import type { MQBrowseConfig } from '../../integrations/iib/types';
import type { NShiftClientConfig } from '../../integrations/nshift/types';

// ============================================================================
// Adidas Client Config Shape
// ============================================================================

export interface AdidasClientConfig {
  sterling: SterlingClientConfig;
  mqBrowse: {
    enabled: boolean;
    config?: MQBrowseConfig;
  };
  nshift: {
    enabled: boolean;
    config?: NShiftClientConfig;
  };
  region: string;
}

// ============================================================================
// Environment Helpers
// ============================================================================

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

function optionalInt(name: string): number | undefined {
  const v = optionalEnv(name);
  if (!v) return undefined;
  const parsed = parseInt(v, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer, got '${v}'`);
  }
  return parsed;
}

// ============================================================================
// Config Loader
// ============================================================================

/**
 * Load Adidas-specific configuration from environment variables.
 * Returns typed config objects that plug directly into the generic adapters.
 *
 * Required env vars:
 *   ADIDAS_OMNI_HOST                — Sterling OMS host (e.g., https://omnihub.adidas.com)
 *   ADIDAS_STERLING_AUTH_METHOD     — 'basic' | 'bearer' | 'apikey'
 *
 * Sterling auth (depends on method):
 *   ADIDAS_STERLING_USERNAME        — For basic auth
 *   ADIDAS_STERLING_PASSWORD        — For basic auth
 *   ADIDAS_STERLING_TOKEN           — For bearer/apikey auth
 *
 * MQ Browse (Layer 2 — biggest lever: +94 checks including schema validation):
 *   ADIDAS_MQ_HOST                  — MQ hostname
 *   ADIDAS_MQ_PORT                  — MQ listener port (default: 1414)
 *   ADIDAS_MQ_CHANNEL               — MQ channel name
 *   ADIDAS_MQ_QUEUE_MANAGER         — Queue manager name
 *   ADIDAS_MQ_USERNAME              — Optional MQ auth username
 *   ADIDAS_MQ_PASSWORD              — Optional MQ auth password
 *
 * NShift (Layer 3):
 *   ADIDAS_NSHIFT_API_HOST          — NShift API host
 *   ADIDAS_NSHIFT_API_KEY           — NShift API key
 *
 * Region:
 *   ADIDAS_REGION                    — Region code for queue naming (default: ADWE)
 */
export function loadAdidasConfig(): AdidasClientConfig {
  const authMethodRaw = requireEnv('ADIDAS_STERLING_AUTH_METHOD');
  if (authMethodRaw !== 'basic' && authMethodRaw !== 'bearer' && authMethodRaw !== 'apikey') {
    throw new Error(
      `ADIDAS_STERLING_AUTH_METHOD must be 'basic', 'bearer', or 'apikey', got '${authMethodRaw}'`
    );
  }
  const authMethod = authMethodRaw as 'basic' | 'bearer' | 'apikey';

  // MQ Browse is enabled when host + queue manager are set
  const mqHost = optionalEnv('ADIDAS_MQ_HOST');
  const mqQueueManager = optionalEnv('ADIDAS_MQ_QUEUE_MANAGER');
  const mqEnabled = !!(mqHost && mqQueueManager);

  // NShift is enabled when API host + key are set
  const nshiftHost = optionalEnv('ADIDAS_NSHIFT_API_HOST');
  const nshiftKey = optionalEnv('ADIDAS_NSHIFT_API_KEY');
  const nshiftEnabled = !!(nshiftHost && nshiftKey);

  return {
    sterling: {
      baseUrl: requireEnv('ADIDAS_OMNI_HOST') + '/smcfs/restapi',
      auth: {
        method: authMethod,
        username: optionalEnv('ADIDAS_STERLING_USERNAME'),
        password: optionalEnv('ADIDAS_STERLING_PASSWORD'),
        token: optionalEnv('ADIDAS_STERLING_TOKEN'),
      },
    },
    mqBrowse: {
      enabled: mqEnabled,
      config: mqEnabled ? {
        host: mqHost!,
        port: optionalInt('ADIDAS_MQ_PORT') ?? 1414,
        channel: optionalEnv('ADIDAS_MQ_CHANNEL') ?? 'SYSTEM.DEF.SVRCONN',
        queueManager: mqQueueManager!,
        username: optionalEnv('ADIDAS_MQ_USERNAME'),
        password: optionalEnv('ADIDAS_MQ_PASSWORD'),
      } : undefined,
    },
    nshift: {
      enabled: nshiftEnabled,
      config: nshiftEnabled ? {
        apiHost: nshiftHost,
        apiKey: nshiftKey,
      } : undefined,
    },
    region: optionalEnv('ADIDAS_REGION') ?? 'ADWE',
  };
}
