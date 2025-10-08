/**
 * Hook-related TypeScript interfaces for agent lifecycle hooks
 * Provides type safety for verification hooks and task lifecycle
 */

import { TaskAssignment } from './index';

/**
 * Data passed to pre-task hooks
 */
export interface PreTaskData {
  /** The task assignment being executed */
  assignment: TaskAssignment;
  /** Optional context for environment/resource validation */
  context?: {
    requiredVars?: string[];
    minNodeVersion?: string;
    requiredModules?: string[];
    minMemoryMB?: number;
    minCPUCores?: number;
    minDiskSpaceMB?: number;
    checkPath?: string;
    maxLoadAverage?: number;
    files?: string[];
    directories?: string[];
    requiredPermissions?: string[];
    requiredAccess?: ('read' | 'write' | 'execute')[];
    config?: any;
    schema?: any;
    requiredKeys?: string[];
    validateAgainstStored?: boolean;
    storedKey?: string;
  };
}

/**
 * Data passed to post-task hooks
 */
export interface PostTaskData {
  /** The task assignment that was executed */
  assignment: TaskAssignment;
  /** The result of the task execution */
  result: any;
  /** Optional validation context */
  context?: {
    output?: any;
    expectedStructure?: any;
    expectedTypes?: Record<string, string>;
    requiredFields?: string[];
    metrics?: any;
    qualityThresholds?: {
      maxComplexity?: number;
      minMaintainability?: number;
      maxDuplication?: number;
    };
    coverage?: any;
    coverageThresholds?: any;
    coverageBaseline?: any;
    performance?: any;
    performanceThresholds?: any;
    performanceBaseline?: any;
    regressionThreshold?: number;
  };
}

/**
 * Data passed to task error hooks
 */
export interface TaskErrorData {
  /** The task assignment that failed */
  assignment: TaskAssignment;
  /** The error that occurred */
  error: Error;
  /** Optional error context */
  context?: {
    stage?: string;
    attemptNumber?: number;
    canRetry?: boolean;
    recoveryOptions?: string[];
  };
}

/**
 * Data passed to pre-edit hooks
 */
export interface PreEditData {
  /** File path being edited */
  file: string;
  /** Changes being applied */
  changes: any;
  /** Optional edit context */
  context?: {
    editType?: 'create' | 'update' | 'delete';
    expectedFormat?: string;
    validateSyntax?: boolean;
    checkLocks?: boolean;
  };
}

/**
 * Data passed to post-edit hooks
 */
export interface PostEditData {
  /** File path that was edited */
  file: string;
  /** Changes that were applied */
  changes: any;
  /** Optional edit result context */
  context?: {
    success?: boolean;
    artifactId?: string;
    updateDependencies?: boolean;
    notifyAgents?: boolean;
  };
}

/**
 * Data passed to session-end hooks
 */
export interface SessionEndData {
  /** Session identifier */
  sessionId: string;
  /** Session duration in milliseconds */
  duration: number;
  /** Number of tasks completed */
  tasksCompleted: number;
  /** Optional session context */
  context?: {
    finalMetrics?: any;
    exportPath?: string;
    cleanupRequired?: boolean;
    persistState?: boolean;
  };
}

/**
 * Generic hook handler function type
 */
export type HookHandler<T = any> = (data: T) => Promise<void> | void;

/**
 * Hook execution result
 */
export interface HookExecutionResult {
  /** Whether the hook executed successfully */
  success: boolean;
  /** Hook stage identifier */
  stage: string;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Optional error if hook failed */
  error?: Error;
  /** Optional result data */
  data?: any;
}
