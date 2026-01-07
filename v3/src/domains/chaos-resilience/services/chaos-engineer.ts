/**
 * Agentic QE v3 - Chaos Engineering Service
 * Implements IChaosEngineeringService for fault injection and experiment execution
 */

import { Result, ok, err } from '../../../shared/types';
import { MemoryBackend } from '../../../kernel/interfaces';
import {
  ChaosExperiment,
  ExperimentResult,
  ExperimentStatus,
  SteadyStateDefinition,
  SteadyStateProbe,
  FaultInjection,
  FaultResult,
  FaultType,
  MetricSnapshot,
  Incident,
  IChaosEngineeringService,
} from '../interfaces';

/**
 * Configuration for the chaos engineer service
 */
export interface ChaosEngineerConfig {
  defaultTimeout: number;
  maxConcurrentFaults: number;
  enableDryRun: boolean;
  safetyCheckInterval: number;
  autoRollbackOnFailure: boolean;
}

const DEFAULT_CONFIG: ChaosEngineerConfig = {
  defaultTimeout: 60000, // 60 seconds
  maxConcurrentFaults: 3,
  enableDryRun: true,
  safetyCheckInterval: 5000, // 5 seconds
  autoRollbackOnFailure: true,
};

/**
 * Mutable version of ExperimentResult for internal tracking
 */
interface MutableExperimentResult {
  experimentId: string;
  status: ExperimentStatus;
  startTime: Date;
  endTime?: Date;
  hypothesisValidated: boolean;
  steadyStateVerified: boolean;
  faultResults: FaultResult[];
  metrics: MetricSnapshot[];
  incidents: Incident[];
}

/**
 * Internal type for tracking experiment execution
 */
interface ExperimentExecution {
  experimentId: string;
  startTime: Date;
  result: MutableExperimentResult;
}

/**
 * Chaos Engineering Service Implementation
 * Manages chaos experiments, fault injection, and steady state verification
 */
export class ChaosEngineerService implements IChaosEngineeringService {
  private readonly config: ChaosEngineerConfig;
  private readonly activeExperiments: Map<string, ExperimentExecution> = new Map();
  private readonly activeFaults: Map<string, FaultInjection> = new Map();

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<ChaosEngineerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new chaos experiment
   */
  async createExperiment(experiment: ChaosExperiment): Promise<Result<string>> {
    try {
      // Validate experiment configuration
      const validationResult = this.validateExperiment(experiment);
      if (!validationResult.success) {
        return err(validationResult.error);
      }

      // Store experiment
      await this.memory.set(
        `chaos:experiments:${experiment.id}`,
        experiment,
        { namespace: 'chaos-resilience', persist: true }
      );

      return ok(experiment.id);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Run a chaos experiment
   */
  async runExperiment(experimentId: string): Promise<Result<ExperimentResult>> {
    try {
      // Load experiment
      const experiment = await this.memory.get<ChaosExperiment>(
        `chaos:experiments:${experimentId}`
      );

      if (!experiment) {
        return err(new Error(`Experiment not found: ${experimentId}`));
      }

      // Check if experiment is already running
      if (this.activeExperiments.has(experimentId)) {
        return err(new Error(`Experiment ${experimentId} is already running`));
      }

      // Create experiment execution
      const execution = this.createExecution(experiment);
      this.activeExperiments.set(experimentId, execution);

      try {
        // Phase 1: Verify initial steady state
        const steadyStateResult = await this.verifySteadyState(experiment.steadyState);
        if (!steadyStateResult.success || !steadyStateResult.value) {
          execution.result.steadyStateVerified = false;
          execution.result.status = 'failed';
          execution.result.incidents.push({
            type: 'error',
            severity: 'high',
            message: 'Initial steady state verification failed',
            timestamp: new Date(),
            resolved: false,
          });
          return ok(this.finalizeExecution(execution));
        }

        execution.result.steadyStateVerified = true;

        // Phase 2: Inject faults
        for (const fault of experiment.faults) {
          const faultResult = await this.injectFault(fault);
          if (faultResult.success) {
            execution.result.faultResults.push(faultResult.value);
          } else {
            execution.result.faultResults.push({
              faultId: fault.id,
              injected: false,
              duration: 0,
              affectedTargets: 0,
              errors: [faultResult.error.message],
            });
          }
        }

        // Phase 3: Monitor and collect metrics
        await this.collectMetricsDuringExperiment(execution, experiment);

        // Phase 4: Verify final steady state
        const finalSteadyState = await this.verifySteadyState(experiment.steadyState);
        const finalSteadyStateValue = finalSteadyState.success ? finalSteadyState.value : false;

        // Phase 5: Validate hypothesis
        execution.result.hypothesisValidated = this.validateHypothesis(
          experiment.hypothesis,
          execution.result.metrics
        );

        // Determine final status
        execution.result.status = this.determineExperimentStatus(execution, finalSteadyStateValue);

        // Phase 6: Clean up faults
        for (const fault of experiment.faults) {
          await this.removeFault(fault.id);
        }

        return ok(this.finalizeExecution(execution));
      } catch (error) {
        // Handle unexpected errors
        execution.result.status = 'failed';
        execution.result.incidents.push({
          type: 'error',
          severity: 'critical',
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
          resolved: false,
        });

        // Attempt rollback
        if (this.config.autoRollbackOnFailure) {
          await this.rollbackExperiment(experiment);
          execution.result.status = 'rolled-back';
        }

        return ok(this.finalizeExecution(execution));
      } finally {
        this.activeExperiments.delete(experimentId);
      }
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Abort a running experiment
   */
  async abortExperiment(experimentId: string, reason: string): Promise<Result<void>> {
    try {
      const execution = this.activeExperiments.get(experimentId);
      if (!execution) {
        return err(new Error(`No active experiment found: ${experimentId}`));
      }

      execution.result.status = 'aborted';
      execution.result.incidents.push({
        type: 'alert',
        severity: 'medium',
        message: `Experiment aborted: ${reason}`,
        timestamp: new Date(),
        resolved: true,
      });

      // Remove all active faults for this experiment
      const experiment = await this.memory.get<ChaosExperiment>(
        `chaos:experiments:${experimentId}`
      );

      if (experiment) {
        for (const fault of experiment.faults) {
          await this.removeFault(fault.id);
        }
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Verify steady state conditions
   */
  async verifySteadyState(definition: SteadyStateDefinition): Promise<Result<boolean>> {
    try {
      const probeResults: boolean[] = [];

      for (const probe of definition.probes) {
        const result = await this.executeProbe(probe);
        probeResults.push(result);
      }

      // All probes must pass
      const allPassed = probeResults.every((r) => r);

      return ok(allPassed);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Inject a single fault
   */
  async injectFault(fault: FaultInjection): Promise<Result<FaultResult>> {
    try {
      // Check concurrent fault limit
      if (this.activeFaults.size >= this.config.maxConcurrentFaults) {
        return err(new Error(`Maximum concurrent faults (${this.config.maxConcurrentFaults}) reached`));
      }

      // Validate fault configuration
      const validationResult = this.validateFault(fault);
      if (!validationResult.success) {
        return err(validationResult.error);
      }

      const startTime = Date.now();

      // Apply probability check
      if (fault.probability !== undefined && Math.random() > fault.probability) {
        return ok({
          faultId: fault.id,
          injected: false,
          duration: 0,
          affectedTargets: 0,
          errors: ['Skipped due to probability check'],
        });
      }

      // Inject fault based on type
      const injectionResult = await this.performFaultInjection(fault);

      if (injectionResult.success) {
        this.activeFaults.set(fault.id, fault);

        // Schedule automatic removal if duration is specified
        if (fault.duration > 0) {
          setTimeout(() => {
            this.removeFault(fault.id);
          }, fault.duration);
        }

        return ok({
          faultId: fault.id,
          injected: true,
          duration: Date.now() - startTime,
          affectedTargets: injectionResult.value,
          errors: [],
        });
      }

      return ok({
        faultId: fault.id,
        injected: false,
        duration: Date.now() - startTime,
        affectedTargets: 0,
        errors: [injectionResult.error.message],
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Remove an injected fault
   */
  async removeFault(faultId: string): Promise<Result<void>> {
    try {
      const fault = this.activeFaults.get(faultId);
      if (!fault) {
        return ok(undefined); // Already removed
      }

      // Remove fault based on type
      await this.performFaultRemoval(fault);

      this.activeFaults.delete(faultId);

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private validateExperiment(experiment: ChaosExperiment): Result<void> {
    if (!experiment.id) {
      return err(new Error('Experiment ID is required'));
    }

    if (!experiment.name) {
      return err(new Error('Experiment name is required'));
    }

    if (!experiment.hypothesis) {
      return err(new Error('Experiment hypothesis is required'));
    }

    if (!experiment.steadyState || experiment.steadyState.probes.length === 0) {
      return err(new Error('At least one steady state probe is required'));
    }

    if (!experiment.faults || experiment.faults.length === 0) {
      return err(new Error('At least one fault injection is required'));
    }

    if (!experiment.rollbackPlan) {
      return err(new Error('Rollback plan is required'));
    }

    // Validate blast radius
    if (experiment.blastRadius.excludeProduction === false) {
      // Additional checks for production experiments
      if (!experiment.rollbackPlan.automatic) {
        return err(new Error('Production experiments require automatic rollback'));
      }
    }

    return ok(undefined);
  }

  private validateFault(fault: FaultInjection): Result<void> {
    if (!fault.id) {
      return err(new Error('Fault ID is required'));
    }

    if (!fault.type) {
      return err(new Error('Fault type is required'));
    }

    if (!fault.target) {
      return err(new Error('Fault target is required'));
    }

    if (fault.duration < 0) {
      return err(new Error('Fault duration must be non-negative'));
    }

    if (fault.probability !== undefined && (fault.probability < 0 || fault.probability > 1)) {
      return err(new Error('Fault probability must be between 0 and 1'));
    }

    return ok(undefined);
  }

  private createExecution(experiment: ChaosExperiment): ExperimentExecution {
    return {
      experimentId: experiment.id,
      startTime: new Date(),
      result: {
        experimentId: experiment.id,
        status: 'running',
        startTime: new Date(),
        hypothesisValidated: false,
        steadyStateVerified: false,
        faultResults: [],
        metrics: [],
        incidents: [],
      },
    };
  }

  private finalizeExecution(execution: ExperimentExecution): ExperimentResult {
    execution.result.endTime = new Date();

    // Convert mutable result to readonly ExperimentResult
    const result: ExperimentResult = {
      experimentId: execution.result.experimentId,
      status: execution.result.status,
      startTime: execution.result.startTime,
      endTime: execution.result.endTime,
      hypothesisValidated: execution.result.hypothesisValidated,
      steadyStateVerified: execution.result.steadyStateVerified,
      faultResults: execution.result.faultResults,
      metrics: execution.result.metrics,
      incidents: execution.result.incidents,
    };

    // Store result in memory
    this.memory.set(
      `chaos:results:${execution.experimentId}:${Date.now()}`,
      result,
      { namespace: 'chaos-resilience', persist: true }
    );

    return result;
  }

  private async executeProbe(probe: SteadyStateProbe): Promise<boolean> {
    try {
      // Stub: In production, this would actually execute the probe
      switch (probe.type) {
        case 'http':
          return await this.executeHttpProbe(probe);
        case 'tcp':
          return await this.executeTcpProbe(probe);
        case 'command':
          return await this.executeCommandProbe(probe);
        case 'metric':
          return await this.executeMetricProbe(probe);
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  private async executeHttpProbe(probe: SteadyStateProbe): Promise<boolean> {
    // Stub: Would make actual HTTP request
    // In production: fetch(probe.target) with timeout
    console.log(`Executing HTTP probe: ${probe.name} -> ${probe.target}`);
    return true; // Simulated success
  }

  private async executeTcpProbe(probe: SteadyStateProbe): Promise<boolean> {
    // Stub: Would check TCP connectivity
    console.log(`Executing TCP probe: ${probe.name} -> ${probe.target}`);
    return true;
  }

  private async executeCommandProbe(probe: SteadyStateProbe): Promise<boolean> {
    // Stub: Would execute shell command
    console.log(`Executing command probe: ${probe.name} -> ${probe.target}`);
    return true;
  }

  private async executeMetricProbe(probe: SteadyStateProbe): Promise<boolean> {
    // Stub: Would query metrics endpoint
    console.log(`Executing metric probe: ${probe.name} -> ${probe.target}`);
    return true;
  }

  private async performFaultInjection(fault: FaultInjection): Promise<Result<number>> {
    // Stub: In production, this would inject actual faults
    // using tools like Chaos Monkey, Litmus, or custom injectors

    const faultHandlers: Record<FaultType, () => Promise<Result<number>>> = {
      'latency': async () => this.injectLatency(fault),
      'error': async () => this.injectError(fault),
      'timeout': async () => this.injectTimeout(fault),
      'packet-loss': async () => this.injectPacketLoss(fault),
      'cpu-stress': async () => this.injectCpuStress(fault),
      'memory-stress': async () => this.injectMemoryStress(fault),
      'disk-stress': async () => this.injectDiskStress(fault),
      'network-partition': async () => this.injectNetworkPartition(fault),
      'dns-failure': async () => this.injectDnsFailure(fault),
      'process-kill': async () => this.injectProcessKill(fault),
    };

    const handler = faultHandlers[fault.type];
    if (handler) {
      return handler();
    }

    return err(new Error(`Unknown fault type: ${fault.type}`));
  }

  private async injectLatency(fault: FaultInjection): Promise<Result<number>> {
    const latencyMs = fault.parameters.latencyMs ?? 100;
    console.log(`Injecting latency: ${latencyMs}ms to ${fault.target.selector}`);
    return ok(1); // Affected targets count
  }

  private async injectError(fault: FaultInjection): Promise<Result<number>> {
    const errorCode = fault.parameters.errorCode ?? 500;
    console.log(`Injecting error: ${errorCode} to ${fault.target.selector}`);
    return ok(1);
  }

  private async injectTimeout(fault: FaultInjection): Promise<Result<number>> {
    console.log(`Injecting timeout to ${fault.target.selector}`);
    return ok(1);
  }

  private async injectPacketLoss(fault: FaultInjection): Promise<Result<number>> {
    const lossPercent = fault.parameters.packetLossPercent ?? 10;
    console.log(`Injecting packet loss: ${lossPercent}% to ${fault.target.selector}`);
    return ok(1);
  }

  private async injectCpuStress(fault: FaultInjection): Promise<Result<number>> {
    const cpuPercent = fault.parameters.cpuPercent ?? 80;
    console.log(`Injecting CPU stress: ${cpuPercent}% to ${fault.target.selector}`);
    return ok(1);
  }

  private async injectMemoryStress(fault: FaultInjection): Promise<Result<number>> {
    const memoryBytes = fault.parameters.memoryBytes ?? 1024 * 1024 * 100; // 100MB
    console.log(`Injecting memory stress: ${memoryBytes} bytes to ${fault.target.selector}`);
    return ok(1);
  }

  private async injectDiskStress(fault: FaultInjection): Promise<Result<number>> {
    console.log(`Injecting disk stress to ${fault.target.selector}`);
    return ok(1);
  }

  private async injectNetworkPartition(fault: FaultInjection): Promise<Result<number>> {
    console.log(`Injecting network partition to ${fault.target.selector}`);
    return ok(1);
  }

  private async injectDnsFailure(fault: FaultInjection): Promise<Result<number>> {
    console.log(`Injecting DNS failure to ${fault.target.selector}`);
    return ok(1);
  }

  private async injectProcessKill(fault: FaultInjection): Promise<Result<number>> {
    console.log(`Injecting process kill to ${fault.target.selector}`);
    return ok(1);
  }

  private async performFaultRemoval(fault: FaultInjection): Promise<void> {
    // Stub: Would remove the injected fault
    console.log(`Removing fault: ${fault.id} (${fault.type})`);
  }

  private async collectMetricsDuringExperiment(
    execution: ExperimentExecution,
    experiment: ChaosExperiment
  ): Promise<void> {
    // Stub: Collect metrics during experiment execution
    // In production, this would poll metrics endpoints

    const metricsToCollect = experiment.hypothesis.metrics.map((m) => m.metric);
    const startTime = Date.now();
    const duration = Math.max(
      ...experiment.faults.map((f) => f.duration),
      this.config.defaultTimeout
    );

    // Simulate metric collection
    while (Date.now() - startTime < Math.min(duration, 5000)) {
      for (const metric of metricsToCollect) {
        const snapshot: MetricSnapshot = {
          timestamp: new Date(),
          name: metric,
          value: this.generateSimulatedMetricValue(metric),
          labels: { experiment: experiment.id },
        };
        execution.result.metrics.push(snapshot);
      }
      await this.sleep(this.config.safetyCheckInterval);
    }
  }

  private generateSimulatedMetricValue(metric: string): number {
    // Stub: Generate simulated metric values for testing
    const baseValues: Record<string, number> = {
      'response_time_ms': 100 + Math.random() * 50,
      'error_rate': Math.random() * 0.05,
      'throughput': 1000 + Math.random() * 200,
      'cpu_usage': 50 + Math.random() * 20,
      'memory_usage': 60 + Math.random() * 15,
    };

    return baseValues[metric] ?? Math.random() * 100;
  }

  private validateHypothesis(
    hypothesis: ChaosExperiment['hypothesis'],
    metrics: MetricSnapshot[]
  ): boolean {
    // Check each metric expectation
    for (const expectation of hypothesis.metrics) {
      const relevantMetrics = metrics.filter((m) => m.name === expectation.metric);

      if (relevantMetrics.length === 0) {
        return false; // Missing metric data
      }

      const avgValue =
        relevantMetrics.reduce((sum, m) => sum + m.value, 0) / relevantMetrics.length;

      if (!this.checkMetricExpectation(avgValue, expectation)) {
        return false;
      }
    }

    // Check tolerances
    for (const tolerance of hypothesis.tolerances) {
      const relevantMetrics = metrics.filter((m) => m.name === tolerance.metric);

      if (relevantMetrics.length === 0) continue;

      const values = relevantMetrics.map((m) => m.value);
      const deviation = this.calculateDeviation(values);

      const maxAllowed =
        tolerance.unit === 'percent'
          ? (deviation / values[0]) * 100
          : deviation;

      if (maxAllowed > tolerance.maxDeviation) {
        return false;
      }
    }

    return true;
  }

  private checkMetricExpectation(
    actual: number,
    expectation: ChaosExperiment['hypothesis']['metrics'][0]
  ): boolean {
    const { operator, value } = expectation;

    switch (operator) {
      case 'eq':
        return actual === value;
      case 'lt':
        return actual < (value as number);
      case 'gt':
        return actual > (value as number);
      case 'lte':
        return actual <= (value as number);
      case 'gte':
        return actual >= (value as number);
      case 'between':
        const [min, max] = value as [number, number];
        return actual >= min && actual <= max;
      default:
        return false;
    }
  }

  private calculateDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  private determineExperimentStatus(
    execution: ExperimentExecution,
    finalSteadyState: boolean
  ): ExperimentStatus {
    if (!execution.result.steadyStateVerified) {
      return 'failed';
    }

    if (!finalSteadyState) {
      return 'failed';
    }

    if (execution.result.hypothesisValidated) {
      return 'completed';
    }

    // Check if any faults failed to inject
    const failedFaults = execution.result.faultResults.filter((f) => !f.injected);
    if (failedFaults.length > 0) {
      return 'failed';
    }

    return 'completed';
  }

  private async rollbackExperiment(experiment: ChaosExperiment): Promise<void> {
    // Execute rollback steps
    for (const step of experiment.rollbackPlan.steps.sort((a, b) => a.order - b.order)) {
      console.log(`Executing rollback step ${step.order}: ${step.action}`);
      // Stub: Would execute actual rollback action
    }

    // Remove all active faults
    for (const fault of experiment.faults) {
      await this.removeFault(fault.id);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
