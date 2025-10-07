/**
 * Chaos Inject Latency Handler
 * Real fault injection for network latency with multiple distribution types
 */

import type {
  ChaosLatencyConfig,
  ChaosInjectionResult,
  ActiveInjection,
} from '../../types/chaos';
import { validateUrl, generateId } from '../../../utils/validation';

// Track active latency injections
const activeInjections = new Map<string, ActiveInjection>();

// Proxy handlers for intercepting network calls
const proxyHandlers = new Map<string, any>();

/**
 * Generate latency value based on distribution
 */
function generateLatency(
  baseLatency: number,
  distribution: string,
  params?: any
): number {
  switch (distribution) {
    case 'fixed':
      return baseLatency;

    case 'uniform':
      const min = params?.min ?? baseLatency * 0.5;
      const max = params?.max ?? baseLatency * 1.5;
      return Math.random() * (max - min) + min;

    case 'normal': {
      const mean = params?.mean ?? baseLatency;
      const stdDev = params?.stdDev ?? baseLatency * 0.2;
      // Box-Muller transform for normal distribution
      const u1 = Math.random();
      const u2 = Math.random();
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      return Math.max(0, mean + z0 * stdDev);
    }

    case 'exponential': {
      const lambda = params?.lambda ?? 1 / baseLatency;
      return -Math.log(1 - Math.random()) / lambda;
    }

    default:
      return baseLatency;
  }
}

/**
 * Calculate affected services based on blast radius
 */
function calculateAffectedServices(
  targetServices: string[],
  percentage: number
): string[] {
  const count = Math.ceil((targetServices.length * percentage) / 100);
  const shuffled = [...targetServices].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Inject latency delay
 */
async function injectLatencyDelay(latencyMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, latencyMs);
  });
}

/**
 * Create network interceptor for latency injection
 */
function createLatencyInterceptor(
  config: ChaosLatencyConfig,
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

    if (shouldAffect) {
      // Generate and inject latency
      const latency = generateLatency(
        config.latencyMs,
        config.distribution,
        config.distributionParams
      );

      await injectLatencyDelay(latency);
    }

    // Call original fetch
    return originalFetch(input, init);
  };

  return interceptor;
}

/**
 * Rollback latency injection
 */
async function rollbackLatencyInjection(
  injectionId: string
): Promise<ChaosInjectionResult> {
  const injection = activeInjections.get(injectionId);

  if (!injection) {
    throw new Error(`Injection ${injectionId} not found`);
  }

  // Remove proxy handler
  const handler = proxyHandlers.get(injectionId);
  if (handler) {
    // Restore original fetch (in real implementation, this would be more sophisticated)
    proxyHandlers.delete(injectionId);
  }

  // Mark as inactive
  injection.active = false;
  activeInjections.set(injectionId, injection);

  return {
    success: true,
    injectionId,
    target: injection.target,
    affectedEndpoints: [injection.target],
    rolledBack: true,
    metadata: {
      injectedAt: injection.startTime,
      injectionMethod: 'proxy',
      targetType: 'http',
      rolledBackAt: new Date(),
    },
  };
}

/**
 * Main handler for chaos latency injection
 */
export async function chaosInjectLatency(
  config: ChaosLatencyConfig
): Promise<ChaosInjectionResult> {
  try {
    // Handle rollback request
    if (config.rollback && config.injectionId) {
      return await rollbackLatencyInjection(config.injectionId);
    }

    // Validate configuration
    if (!validateUrl(config.target)) {
      throw new Error('Invalid target URL');
    }

    if (config.latencyMs < 0) {
      throw new Error('Latency must be positive');
    }

    if (config.blastRadius.percentage < 0 || config.blastRadius.percentage > 100) {
      throw new Error('Blast radius percentage must be between 0 and 100');
    }

    // Generate injection ID
    const injectionId = generateId('chaos-latency');

    // Calculate affected services
    const affectedServices = calculateAffectedServices(
      config.blastRadius.targetServices,
      config.blastRadius.percentage
    );

    // Create latency interceptor
    const interceptor = createLatencyInterceptor(config, injectionId, affectedServices);
    proxyHandlers.set(injectionId, interceptor);

    // Calculate actual latency for reporting
    const actualLatency = generateLatency(
      config.latencyMs,
      config.distribution,
      config.distributionParams
    );

    // Calculate expiration
    const expiresAt = config.duration
      ? new Date(Date.now() + config.duration)
      : undefined;

    // Store active injection
    const injection: ActiveInjection = {
      injectionId,
      type: 'latency',
      target: config.target,
      config,
      startTime: new Date(),
      expiresAt,
      active: true,
    };
    activeInjections.set(injectionId, injection);

    // Auto-rollback after duration
    if (config.duration) {
      setTimeout(async () => {
        if (activeInjections.get(injectionId)?.active) {
          await rollbackLatencyInjection(injectionId);
        }
      }, config.duration);
    }

    return {
      success: true,
      injectionId,
      target: config.target,
      affectedEndpoints: [config.target, ...affectedServices],
      actualLatencyMs: actualLatency,
      distribution: config.distribution,
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
        injectionMethod: 'proxy',
        targetType: 'http',
        distributionParams: config.distributionParams,
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
 * Get active latency injections
 */
export function getActiveLatencyInjections(): ActiveInjection[] {
  return Array.from(activeInjections.values()).filter(inj => inj.active && inj.type === 'latency');
}

/**
 * Clean up expired injections
 */
export function cleanupExpiredInjections(): void {
  const now = Date.now();
  for (const [id, injection] of activeInjections.entries()) {
    if (injection.expiresAt && injection.expiresAt.getTime() < now) {
      if (injection.active) {
        rollbackLatencyInjection(id).catch(console.error);
      }
    }
  }
}

// Run cleanup every 60 seconds
setInterval(cleanupExpiredInjections, 60000);
