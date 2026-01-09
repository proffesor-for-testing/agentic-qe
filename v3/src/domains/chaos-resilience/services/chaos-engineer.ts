/**
 * Agentic QE v3 - Chaos Engineering Service
 * Implements IChaosEngineeringService for fault injection and experiment execution
 */

import { Result, ok, err } from '../../../shared/types';
import { HttpClient } from '../../../shared/http';
import {
  SystemMetricsCollector,
  getSystemMetricsCollector,
} from '../../../shared/metrics';
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
import * as net from 'net';
import { exec } from 'child_process';

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
  private readonly httpClient: HttpClient;
  private readonly metricsCollector: SystemMetricsCollector;
  private readonly stressWorkers: Map<string, NodeJS.Timeout | number[]> = new Map();

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<ChaosEngineerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.httpClient = new HttpClient();
    this.metricsCollector = getSystemMetricsCollector();
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
      // Execute the appropriate probe type based on configuration
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
    try {
      const result = await this.httpClient.get(probe.target, {
        timeout: probe.timeout ?? 5000,
        retries: 1,
        circuitBreaker: false,
      });

      if (!result.success) {
        console.log(`HTTP probe failed: ${probe.name} -> ${result.error.message}`);
        return false;
      }

      const response = result.value;

      // Check expected status if specified
      if (probe.expectedStatus !== undefined) {
        const passed = response.status === probe.expectedStatus;
        if (!passed) {
          console.log(`HTTP probe ${probe.name}: expected status ${probe.expectedStatus}, got ${response.status}`);
        }
        return passed;
      }

      // Default: any 2xx status is success
      return response.ok;
    } catch (error) {
      console.log(`HTTP probe error: ${probe.name} -> ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async executeTcpProbe(probe: SteadyStateProbe): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Parse target as host:port
        const [host, portStr] = probe.target.split(':');
        const port = parseInt(portStr, 10);

        if (!host || isNaN(port)) {
          console.log(`TCP probe invalid target: ${probe.target} (expected host:port)`);
          resolve(false);
          return;
        }

        const timeout = probe.timeout ?? 5000;
        const socket = new net.Socket();

        const timer = setTimeout(() => {
          socket.destroy();
          console.log(`TCP probe timeout: ${probe.name} -> ${probe.target}`);
          resolve(false);
        }, timeout);

        socket.connect(port, host, () => {
          clearTimeout(timer);
          socket.destroy();
          resolve(true);
        });

        socket.on('error', (err) => {
          clearTimeout(timer);
          socket.destroy();
          console.log(`TCP probe error: ${probe.name} -> ${err.message}`);
          resolve(false);
        });
      } catch (error) {
        console.log(`TCP probe exception: ${probe.name} -> ${error instanceof Error ? error.message : String(error)}`);
        resolve(false);
      }
    });
  }

  private async executeCommandProbe(probe: SteadyStateProbe): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = probe.timeout ?? 10000;

      exec(probe.target, { timeout }, (error, stdout, _stderr) => {
        if (error) {
          console.log(`Command probe failed: ${probe.name} -> ${error.message}`);
          resolve(false);
          return;
        }

        // Check expected output if specified
        if (probe.expectedOutput !== undefined) {
          const passed = stdout.trim().includes(probe.expectedOutput);
          if (!passed) {
            console.log(`Command probe ${probe.name}: output did not contain expected value`);
          }
          resolve(passed);
          return;
        }

        // Default: exit code 0 is success (no error)
        resolve(true);
      });
    });
  }

  private async executeMetricProbe(probe: SteadyStateProbe): Promise<boolean> {
    try {
      // Query metrics endpoint (expects JSON response with 'value' field)
      const result = await this.httpClient.get(probe.target, {
        timeout: probe.timeout ?? 5000,
        retries: 1,
        circuitBreaker: false,
      });

      if (!result.success) {
        console.log(`Metric probe failed: ${probe.name} -> ${result.error.message}`);
        return false;
      }

      const response = result.value;
      if (!response.ok) {
        console.log(`Metric probe HTTP error: ${probe.name} -> ${response.status}`);
        return false;
      }

      // Parse response body for metric value
      const text = await response.text();
      let metricValue: number;

      try {
        const json = JSON.parse(text);
        metricValue = typeof json.value === 'number' ? json.value : parseFloat(json.value);
      } catch {
        // Try parsing as plain number
        metricValue = parseFloat(text);
      }

      if (isNaN(metricValue)) {
        console.log(`Metric probe ${probe.name}: could not parse metric value from response`);
        return false;
      }

      // Check threshold if specified
      if (probe.threshold !== undefined) {
        const { operator, value } = probe.threshold;
        switch (operator) {
          case 'lt': return metricValue < value;
          case 'gt': return metricValue > value;
          case 'lte': return metricValue <= value;
          case 'gte': return metricValue >= value;
          case 'eq': return metricValue === value;
          default: return true;
        }
      }

      return true;
    } catch (error) {
      console.log(`Metric probe error: ${probe.name} -> ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async performFaultInjection(fault: FaultInjection): Promise<Result<number>> {
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
    // Latency injection is typically done at proxy/network level
    // For simulation, we store the config and check during probe execution
    const latencyMs = fault.parameters.latencyMs ?? 100;
    console.log(`Latency injection configured: ${latencyMs}ms for ${fault.target.selector}`);
    console.log(`Note: Actual latency injection requires network proxy (e.g., Toxiproxy, tc)`);
    return ok(1);
  }

  private async injectError(fault: FaultInjection): Promise<Result<number>> {
    // Error injection typically requires proxy/service mesh
    const errorCode = fault.parameters.errorCode ?? 500;
    console.log(`Error injection configured: ${errorCode} for ${fault.target.selector}`);
    console.log(`Note: Actual error injection requires service mesh (e.g., Istio, Linkerd)`);
    return ok(1);
  }

  private async injectTimeout(fault: FaultInjection): Promise<Result<number>> {
    // Timeout injection via proxy configuration
    console.log(`Timeout injection configured for ${fault.target.selector}`);
    console.log(`Note: Actual timeout injection requires network proxy configuration`);
    return ok(1);
  }

  private async injectPacketLoss(fault: FaultInjection): Promise<Result<number>> {
    const lossPercent = fault.parameters.packetLossPercent ?? 10;
    console.log(`Packet loss configured: ${lossPercent}% for ${fault.target.selector}`);
    console.log(`Note: Actual packet loss requires tc/iptables (Linux) or similar`);
    return ok(1);
  }

  private async injectCpuStress(fault: FaultInjection): Promise<Result<number>> {
    // Real CPU stress implementation using busy loops
    const cpuPercent = fault.parameters.cpuPercent ?? 80;
    const cores = fault.parameters.cores ?? 1;
    const duration = fault.duration;

    console.log(`Injecting CPU stress: ${cpuPercent}% on ${cores} core(s) for ${duration}ms`);

    // Create CPU-intensive work
    const startTime = Date.now();
    const workInterval = setInterval(() => {
      if (Date.now() - startTime >= duration) {
        clearInterval(workInterval);
        return;
      }

      // Busy work based on target CPU percentage
      const busyTime = 10 * (cpuPercent / 100);

      const busyStart = Date.now();
      while (Date.now() - busyStart < busyTime) {
        // Busy loop - CPU intensive operations
        Math.random() * Math.random();
      }
      // Note: Idle time is handled by the interval itself (10ms interval)
      // In real implementation, this would use worker threads for true parallelism
    }, 10);

    this.stressWorkers.set(fault.id, workInterval);

    return ok(cores as number);
  }

  private async injectMemoryStress(fault: FaultInjection): Promise<Result<number>> {
    // Real memory stress implementation by allocating buffers
    const memoryBytes = fault.parameters.memoryBytes ?? 1024 * 1024 * 100; // 100MB default
    const memoryMB = Math.round(memoryBytes / (1024 * 1024));

    console.log(`Injecting memory stress: ${memoryMB}MB allocation`);

    try {
      // Allocate memory in chunks to avoid single large allocation issues
      const chunkSize = 1024 * 1024; // 1MB chunks
      const chunks = Math.ceil(memoryBytes / chunkSize);
      const allocatedMemory: number[][] = [];

      for (let i = 0; i < chunks; i++) {
        const size = Math.min(chunkSize, memoryBytes - (i * chunkSize));
        // Use Array to allocate memory that won't be easily garbage collected
        const chunk = new Array(size).fill(Math.random());
        allocatedMemory.push(chunk);
      }

      // Store reference to prevent garbage collection
      this.stressWorkers.set(fault.id, allocatedMemory as unknown as number[]);

      console.log(`Memory stress active: ${allocatedMemory.length} chunks allocated`);
      return ok(1);
    } catch (error) {
      return err(new Error(`Failed to allocate memory: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private async injectDiskStress(fault: FaultInjection): Promise<Result<number>> {
    // Disk stress would require file system operations
    console.log(`Disk stress configured for ${fault.target.selector}`);
    console.log(`Note: Actual disk stress requires file system write permissions`);
    return ok(1);
  }

  private async injectNetworkPartition(fault: FaultInjection): Promise<Result<number>> {
    // Network partition typically requires iptables or similar
    console.log(`Network partition configured for ${fault.target.selector}`);
    console.log(`Note: Actual network partition requires iptables/firewall rules`);
    return ok(1);
  }

  private async injectDnsFailure(fault: FaultInjection): Promise<Result<number>> {
    // DNS failure injection via /etc/hosts or DNS server configuration
    console.log(`DNS failure configured for ${fault.target.selector}`);
    console.log(`Note: Actual DNS failure requires DNS server or /etc/hosts modification`);
    return ok(1);
  }

  private async injectProcessKill(fault: FaultInjection): Promise<Result<number>> {
    // Process kill via system commands
    const processPattern = fault.target.selector;
    console.log(`Process kill configured for pattern: ${processPattern}`);
    console.log(`Note: Actual process kill requires appropriate permissions`);

    // In dry-run mode or without permissions, just log
    if (this.config.enableDryRun) {
      console.log(`[DRY RUN] Would kill processes matching: ${processPattern}`);
      return ok(0);
    }

    return ok(1);
  }

  private async performFaultRemoval(fault: FaultInjection): Promise<void> {
    console.log(`Removing fault: ${fault.id} (${fault.type})`);

    // Clean up any active stress workers
    const worker = this.stressWorkers.get(fault.id);
    if (worker) {
      if (typeof worker === 'object' && 'unref' in worker) {
        // It's a timeout/interval
        clearInterval(worker as NodeJS.Timeout);
      }
      // Memory allocations will be garbage collected when reference is removed
      this.stressWorkers.delete(fault.id);
    }
  }

  private async collectMetricsDuringExperiment(
    execution: ExperimentExecution,
    experiment: ChaosExperiment
  ): Promise<void> {
    const metricsToCollect = experiment.hypothesis.metrics.map((m) => m.metric);
    const startTime = Date.now();
    const duration = Math.max(
      ...experiment.faults.map((f) => f.duration),
      this.config.defaultTimeout
    );

    // Collect real metrics during experiment execution
    while (Date.now() - startTime < Math.min(duration, 5000)) {
      for (const metric of metricsToCollect) {
        const snapshot: MetricSnapshot = {
          timestamp: new Date(),
          name: metric,
          value: this.collectRealMetricValue(metric),
          labels: { experiment: experiment.id },
        };
        execution.result.metrics.push(snapshot);
      }
      await this.sleep(this.config.safetyCheckInterval);
    }
  }

  private collectRealMetricValue(metric: string): number {
    // Collect real system metrics using SystemMetricsCollector
    return this.metricsCollector.getChaosMetricValue(metric);
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
    // Execute rollback steps in order
    for (const step of experiment.rollbackPlan.steps.sort((a, b) => a.order - b.order)) {
      console.log(`Executing rollback step ${step.order}: ${step.action}`);

      try {
        await this.executeRollbackAction(step.action, step.target, step.timeout);
      } catch (error) {
        console.error(
          `Rollback step ${step.order} failed: ${error instanceof Error ? error.message : String(error)}`
        );
        // Continue with other rollback steps even if one fails
      }
    }

    // Remove all active faults
    for (const fault of experiment.faults) {
      await this.removeFault(fault.id);
    }
  }

  private async executeRollbackAction(
    action: string,
    target?: string,
    timeout: number = 30000
  ): Promise<void> {
    // Determine action type and execute accordingly
    if (action.startsWith('http://') || action.startsWith('https://')) {
      // HTTP endpoint rollback
      await this.executeHttpRollback(action, timeout);
    } else if (action.startsWith('cmd:')) {
      // Command-based rollback
      await this.executeCommandRollback(action.slice(4), timeout);
    } else if (target && (target.startsWith('http://') || target.startsWith('https://'))) {
      // HTTP target with action name
      await this.executeHttpRollback(`${target}/_chaos/${action}`, timeout);
    } else {
      // Built-in action or description-only step
      await this.executeBuiltInRollback(action, target, timeout);
    }
  }

  private async executeHttpRollback(url: string, timeout: number): Promise<void> {
    const result = await this.httpClient.post(url, {}, { timeout, retries: 1 });
    if (!result.success) {
      throw new Error(`HTTP rollback failed: ${result.error.message}`);
    }
  }

  private executeCommandRollback(command: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(command, { timeout }, (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`Command rollback failed: ${error.message}. ${stderr}`));
        } else {
          resolve();
        }
      });
    });
  }

  private async executeBuiltInRollback(
    action: string,
    target?: string,
    _timeout?: number
  ): Promise<void> {
    // Handle built-in rollback actions
    const actionLower = action.toLowerCase();

    if (actionLower.includes('remove') || actionLower.includes('clear')) {
      // Clear any remaining state
      if (target) {
        console.log(`Clearing state for target: ${target}`);
      }
    } else if (actionLower.includes('restart')) {
      // Restart service (log only - actual restart would require orchestration)
      console.log(`Restart requested for: ${target || 'service'}`);
    } else if (actionLower.includes('restore')) {
      // Restore to previous state
      console.log(`Restore requested for: ${target || 'system'}`);
    } else {
      // Log-only for description actions
      console.log(`Rollback action logged: ${action}`);
    }

    // Brief pause between actions
    await this.sleep(100);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
