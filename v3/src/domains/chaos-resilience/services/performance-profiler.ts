/**
 * Agentic QE v3 - Performance Profiler Service
 * Implements IResilienceTestingService for recovery, failover, and resilience testing
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types';
import { MemoryBackend } from '../../../kernel/interfaces';
import {
  FaultType,
  RecoveryTestResult,
  RecoveryEvent,
  FailoverTestResult,
  FailoverStep,
  CircuitBreakerTestOptions,
  CircuitBreakerTestResult,
  RateLimitTestResult,
  RateLimitResponse,
  IResilienceTestingService,
} from '../interfaces';

/**
 * Configuration for the performance profiler service
 */
export interface PerformanceProfilerConfig {
  defaultTimeout: number;
  healthCheckInterval: number;
  maxRetries: number;
  recoveryCheckDelay: number;
}

const DEFAULT_CONFIG: PerformanceProfilerConfig = {
  defaultTimeout: 60000, // 60 seconds
  healthCheckInterval: 1000, // 1 second
  maxRetries: 3,
  recoveryCheckDelay: 500, // 500ms between recovery checks
};

/**
 * Performance Profiler Service Implementation
 * Tests system resilience, recovery, failover, circuit breakers, and rate limiting
 */
export class PerformanceProfilerService implements IResilienceTestingService {
  private readonly config: PerformanceProfilerConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<PerformanceProfilerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Test service recovery after fault injection
   */
  async testRecovery(
    service: string,
    faultType: FaultType,
    expectedRecoveryTime: number
  ): Promise<Result<RecoveryTestResult>> {
    const testId = uuidv4();

    try {
      const timeline: RecoveryEvent[] = [];

      // Phase 1: Verify initial health
      const initialHealth = await this.checkServiceHealth(service);
      timeline.push({
        timestamp: new Date(),
        event: 'Initial health check',
        status: initialHealth ? 'healthy' : 'unhealthy',
      });

      if (!initialHealth) {
        return ok({
          service,
          faultType,
          recoveryTime: 0,
          expectedRecoveryTime,
          passed: false,
          timeline,
        });
      }

      // Phase 2: Inject fault
      timeline.push({
        timestamp: new Date(),
        event: `Injecting fault: ${faultType}`,
        status: 'degraded',
      });

      await this.injectFault(service, faultType);

      // Phase 3: Verify service is affected
      const postFaultHealth = await this.checkServiceHealth(service);
      timeline.push({
        timestamp: new Date(),
        event: 'Post-fault health check',
        status: postFaultHealth ? 'healthy' : 'unhealthy',
      });

      // Phase 4: Remove fault and measure recovery time
      timeline.push({
        timestamp: new Date(),
        event: 'Removing fault',
        status: 'degraded',
      });

      await this.removeFault(service, faultType);
      const faultRemovedTime = Date.now();

      // Phase 5: Monitor recovery
      let recoveryTime = 0;
      let recovered = false;
      const timeout = expectedRecoveryTime * 2; // Give 2x expected time

      while (Date.now() - faultRemovedTime < timeout) {
        const health = await this.checkServiceHealth(service);

        if (health) {
          recoveryTime = Date.now() - faultRemovedTime;
          recovered = true;
          timeline.push({
            timestamp: new Date(),
            event: 'Service recovered',
            status: 'healthy',
          });
          break;
        }

        timeline.push({
          timestamp: new Date(),
          event: 'Recovery check - still degraded',
          status: 'degraded',
        });

        await this.sleep(this.config.recoveryCheckDelay);
      }

      if (!recovered) {
        timeline.push({
          timestamp: new Date(),
          event: 'Recovery timeout exceeded',
          status: 'unhealthy',
        });
      }

      const result: RecoveryTestResult = {
        service,
        faultType,
        recoveryTime,
        expectedRecoveryTime,
        passed: recovered && recoveryTime <= expectedRecoveryTime,
        timeline,
      };

      // Store result
      await this.storeTestResult('recovery', testId, result);

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Test failover between primary and secondary services
   */
  async testFailover(
    primaryService: string,
    secondaryService: string
  ): Promise<Result<FailoverTestResult>> {
    const testId = uuidv4();

    try {
      const steps: FailoverStep[] = [];
      let stepOrder = 1;

      // Step 1: Verify both services are healthy
      const [primaryHealth, secondaryHealth] = await Promise.all([
        this.checkServiceHealth(primaryService),
        this.checkServiceHealth(secondaryService),
      ]);

      steps.push({
        order: stepOrder++,
        action: 'Verify primary service health',
        duration: 0,
        success: primaryHealth,
      });

      steps.push({
        order: stepOrder++,
        action: 'Verify secondary service health',
        duration: 0,
        success: secondaryHealth,
      });

      if (!primaryHealth || !secondaryHealth) {
        return ok({
          primaryService,
          secondaryService,
          failoverTime: 0,
          dataLoss: true,
          passed: false,
          steps,
        });
      }

      // Step 2: Capture data state from primary
      const preFailoverData = await this.captureServiceState(primaryService);
      steps.push({
        order: stepOrder++,
        action: 'Capture primary service state',
        duration: 0,
        success: true,
      });

      // Step 3: Trigger failover by failing primary
      const failoverStartTime = Date.now();
      await this.injectFault(primaryService, 'process-kill');
      steps.push({
        order: stepOrder++,
        action: 'Trigger primary service failure',
        duration: Date.now() - failoverStartTime,
        success: true,
      });

      // Step 4: Wait for failover to complete
      const failoverDetectionStart = Date.now();
      let failoverDetected = false;
      let failoverTime = 0;

      while (Date.now() - failoverDetectionStart < this.config.defaultTimeout) {
        const secondaryActive = await this.checkServiceIsActive(secondaryService);
        if (secondaryActive) {
          failoverTime = Date.now() - failoverStartTime;
          failoverDetected = true;
          break;
        }
        await this.sleep(this.config.healthCheckInterval);
      }

      steps.push({
        order: stepOrder++,
        action: 'Detect failover completion',
        duration: failoverTime,
        success: failoverDetected,
      });

      // Step 5: Verify data integrity on secondary
      const postFailoverData = await this.captureServiceState(secondaryService);
      const dataLoss = !this.compareServiceStates(preFailoverData, postFailoverData);

      steps.push({
        order: stepOrder++,
        action: 'Verify data integrity on secondary',
        duration: 0,
        success: !dataLoss,
      });

      // Step 6: Restore primary (optional cleanup)
      await this.removeFault(primaryService, 'process-kill');
      steps.push({
        order: stepOrder++,
        action: 'Restore primary service',
        duration: 0,
        success: true,
      });

      const result: FailoverTestResult = {
        primaryService,
        secondaryService,
        failoverTime,
        dataLoss,
        passed: failoverDetected && !dataLoss,
        steps,
      };

      await this.storeTestResult('failover', testId, result);

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Test circuit breaker behavior
   */
  async testCircuitBreaker(
    service: string,
    options?: CircuitBreakerTestOptions
  ): Promise<Result<CircuitBreakerTestResult>> {
    const testId = uuidv4();

    try {
      const errorThreshold = options?.errorThreshold ?? 5;
      const timeout = options?.timeout ?? this.config.defaultTimeout;
      const halfOpenRequests = options?.halfOpenRequests ?? 3;

      // Phase 1: Verify circuit is initially closed
      const initialState = await this.getCircuitState(service);
      if (initialState !== 'closed') {
        // Reset circuit before testing
        await this.resetCircuit(service);
      }

      // Phase 2: Generate errors to open the circuit
      let errorsToOpen = 0;
      let circuitOpened = false;

      for (let i = 0; i < errorThreshold * 2; i++) {
        await this.generateError(service);
        errorsToOpen++;

        const state = await this.getCircuitState(service);
        if (state === 'open') {
          circuitOpened = true;
          break;
        }
      }

      // Phase 3: Wait for circuit to move to half-open
      let halfOpenDetected = false;
      const halfOpenWaitStart = Date.now();

      while (Date.now() - halfOpenWaitStart < timeout) {
        const state = await this.getCircuitState(service);
        if (state === 'half-open') {
          halfOpenDetected = true;
          break;
        }
        await this.sleep(this.config.healthCheckInterval);
      }

      // Phase 4: Test half-open behavior
      let halfOpenBehavior: 'correct' | 'incorrect' = 'correct';

      if (halfOpenDetected) {
        // Send successful requests to test half-open
        let successCount = 0;
        for (let i = 0; i < halfOpenRequests; i++) {
          const success = await this.sendSuccessfulRequest(service);
          if (success) successCount++;
        }

        // Circuit should close after successful half-open requests
        const finalState = await this.getCircuitState(service);
        if (finalState !== 'closed' && successCount === halfOpenRequests) {
          halfOpenBehavior = 'incorrect';
        }
      }

      // Phase 5: Verify circuit can close after recovery
      let closedAfterRecovery = false;
      const recoveryStart = Date.now();

      while (Date.now() - recoveryStart < timeout) {
        const state = await this.getCircuitState(service);
        if (state === 'closed') {
          closedAfterRecovery = true;
          break;
        }
        // Send successful requests to help recovery
        await this.sendSuccessfulRequest(service);
        await this.sleep(this.config.healthCheckInterval);
      }

      const result: CircuitBreakerTestResult = {
        service,
        opened: circuitOpened,
        openedAfterErrors: errorsToOpen,
        closedAfterRecovery,
        halfOpenBehavior,
        passed: circuitOpened && closedAfterRecovery && halfOpenBehavior === 'correct',
      };

      await this.storeTestResult('circuit-breaker', testId, result);

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Test rate limiting behavior
   */
  async testRateLimiting(
    service: string,
    expectedLimit: number
  ): Promise<Result<RateLimitTestResult>> {
    const testId = uuidv4();

    try {
      // Phase 1: Send requests at increasing rate until rate limited
      let actualLimit = 0;
      let responseWhenLimited: RateLimitResponse = {
        statusCode: 429,
        retryAfter: undefined,
        body: undefined,
      };

      // Start with small batches and increase
      const batchSizes = [1, 5, 10, 25, 50, 100, 200];
      let totalRequestsSent = 0;
      let rateLimitHit = false;

      for (const batchSize of batchSizes) {
        if (rateLimitHit) break;

        const results = await this.sendRequestBatch(service, batchSize);
        totalRequestsSent += batchSize;

        for (const result of results) {
          if (result.statusCode === 429) {
            rateLimitHit = true;
            actualLimit = totalRequestsSent - (batchSize - results.indexOf(result));
            responseWhenLimited = result;
            break;
          }
        }
      }

      // If no rate limit hit, the actual limit is higher than our max test
      if (!rateLimitHit) {
        actualLimit = totalRequestsSent;
      }

      // Phase 2: Verify rate limit is close to expected
      const tolerance = expectedLimit * 0.2; // 20% tolerance
      const withinTolerance =
        Math.abs(actualLimit - expectedLimit) <= tolerance || !rateLimitHit;

      const result: RateLimitTestResult = {
        service,
        expectedLimit,
        actualLimit,
        passed: rateLimitHit && withinTolerance,
        responseWhenLimited,
      };

      await this.storeTestResult('rate-limit', testId, result);

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async checkServiceHealth(service: string): Promise<boolean> {
    // Stub: Would make actual health check request
    console.log(`Checking health of service: ${service}`);
    // Simulate health check with 95% success rate
    return Math.random() > 0.05;
  }

  private async checkServiceIsActive(service: string): Promise<boolean> {
    // Stub: Check if service is actively handling traffic
    console.log(`Checking if service is active: ${service}`);
    return Math.random() > 0.1;
  }

  private async injectFault(service: string, faultType: FaultType): Promise<void> {
    // Stub: Would inject actual fault
    console.log(`Injecting fault ${faultType} into service: ${service}`);
    await this.sleep(100); // Simulate injection time
  }

  private async removeFault(service: string, faultType: FaultType): Promise<void> {
    // Stub: Would remove fault
    console.log(`Removing fault ${faultType} from service: ${service}`);
    await this.sleep(50);
  }

  private async captureServiceState(_service: string): Promise<ServiceState> {
    // Stub: Would capture actual service state (data snapshot, etc.)
    return {
      checksum: uuidv4(),
      timestamp: new Date(),
      records: Math.floor(Math.random() * 1000),
    };
  }

  private compareServiceStates(state1: ServiceState, state2: ServiceState): boolean {
    // Stub: Compare states to detect data loss
    // In reality, would compare checksums, record counts, etc.
    return state1.records === state2.records;
  }

  private async getCircuitState(
    _service: string
  ): Promise<'closed' | 'open' | 'half-open'> {
    // Stub: Would query actual circuit breaker state
    const states: Array<'closed' | 'open' | 'half-open'> = [
      'closed',
      'open',
      'half-open',
    ];
    return states[Math.floor(Math.random() * states.length)];
  }

  private async resetCircuit(service: string): Promise<void> {
    // Stub: Would reset circuit breaker to closed state
    console.log(`Resetting circuit breaker for: ${service}`);
  }

  private async generateError(service: string): Promise<void> {
    // Stub: Would generate an error condition
    console.log(`Generating error for: ${service}`);
  }

  private async sendSuccessfulRequest(service: string): Promise<boolean> {
    // Stub: Would send a request expected to succeed
    console.log(`Sending successful request to: ${service}`);
    return Math.random() > 0.1; // 90% success rate
  }

  private async sendRequestBatch(
    service: string,
    count: number
  ): Promise<RateLimitResponse[]> {
    // Stub: Would send batch of requests
    console.log(`Sending batch of ${count} requests to: ${service}`);

    const results: RateLimitResponse[] = [];
    for (let i = 0; i < count; i++) {
      // Simulate rate limiting after random threshold
      const rateLimitThreshold = 50 + Math.floor(Math.random() * 50);
      if (i >= rateLimitThreshold) {
        results.push({
          statusCode: 429,
          retryAfter: 60,
          body: { error: 'Rate limit exceeded' },
        });
      } else {
        results.push({
          statusCode: 200,
        });
      }
    }
    return results;
  }

  private async storeTestResult(
    type: string,
    testId: string,
    result: unknown
  ): Promise<void> {
    await this.memory.set(
      `resilience:${type}:${testId}`,
      result,
      { namespace: 'chaos-resilience', persist: true }
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Internal types
 */
interface ServiceState {
  checksum: string;
  timestamp: Date;
  records: number;
}
