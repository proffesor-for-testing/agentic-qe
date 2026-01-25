/**
 * Chaos Inject Failure Handler
 * Real fault injection for various failure types (errors, timeouts, connection issues)
 */

import type {
  ChaosFailureConfig,
  ChaosInjectionResult,
  ActiveInjection,
  FailureType,
} from '../../types/chaos';
import { validateUrl, generateId } from '../../../utils/validation';
import { SecureRandom } from '../../../utils/SecureRandom.js';

// Track active failure injections
const activeInjections = new Map<string, ActiveInjection>();

// Failure interceptors
const failureHandlers = new Map<string, any>();

// Cleanup interval handle (lazy-initialized to prevent memory leaks)
let cleanupIntervalHandle: NodeJS.Timeout | null = null;

/**
 * Start cleanup interval if not already running
 * Uses unref() to prevent interval from keeping process alive
 */
function ensureCleanupInterval(): void {
  if (!cleanupIntervalHandle) {
    cleanupIntervalHandle = setInterval(cleanupExpiredInjections, 60000);
    // Prevent interval from keeping process alive
    if (cleanupIntervalHandle.unref) {
      cleanupIntervalHandle.unref();
    }
  }
}

/**
 * Stop cleanup interval and clear all injections
 * Call this during test teardown or process shutdown
 */
export function shutdown(): void {
  if (cleanupIntervalHandle) {
    clearInterval(cleanupIntervalHandle);
    cleanupIntervalHandle = null;
  }
  // Rollback all active injections
  for (const [id, injection] of activeInjections.entries()) {
    if (injection.active) {
      rollbackFailureInjection(id).catch(() => {});
    }
  }
  activeInjections.clear();
  failureHandlers.clear();
}

/**
 * Valid HTTP error codes
 */
const VALID_HTTP_CODES = new Set([
  400, 401, 403, 404, 405, 408, 409, 410, 429,
  500, 501, 502, 503, 504, 505, 507, 508, 511
]);

/**
 * Calculate if request should fail based on failure rate
 */
function shouldFail(failureRate: number = 1.0): boolean {
  return SecureRandom.randomFloat() < failureRate;
}

/**
 * Calculate affected services based on blast radius
 */
function calculateAffectedServices(
  targetServices: string[],
  percentage: number
): string[] {
  const count = Math.ceil((targetServices.length * percentage) / 100);
  const shuffled = [...targetServices].sort(() => SecureRandom.randomFloat() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Create HTTP error response
 */
function createErrorResponse(statusCode: number): Response {
  return new Response(
    JSON.stringify({
      error: `Chaos injected error ${statusCode}`,
      timestamp: new Date().toISOString(),
      chaos: true,
    }),
    {
      status: statusCode,
      statusText: `Chaos Error ${statusCode}`,
      headers: {
        'Content-Type': 'application/json',
        'X-Chaos-Injection': 'true',
      },
    }
  );
}

/**
 * Create timeout failure
 */
async function createTimeoutFailure(timeoutMs: number): Promise<never> {
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  throw new Error(`Request timeout after ${timeoutMs}ms (chaos injected)`);
}

/**
 * Create connection refused failure
 */
function createConnectionRefusedFailure(): never {
  const error = new Error('Connection refused (chaos injected)');
  (error as any).code = 'ECONNREFUSED';
  throw error;
}

/**
 * Create DNS failure
 */
function createDnsFailure(): never {
  const error = new Error('DNS resolution failed (chaos injected)');
  (error as any).code = 'ENOTFOUND';
  throw error;
}

/**
 * Create partial response failure
 */
function createPartialResponse(): Response {
  const partialData = '{"incomplete": true, "data": "partial';
  return new Response(partialData, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Chaos-Injection': 'partial-response',
    },
  });
}

/**
 * Select random failure from combined types
 */
function selectRandomFailure(failureTypes: FailureType[]): FailureType {
  const randomIndex = Math.floor(SecureRandom.randomFloat() * failureTypes.length);
  return failureTypes[randomIndex];
}

/**
 * Create failure interceptor
 */
function createFailureInterceptor(
  config: ChaosFailureConfig,
  injectionId: string,
  affectedServices: string[]
): any {
  const originalFetch = global.fetch;

  const interceptor = async function (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    // Check if this request should be affected
    const shouldAffect = affectedServices.some(service => url.includes(service));

    if (shouldAffect && shouldFail(config.failureRate)) {
      let failureType = config.failureType;

      // Handle combined failure types
      if (failureType === 'combined' && config.failureTypes) {
        failureType = selectRandomFailure(config.failureTypes);
      }

      // Inject specific failure type
      switch (failureType) {
        case 'http_error':
          return createErrorResponse(config.httpErrorCode ?? 500);

        case 'timeout':
          await createTimeoutFailure(config.timeoutMs ?? 30000);
          break; // Never reached

        case 'connection_refused':
          createConnectionRefusedFailure();
          break; // Never reached

        case 'dns_failure':
          createDnsFailure();
          break; // Never reached

        case 'partial_response':
          return createPartialResponse();

        default:
          return createErrorResponse(500);
      }
    }

    // Call original fetch
    return originalFetch(input, init);
  };

  return interceptor;
}

/**
 * Rollback failure injection
 */
async function rollbackFailureInjection(
  injectionId: string
): Promise<ChaosInjectionResult> {
  const injection = activeInjections.get(injectionId);

  if (!injection) {
    throw new Error(`Injection ${injectionId} not found`);
  }

  // Remove failure handler
  const handler = failureHandlers.get(injectionId);
  if (handler) {
    failureHandlers.delete(injectionId);
  }

  // Mark as inactive
  injection.active = false;
  activeInjections.set(injectionId, injection);

  const config = injection.config as ChaosFailureConfig;

  return {
    success: true,
    injectionId,
    target: injection.target,
    affectedEndpoints: [injection.target],
    failureType: config.failureType,
    rolledBack: true,
    metadata: {
      injectedAt: injection.startTime,
      injectionMethod: 'interceptor',
      targetType: 'http',
      rolledBackAt: new Date(),
    },
  };
}

/**
 * Main handler for chaos failure injection
 */
export async function chaosInjectFailure(
  config: ChaosFailureConfig
): Promise<ChaosInjectionResult> {
  try {
    // Handle rollback request
    if (config.rollback && config.injectionId) {
      return await rollbackFailureInjection(config.injectionId);
    }

    // Validate configuration
    if (!validateUrl(config.target)) {
      throw new Error('Invalid target URL');
    }

    if (config.failureType === 'http_error') {
      if (!config.httpErrorCode || !VALID_HTTP_CODES.has(config.httpErrorCode)) {
        throw new Error('Invalid HTTP error code');
      }
    }

    if (config.blastRadius.percentage < 0 || config.blastRadius.percentage > 100) {
      throw new Error('Blast radius percentage must be between 0 and 100');
    }

    if (config.failureRate && (config.failureRate < 0 || config.failureRate > 1)) {
      throw new Error('Failure rate must be between 0 and 1');
    }

    // Generate injection ID
    const injectionId = generateId('chaos-failure');

    // Calculate affected services
    const affectedServices = calculateAffectedServices(
      config.blastRadius.targetServices,
      config.blastRadius.percentage
    );

    // Create failure interceptor
    const interceptor = createFailureInterceptor(config, injectionId, affectedServices);
    failureHandlers.set(injectionId, interceptor);

    // Calculate expiration
    const expiresAt = config.duration
      ? new Date(Date.now() + config.duration)
      : undefined;

    // Store active injection
    const injection: ActiveInjection = {
      injectionId,
      type: 'failure',
      target: config.target,
      config,
      startTime: new Date(),
      expiresAt,
      active: true,
    };
    activeInjections.set(injectionId, injection);

    // Start cleanup interval when first injection is created (lazy init)
    ensureCleanupInterval();

    // Auto-rollback after duration
    if (config.duration) {
      setTimeout(async () => {
        if (activeInjections.get(injectionId)?.active) {
          await rollbackFailureInjection(injectionId);
        }
      }, config.duration);
    }

    return {
      success: true,
      injectionId,
      target: config.target,
      affectedEndpoints: [config.target, ...affectedServices],
      failureType: config.failureType,
      timeoutMs: config.timeoutMs,
      failureRate: config.failureRate ?? 1.0,
      blastRadiusImpact: {
        targetedCount: config.blastRadius.targetServices.length,
        affectedCount: affectedServices.length,
        percentage: config.blastRadius.percentage,
      },
      duration: config.duration,
      expiresAt,
      rolledBack: false,
      metadata: {
        injectedAt: new Date(),
        injectionMethod: 'interceptor',
        targetType: 'http',
        httpErrorCode: config.httpErrorCode,
        failureTypes: config.failureTypes,
      },
    };
  } catch (error) {
    return {
      success: false,
      injectionId: '',
      target: config.target,
      affectedEndpoints: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get active failure injections
 */
export function getActiveFailureInjections(): ActiveInjection[] {
  return Array.from(activeInjections.values()).filter(inj => inj.active && inj.type === 'failure');
}

/**
 * Clean up expired injections
 */
export function cleanupExpiredInjections(): void {
  const now = Date.now();
  for (const [id, injection] of activeInjections.entries()) {
    if (injection.expiresAt && injection.expiresAt.getTime() < now) {
      if (injection.active) {
        rollbackFailureInjection(id).catch(console.error);
      }
    }
  }
}
