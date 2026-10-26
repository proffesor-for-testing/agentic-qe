/**
 * Agentic QE v3 - Chaos Resilience MCP Tool
 *
 * qe/chaos/inject - Chaos engineering fault injection
 *
 * This tool wraps the chaos-resilience domain service:
 * - ChaosEngineerService for fault injection and experiment execution
 */

import { v4 as uuidv4 } from 'uuid';
import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema, getSharedMemoryBackend, getLLMRouter } from '../base.js';
import { ToolResult } from '../../types.js';
import { MemoryBackend } from '../../../kernel/interfaces.js';
import { ChaosEngineerService } from '../../../domains/chaos-resilience/services/chaos-engineer.js';
import { toErrorMessage } from '../../../shared/error-utils.js';
import {
  ChaosExperiment,
  FaultInjection,
  FaultType as DomainFaultType,
  SteadyStateDefinition,
  ExperimentResult as DomainExperimentResult,
  Incident as DomainIncident,
} from '../../../domains/chaos-resilience/interfaces.js';

// ============================================================================
// Types
// ============================================================================

export interface ChaosInjectParams {
  faultType: FaultType;
  target: string;
  duration?: number;
  intensity?: number;
  dryRun?: boolean;
  hypothesis?: string;
  rollbackOnFailure?: boolean;
  [key: string]: unknown;
}

export type FaultType =
  | 'latency'
  | 'error'
  | 'timeout'
  | 'cpu-stress'
  | 'memory-stress'
  | 'network-partition'
  | 'packet-loss'
  | 'dns-failure'
  | 'process-kill';

export interface ChaosInjectResult {
  experimentId: string;
  status: ExperimentStatus;
  faultInjected: boolean;
  hypothesisValidated?: boolean;
  steadyStateVerified: boolean;
  metrics: ExperimentMetrics;
  incidents: Incident[];
  recommendations: string[];
  /** Why nothing was measured, when status is 'not-executed' (#1258). */
  note?: string;
}

export type ExperimentStatus =
  | 'pending' | 'running' | 'completed' | 'failed' | 'rolled-back' | 'aborted' | 'not-executed';

export interface ExperimentMetrics {
  faultDuration: number;
  targetAffected: boolean;
  recoveryTime?: number;
  errorRate?: number;
  latencyP99?: number;
}

export interface Incident {
  type: 'alert' | 'error' | 'degradation';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  timestamp: string;
  resolved: boolean;
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class ChaosInjectTool extends MCPToolBase<ChaosInjectParams, ChaosInjectResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/chaos/inject',
    description: 'Inject faults for chaos engineering. Supports latency, errors, CPU/memory stress, network issues, and more.',
    domain: 'chaos-resilience',
    schema: CHAOS_INJECT_SCHEMA,
    streaming: true,
    timeout: 300000,
  };

  private chaosEngineer: ChaosEngineerService | null = null;

  private async getService(context: MCPToolContext): Promise<ChaosEngineerService> {
    if (!this.chaosEngineer) {
      const memory = (context as unknown as Record<string, unknown>).memory as MemoryBackend || await getSharedMemoryBackend();
      // ADR-043 wiring.
      const llmRouter = await getLLMRouter(context);
      this.chaosEngineer = new ChaosEngineerService({ memory, llmRouter }, {
        enableDryRun: true,
        autoRollbackOnFailure: true,
      });
    }
    return this.chaosEngineer;
  }

  async execute(
    params: ChaosInjectParams,
    context: MCPToolContext
  ): Promise<ToolResult<ChaosInjectResult>> {
    const {
      faultType,
      target,
      duration = 30000,
      intensity = 50,
      dryRun = true,
      hypothesis,
      rollbackOnFailure = true,
    } = params;

    const chaosEngineer = await this.getService(context);

    try {
      this.emitStream(context, {
        status: 'preparing',
        message: `Preparing ${faultType} fault injection on ${target}`,
        dryRun,
      });

      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      const experimentId = context.requestId || uuidv4();

      // Build a chaos experiment from the simple parameters
      const experiment = this.buildExperiment(
        experimentId,
        faultType,
        target,
        duration,
        intensity,
        hypothesis,
        rollbackOnFailure
      );

      // Phase 1: Verify steady state
      this.emitStream(context, {
        status: 'verifying',
        message: 'Verifying steady state',
      });

      const steadyStateResult = await chaosEngineer.verifySteadyState(experiment.steadyState);
      const steadyStateVerified = steadyStateResult.success && steadyStateResult.value;

      if (!steadyStateVerified && !dryRun) {
        return {
          success: false,
          error: 'Steady state verification failed. System not in healthy state for chaos experiment.',
        };
      }

      // Phase 2: Create and store experiment
      const createResult = await chaosEngineer.createExperiment(experiment);
      if (!createResult.success) {
        return {
          success: false,
          error: `Failed to create experiment: ${createResult.error.message}`,
        };
      }

      // Phase 3: Inject fault (a dry run injects nothing)
      this.emitStream(context, {
        status: 'injecting',
        message: dryRun
          ? `[DRY RUN] Planning ${faultType} fault (not injected)`
          : `Injecting ${faultType} fault`,
      });

      let faultInjected = false;
      let hypothesisValidated: boolean | undefined;
      let status: ExperimentStatus = 'pending';
      const incidents: Incident[] = [];
      let metrics: ExperimentMetrics = {
        faultDuration: duration,
        targetAffected: !dryRun,
      };

      let note: string | undefined;

      if (dryRun) {
        // #1258: a dry run injects nothing, so there are no metrics, incidents
        // or hypothesis verdict to report. It used to return 'completed' with
        // simulated recovery/latency numbers.
        faultInjected = false;
        status = 'not-executed';
        note = `Dry run: the ${faultType} experiment was planned but no fault was injected, ` +
          'so no metrics were measured and the hypothesis was not tested.';
      } else {
        // Real execution - run the experiment
        const runResult = await chaosEngineer.runExperiment(experimentId);

        if (runResult.success) {
          const result = runResult.value;
          faultInjected = result.faultResults.some(f => f.injected);
          hypothesisValidated = result.hypothesisValidated;
          status = result.status;

          // Convert domain incidents to MCP format
          for (const incident of result.incidents) {
            incidents.push(this.convertIncident(incident));
          }

          // Extract metrics from experiment result
          metrics = this.extractMetrics(result, faultType, duration);
        } else {
          status = 'failed';
          incidents.push({
            type: 'error',
            severity: 'critical',
            message: runResult.error.message,
            timestamp: new Date().toISOString(),
            resolved: false,
          });
        }
      }

      // Phase 4: Monitor
      this.emitStream(context, {
        status: 'monitoring',
        message: 'Monitoring system behavior',
      });

      // Determine final status based on incidents
      if (!dryRun && incidents.some(i => i.severity === 'critical' && !i.resolved)) {
        status = rollbackOnFailure ? 'rolled-back' : 'failed';
      }

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        faultType,
        metrics,
        incidents,
        hypothesisValidated
      );

      this.emitStream(context, {
        status: 'complete',
        message: `Chaos experiment ${status}`,
        progress: 100,
      });

      return {
        success: true,
        data: {
          experimentId,
          status,
          faultInjected,
          hypothesisValidated,
          steadyStateVerified,
          metrics,
          incidents,
          recommendations,
          ...(note ? { note } : {}),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Chaos injection failed: ${toErrorMessage(error)}`,
      };
    }
  }

  private buildExperiment(
    experimentId: string,
    faultType: FaultType,
    target: string,
    duration: number,
    intensity: number,
    hypothesis?: string,
    rollbackOnFailure: boolean = true
  ): ChaosExperiment {
    // Build fault injection
    const fault: FaultInjection = {
      id: `fault-${experimentId}`,
      type: faultType as DomainFaultType,
      target: {
        type: 'service',
        selector: target,
      },
      duration,
      parameters: this.buildFaultParameters(faultType, intensity),
    };

    // Build steady state definition with basic probe
    const steadyState: SteadyStateDefinition = {
      description: `Steady state for ${target}`,
      probes: [
        {
          name: 'target-health',
          type: target.startsWith('http') ? 'http' : 'command',
          target: target.startsWith('http') ? target : `echo "checking ${target}"`,
          expected: target.startsWith('http') ? 200 : 'OK',
          timeout: 5000,
        },
      ],
    };

    // Build hypothesis
    const experimentHypothesis = hypothesis || `System should remain stable under ${faultType} fault`;

    return {
      id: experimentId,
      name: `${faultType}-experiment-${Date.now()}`,
      description: `Chaos experiment: ${faultType} on ${target}`,
      hypothesis: {
        statement: experimentHypothesis,
        metrics: [
          {
            metric: faultType === 'latency' ? 'response_time' : 'error_rate',
            operator: 'lt' as const,
            value: faultType === 'latency' ? 5000 : 50,
          },
        ],
        tolerances: [
          {
            metric: 'availability',
            maxDeviation: 20,
            unit: 'percent',
          },
        ],
      },
      steadyState,
      faults: [fault],
      blastRadius: {
        scope: 'single',
        maxAffected: 1,
        excludeProduction: true,
      },
      rollbackPlan: {
        automatic: rollbackOnFailure,
        triggerConditions: [
          {
            type: 'error-rate',
            condition: 'error_rate > 50%',
          },
        ],
        steps: [
          {
            order: 1,
            action: `remove-fault`,
            target: fault.id,
            timeout: 10000,
          },
        ],
      },
      schedule: {
        type: 'once',
      },
    };
  }

  private buildFaultParameters(faultType: FaultType, intensity: number): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    switch (faultType) {
      case 'latency':
        params.latencyMs = 100 + (intensity * 20); // 100-2100ms based on intensity
        break;
      case 'error':
        params.errorCode = 500;
        params.errorRate = intensity / 100;
        break;
      case 'timeout':
        params.timeoutMs = 5000 + (intensity * 250); // 5-30s timeout
        break;
      case 'cpu-stress':
        params.cpuPercent = intensity;
        params.cores = Math.max(1, Math.floor(intensity / 25));
        break;
      case 'memory-stress':
        params.memoryBytes = (intensity / 100) * 512 * 1024 * 1024; // Up to 512MB
        break;
      case 'network-partition':
        params.partitionPercent = intensity;
        break;
      case 'packet-loss':
        params.packetLossPercent = intensity;
        break;
      case 'dns-failure':
        params.failureRate = intensity / 100;
        break;
      case 'process-kill':
        params.signal = 'SIGTERM';
        break;
    }

    return params;
  }


  private extractMetrics(
    result: DomainExperimentResult,
    faultType: FaultType,
    duration: number
  ): ExperimentMetrics {
    const metrics: ExperimentMetrics = {
      faultDuration: duration,
      targetAffected: result.faultResults.some(f => f.injected && f.affectedTargets > 0),
    };

    // Extract specific metrics from result
    const metricSnapshots = result.metrics;

    // Find recovery time
    if (result.endTime && result.startTime) {
      metrics.recoveryTime = result.endTime.getTime() - result.startTime.getTime();
    }

    // Find latency metrics
    const latencyMetric = metricSnapshots.find(m => m.name.includes('latency') || m.name.includes('response'));
    if (latencyMetric) {
      metrics.latencyP99 = latencyMetric.value;
    }

    // Find error rate metrics
    const errorMetric = metricSnapshots.find(m => m.name.includes('error') || m.name.includes('failure'));
    if (errorMetric) {
      metrics.errorRate = errorMetric.value;
    }

    return metrics;
  }

  private convertIncident(incident: DomainIncident): Incident {
    return {
      type: incident.type,
      severity: incident.severity,
      message: incident.message,
      timestamp: incident.timestamp instanceof Date
        ? incident.timestamp.toISOString()
        : String(incident.timestamp),
      resolved: incident.resolved,
    };
  }



  private generateRecommendations(
    faultType: FaultType,
    metrics: ExperimentMetrics,
    incidents: Incident[],
    hypothesisValidated?: boolean
  ): string[] {
    const recs: string[] = [];

    if (hypothesisValidated === false) {
      recs.push('Hypothesis was not validated - review resilience patterns');
    }

    if (metrics.recoveryTime && metrics.recoveryTime > 30000) {
      recs.push('Recovery time exceeds 30s - consider adding circuit breakers');
    }

    if (metrics.errorRate && metrics.errorRate > 20) {
      recs.push('High error rate observed - implement retry with backoff');
    }

    if (incidents.some(i => i.severity === 'critical')) {
      recs.push('Critical incidents occurred - review fault tolerance mechanisms');
    }

    switch (faultType) {
      case 'latency':
        if (metrics.latencyP99 && metrics.latencyP99 > 1000) {
          recs.push('P99 latency exceeds 1s - consider timeout configurations');
        }
        break;
      case 'network-partition':
        recs.push('Ensure services can operate in degraded mode during network issues');
        break;
      case 'cpu-stress':
      case 'memory-stress':
        recs.push('Review resource limits and auto-scaling policies');
        break;
      case 'error':
        recs.push('Implement proper error handling and fallback mechanisms');
        break;
      case 'timeout':
        recs.push('Configure appropriate timeout values and circuit breakers');
        break;
    }

    if (recs.length === 0) {
      recs.push('System showed good resilience - continue regular chaos experiments');
    }

    return recs;
  }
}

// ============================================================================
// Schema
// ============================================================================

const CHAOS_INJECT_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    faultType: {
      type: 'string',
      description: 'Type of fault to inject',
      enum: ['latency', 'error', 'timeout', 'cpu-stress', 'memory-stress', 'network-partition', 'packet-loss', 'dns-failure', 'process-kill'],
    },
    target: {
      type: 'string',
      description: 'Target service, pod, or endpoint',
    },
    duration: {
      type: 'number',
      description: 'Fault duration in milliseconds',
      minimum: 1000,
      maximum: 300000,
      default: 30000,
    },
    intensity: {
      type: 'number',
      description: 'Fault intensity (0-100)',
      minimum: 0,
      maximum: 100,
      default: 50,
    },
    dryRun: {
      type: 'boolean',
      description: 'Plan the experiment without injecting a fault; nothing is measured',
      default: true,
    },
    hypothesis: {
      type: 'string',
      description: 'Hypothesis to validate (e.g., "System should recover within 30s")',
    },
    rollbackOnFailure: {
      type: 'boolean',
      description: 'Auto-rollback on critical failure',
      default: true,
    },
  },
  required: ['faultType', 'target'],
};
