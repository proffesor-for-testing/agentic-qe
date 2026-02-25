/**
 * Shared types for extracted task handlers.
 *
 * Handlers receive a TaskHandlerContext that exposes the minimal surface
 * of DomainTaskExecutor needed to register and implement handlers.
 */

import type { Result } from '../../shared/types';
import type { QueenTask, TaskType } from '../queen-coordinator';

import type { CoverageAnalyzerService } from '../../domains/coverage-analysis';
import type { SecurityScannerService } from '../../domains/security-compliance';
import type { TestGeneratorService } from '../../domains/test-generation';
import type { KnowledgeGraphService } from '../../domains/code-intelligence';
import type { QualityAnalyzerService } from '../../domains/quality-assessment';

/** Signature of a single task handler */
export type InstanceTaskHandler = (task: QueenTask) => Promise<Result<unknown, Error>>;

/**
 * Minimal interface that handler registration functions use to interact
 * with DomainTaskExecutor. This avoids a circular import on the class itself.
 */
export interface TaskHandlerContext {
  /** Register a handler for a given task type */
  registerHandler(type: TaskType, handler: InstanceTaskHandler): void;

  /** Lazy service getters */
  getCoverageAnalyzer(): CoverageAnalyzerService;
  getSecurityScanner(): SecurityScannerService;
  getTestGenerator(): TestGeneratorService;
  getKnowledgeGraph(): KnowledgeGraphService;
  getQualityAnalyzer(): QualityAnalyzerService;

  /** Executor configuration */
  readonly config: {
    defaultLanguage: string;
    defaultFramework: string;
  };
}
