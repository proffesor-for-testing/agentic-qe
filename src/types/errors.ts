/**
 * Error type definitions for Agentic QE Framework
 */

// ============================================================================
// Base Error Classes
// ============================================================================

export abstract class QEError extends Error {
  abstract readonly code: string;
  abstract readonly category: 'agent' | 'test' | 'quality' | 'system';
  readonly timestamp: Date = new Date();
  readonly context: Record<string, unknown>;

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack
    };
  }
}

// ============================================================================
// Agent Errors
// ============================================================================

export abstract class AgentError extends QEError {
  readonly category = 'agent' as const;
  abstract readonly code: string;
}

export class AgentSpawnError extends AgentError {
  readonly code = 'AGENT_SPAWN_FAILED';

  constructor(agentType: string, reason: string, context: Record<string, unknown> = {}) {
    super(`Failed to spawn agent of type '${agentType}': ${reason}`, context);
  }
}

export class AgentCommunicationError extends AgentError {
  readonly code = 'AGENT_COMMUNICATION_FAILED';

  constructor(fromAgent: string, toAgent: string, reason: string, context: Record<string, unknown> = {}) {
    super(`Communication failed from ${fromAgent} to ${toAgent}: ${reason}`, context);
  }
}

export class AgentTimeoutError extends AgentError {
  readonly code = 'AGENT_TIMEOUT';

  constructor(agentId: string, operation: string, timeout: number, context: Record<string, unknown> = {}) {
    super(`Agent ${agentId} timed out during ${operation} after ${timeout}ms`, context);
  }
}

export class AgentCapabilityError extends AgentError {
  readonly code = 'AGENT_CAPABILITY_MISSING';

  constructor(agentId: string, requiredCapability: string, context: Record<string, unknown> = {}) {
    super(`Agent ${agentId} missing required capability: ${requiredCapability}`, context);
  }
}

// ============================================================================
// Test Errors
// ============================================================================

export abstract class TestError extends QEError {
  readonly category = 'test' as const;
  abstract readonly code: string;
}

export class TestGenerationError extends TestError {
  readonly code = 'TEST_GENERATION_FAILED' as const;

  constructor(reason: string, context: Record<string, unknown> = {}) {
    super(`Test generation failed: ${reason}`, context);
  }
}

export class TestExecutionError extends TestError {
  readonly code = 'TEST_EXECUTION_FAILED' as const;

  constructor(testId: string, reason: string, context: Record<string, unknown> = {}) {
    super(`Test execution failed for ${testId}: ${reason}`, context);
  }
}

export class TestFrameworkError extends TestError {
  readonly code = 'TEST_FRAMEWORK_ERROR' as const;

  constructor(framework: string, reason: string, context: Record<string, unknown> = {}) {
    super(`Test framework error (${framework}): ${reason}`, context);
  }
}

export class TestValidationError extends TestError {
  readonly code = 'TEST_VALIDATION_FAILED' as const;

  constructor(testId: string, validationRule: string, context: Record<string, unknown> = {}) {
    super(`Test validation failed for ${testId}: ${validationRule}`, context);
  }
}

// ============================================================================
// Quality Errors
// ============================================================================

export abstract class QualityError extends QEError {
  readonly category = 'quality' as const;
  abstract readonly code: string;
}

export class QualityGateError extends QualityError {
  readonly code = 'QUALITY_GATE_FAILED';

  constructor(gateId: string, reason: string, context: Record<string, unknown> = {}) {
    super(`Quality gate ${gateId} failed: ${reason}`, context);
  }
}

export class CoverageAnalysisError extends QualityError {
  readonly code = 'COVERAGE_ANALYSIS_FAILED';

  constructor(reason: string, context: Record<string, unknown> = {}) {
    super(`Coverage analysis failed: ${reason}`, context);
  }
}

export class DefectPredictionError extends QualityError {
  readonly code = 'DEFECT_PREDICTION_FAILED';

  constructor(reason: string, context: Record<string, unknown> = {}) {
    super(`Defect prediction failed: ${reason}`, context);
  }
}

export class QualityMetricsError extends QualityError {
  readonly code = 'QUALITY_METRICS_ERROR';

  constructor(metric: string, reason: string, context: Record<string, unknown> = {}) {
    super(`Quality metrics error for ${metric}: ${reason}`, context);
  }
}

// ============================================================================
// System Errors
// ============================================================================

export abstract class SystemError extends QEError {
  readonly category = 'system' as const;
  abstract readonly code: string;
}

export class ConfigurationError extends SystemError {
  readonly code = 'CONFIGURATION_ERROR';

  constructor(configKey: string, reason: string, context: Record<string, unknown> = {}) {
    super(`Configuration error for ${configKey}: ${reason}`, context);
  }
}

export class ResourceError extends SystemError {
  readonly code = 'RESOURCE_ERROR';

  constructor(resource: string, reason: string, context: Record<string, unknown> = {}) {
    super(`Resource error for ${resource}: ${reason}`, context);
  }
}

export class MemoryError extends SystemError {
  readonly code = 'MEMORY_ERROR';

  constructor(operation: string, reason: string, context: Record<string, unknown> = {}) {
    super(`Memory error during ${operation}: ${reason}`, context);
  }
}

export class NetworkError extends SystemError {
  readonly code = 'NETWORK_ERROR';

  constructor(operation: string, reason: string, context: Record<string, unknown> = {}) {
    super(`Network error during ${operation}: ${reason}`, context);
  }
}

// ============================================================================
// Error Utilities
// ============================================================================

export function isQEError(error: unknown): error is QEError {
  return error instanceof QEError;
}

export function createErrorFromCode(code: string, message: string, context: Record<string, unknown> = {}): QEError {
  switch (code) {
    case 'AGENT_SPAWN_FAILED':
      return new AgentSpawnError('unknown', message, context);
    case 'TEST_GENERATION_FAILED':
      return new TestGenerationError(message, context);
    case 'QUALITY_GATE_FAILED':
      return new QualityGateError('unknown', message, context);
    case 'CONFIGURATION_ERROR':
      return new ConfigurationError('unknown', message, context);
    default:
      return new ConfigurationError('unknown', message, context);
  }
}

export function getErrorCategory(error: Error): string {
  if (isQEError(error)) {
    return error.category;
  }
  return 'unknown';
}

export function formatErrorForLogging(error: Error): Record<string, unknown> {
  if (isQEError(error)) {
    return error.toJSON();
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    timestamp: new Date()
  };
}