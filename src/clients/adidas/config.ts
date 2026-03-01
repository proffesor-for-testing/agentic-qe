/**
 * Agentic QE v3 - Adidas Client Configuration
 * Maps Adidas environment variables to generic adapter configs.
 * This is the ONLY file that knows about Adidas env var naming conventions.
 */

import type { SterlingClientConfig, XAPIClientConfig } from '../../integrations/sterling/types';
import type { MQBrowseConfig, EpochDBConfig } from '../../integrations/iib/types';
import type { EpochGraphQLConfig } from '../../integrations/iib/providers/epoch-graphql';
import type { NShiftClientConfig } from '../../integrations/nshift/types';
import type { EmailConfig } from '../../integrations/email/types';
import type { BrowserConfig } from '../../integrations/browser/types';

// ============================================================================
// Adidas Client Config Shape
// ============================================================================

export interface AdidasClientConfig {
  sterling: SterlingClientConfig;
  xapi: {
    enabled: boolean;
    config?: XAPIClientConfig;
  };
  epochDB: {
    enabled: boolean;
    config?: EpochDBConfig;
  };
  epochGraphQL: {
    enabled: boolean;
    config?: EpochGraphQLConfig;
  };
  mqBrowse: {
    enabled: boolean;
    config?: MQBrowseConfig;
  };
  nshift: {
    enabled: boolean;
    config?: NShiftClientConfig;
  };
  email: {
    enabled: boolean;
    config?: EmailConfig;
  };
  browser: {
    enabled: boolean;
    config?: BrowserConfig;
  };
  enterpriseCode: string;
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

  // EPOCH GraphQL is enabled when URL is set (PREFERRED fallback — actual IIB payloads via GraphQL)
  const epochGraphQLUrl = optionalEnv('ADIDAS_EPOCH_GRAPHQL_URL');
  const epochGraphQLEnabled = !!epochGraphQLUrl;

  // EPOCH DB is enabled when host + user + password are set (LAST RESORT Layer 2 — indirect DB state only)
  const epochHost = optionalEnv('ADIDAS_EPOCH_DB_HOST');
  const epochUser = optionalEnv('ADIDAS_EPOCH_DB_USER');
  const epochPassword = optionalEnv('ADIDAS_EPOCH_DB_PASSWORD');
  const epochEnabled = !!(epochHost && epochUser && epochPassword);

  // MQ Browse is enabled when host + queue manager are set (PRIMARY Layer 2)
  const mqHost = optionalEnv('ADIDAS_MQ_HOST');
  const mqQueueManager = optionalEnv('ADIDAS_MQ_QUEUE_MANAGER');
  const mqEnabled = !!(mqHost && mqQueueManager);

  // NShift is enabled when API host + key are set
  const nshiftHost = optionalEnv('ADIDAS_NSHIFT_API_HOST');
  const nshiftKey = optionalEnv('ADIDAS_NSHIFT_API_KEY');
  const nshiftEnabled = !!(nshiftHost && nshiftKey);

  // Email is enabled when host + user are set (IMAP) or MS Graph creds are set
  const emailHost = optionalEnv('ADIDAS_EMAIL_HOST');
  const emailUser = optionalEnv('ADIDAS_EMAIL_USER');
  const emailPassword = optionalEnv('ADIDAS_EMAIL_PASSWORD');
  const msTenantId = optionalEnv('ADIDAS_EMAIL_MS_TENANT_ID');
  const msClientId = optionalEnv('ADIDAS_EMAIL_MS_CLIENT_ID');
  const msClientSecret = optionalEnv('ADIDAS_EMAIL_MS_CLIENT_SECRET');
  const emailImapEnabled = !!(emailHost && emailUser && emailPassword);
  const emailMsGraphEnabled = !!(msTenantId && msClientId && msClientSecret && emailUser);
  const emailEnabled = emailImapEnabled || emailMsGraphEnabled;

  // XAPI is enabled when URL + username + password are all set
  const xapiUrl = optionalEnv('ADIDAS_XAPI_URL');
  const xapiUsername = optionalEnv('ADIDAS_XAPI_USERNAME') ?? optionalEnv('ADIDAS_STERLING_USERNAME');
  const xapiPassword = optionalEnv('ADIDAS_XAPI_PASSWORD') ?? optionalEnv('ADIDAS_STERLING_PASSWORD');
  const xapiEnabled = !!(xapiUrl && xapiUsername && xapiPassword);

  // Browser is enabled when SSR base URL is set
  const ssrBaseUrl = optionalEnv('ADIDAS_SSR_BASE_URL');
  const browserEnabled = !!ssrBaseUrl;

  return {
    sterling: {
      baseUrl: requireEnv('ADIDAS_OMNI_HOST') + '/smcfs/restapi',
      enterpriseCode: optionalEnv('ADIDAS_ENTERPRISE_CODE') ?? 'adidas_PT',
      auth: {
        method: authMethod,
        username: optionalEnv('ADIDAS_STERLING_USERNAME'),
        password: optionalEnv('ADIDAS_STERLING_PASSWORD'),
        token: optionalEnv('ADIDAS_STERLING_TOKEN'),
      },
    },
    xapi: {
      enabled: xapiEnabled,
      config: xapiEnabled ? {
        baseUrl: xapiUrl!,
        username: xapiUsername!,
        password: xapiPassword!,
        timeout: 60_000,
      } : undefined,
    },
    epochGraphQL: {
      enabled: epochGraphQLEnabled,
      config: epochGraphQLEnabled ? {
        baseUrl: epochGraphQLUrl!,
        endpoint: optionalEnv('ADIDAS_EPOCH_GRAPHQL_ENDPOINT') ?? '/graphqlmdsit',
        timeout: optionalInt('ADIDAS_EPOCH_GRAPHQL_TIMEOUT') ?? 30_000,
      } : undefined,
    },
    epochDB: {
      enabled: epochEnabled,
      config: epochEnabled ? {
        host: epochHost!,
        port: optionalInt('ADIDAS_EPOCH_DB_PORT') ?? 1521,
        serviceName: optionalEnv('ADIDAS_EPOCH_DB_SERVICE') ?? 'MNGORA11',
        user: epochUser!,
        password: epochPassword!,
        schema: optionalEnv('ADIDAS_EPOCH_DB_SCHEMA'),
        poolMin: optionalInt('ADIDAS_EPOCH_DB_POOL_MIN'),
        poolMax: optionalInt('ADIDAS_EPOCH_DB_POOL_MAX'),
      } : undefined,
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
    email: {
      enabled: emailEnabled,
      config: emailEnabled ? (
        emailMsGraphEnabled
          ? { provider: 'msgraph' as const, config: { tenantId: msTenantId!, clientId: msClientId!, clientSecret: msClientSecret!, userEmail: emailUser! } }
          : { provider: 'imap' as const, config: { host: emailHost!, port: optionalInt('ADIDAS_EMAIL_PORT') ?? 993, user: emailUser!, password: emailPassword!, tls: true } }
      ) : undefined,
    },
    browser: {
      enabled: browserEnabled,
      config: browserEnabled ? {
        baseUrl: ssrBaseUrl!,
        headless: optionalEnv('ADIDAS_SSR_HEADLESS') !== 'false',
        username: optionalEnv('ADIDAS_SSR_USERNAME'),
        password: optionalEnv('ADIDAS_SSR_PASSWORD'),
      } : undefined,
    },
    enterpriseCode: optionalEnv('ADIDAS_ENTERPRISE_CODE') ?? 'adidas_PT',
    region: optionalEnv('ADIDAS_REGION') ?? 'ADWE',
  };
}
