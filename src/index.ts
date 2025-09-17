/**
 * Agentic QE Framework - Main Export Module
 * Exports all core components and types for external use
 */

// Core Types
export * from './types';

// Memory System
export { QEMemory } from './memory/QEMemory';
export {
  EnhancedQEMemory,
  type QESessionState,
  type WorkflowState,
  type WorkflowStep,
  type TemporalMetrics,
  type KnowledgeShare
} from './memory/EnhancedQEMemory';

// Utilities
export { Logger, LogLevel, configureLogger } from './utils/Logger';
export {
  AsyncOperationQueue,
  Priority,
  type QueueOperation,
  type OperationResult,
  type QueueConfig,
  type QueueMetrics
} from './utils/AsyncOperationQueue';
export {
  BatchProcessor,
  type BatchProcessorConfig,
  type BatchItem,
  type BatchResult,
  type BatchProcessorMetrics,
  type BatchProcessingStrategy
} from './utils/BatchProcessor';

// Monitoring
export {
  PerformanceMonitor,
  type PerformanceMonitorConfig,
  type SystemMetrics,
  type ProcessMetrics,
  type PerformanceBaseline,
  type PerformanceAlert,
  type AlertThresholds
} from './monitoring/PerformanceMonitor';

// Version information
export const VERSION = '1.0.0';
export const API_VERSION = 'v1';

// Create a default QEFramework class for the export
class QEFramework {
  version = VERSION;
  apiVersion = API_VERSION;
}

// Export as default
export default QEFramework;