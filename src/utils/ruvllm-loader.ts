/**
 * RuvLLM Loader - Handles @ruvector/ruvllm import with CJS fallback
 *
 * The @ruvector/ruvllm package has a broken ESM build (missing .js extensions).
 * This loader forces CJS resolution which works correctly.
 *
 * @module utils/ruvllm-loader
 */

import { createRequire } from 'module';
import { Logger } from './Logger';

// Cache for the loaded module
let ruvllmModule: RuvLLMModule | null = null;
let loadAttempted = false;
let loadError: Error | null = null;

/**
 * RuvLLM module type definitions
 */
export interface RuvLLMModule {
  RuvLLM: new (config?: RuvLLMConfig) => RuvLLMInstance;
  SonaCoordinator: new () => SonaCoordinatorInstance;
  ReasoningBank: new (threshold?: number) => ReasoningBankInstance;
  LoraManager: new (config?: any) => LoraManagerInstance;
  LoraAdapter: new (config?: LoraAdapterConfig) => LoraAdapterInstance;
  TrajectoryBuilder: new () => TrajectoryBuilderInstance;
  SessionManager: new (llm: RuvLLMInstance) => any;
  EwcManager: new (config?: any) => any;
  version: string;
  hasSimdSupport: boolean;
}

export interface RuvLLMConfig {
  learningEnabled?: boolean;
  embeddingDim?: number;
  ewcLambda?: number;
}

export interface RuvLLMInstance {
  query: (input: string, options?: any) => any;
  searchMemory: (query: string, limit: number) => any[];
  addMemory: (text: string, metadata?: any) => void;
  embed: (text: string) => Float32Array | number[];
}

export interface SonaCoordinatorInstance {
  recordTrajectory: (trajectory: any) => void;
}

/**
 * Learned pattern returned by ReasoningBank.findSimilar()
 */
export interface RuvLLMLearnedPattern {
  id: string;
  type: string;
  embedding: number[] | Float32Array;
  successRate: number;
  useCount: number;
  lastUsed: Date;
}

export interface ReasoningBankInstance {
  store: (type: string, embedding: number[], metadata: any) => void;
  findSimilar: (embedding: number[], limit: number) => RuvLLMLearnedPattern[];
}

export interface LoraManagerInstance {}

export interface LoraAdapterConfig {
  rank?: number;
  alpha?: number;
}

export interface LoraAdapterInstance {
  forward: (input: any) => any;
  backward: (input: number[], output: number[], learningRate: number) => number;
}

export interface TrajectoryBuilderInstance {
  startStep: (type: string, input: string) => TrajectoryBuilderInstance;
  endStep: (output: string, confidence: number) => TrajectoryBuilderInstance;
  complete: (status: string) => any;
}

/**
 * Load @ruvector/ruvllm using CJS to avoid ESM resolution issues
 *
 * The ESM build of @ruvector/ruvllm is broken (missing .js extensions).
 * This function uses createRequire to force CJS resolution.
 *
 * @returns The ruvllm module or null if unavailable
 */
export function loadRuvLLM(): RuvLLMModule | null {
  // Return cached result
  if (loadAttempted) {
    return ruvllmModule;
  }

  loadAttempted = true;
  const logger = Logger.getInstance();

  try {
    // Use createRequire to force CJS resolution
    // Use process.cwd() as base for require resolution
    const requirePath = process.cwd() + '/package.json';
    const require = createRequire(requirePath);
    ruvllmModule = require('@ruvector/ruvllm') as RuvLLMModule;

    logger.debug('RuvLLM loaded successfully via CJS', {
      version: ruvllmModule.version,
      hasSimd: ruvllmModule.hasSimdSupport,
    });

    return ruvllmModule;
  } catch (error) {
    loadError = error as Error;
    logger.warn('RuvLLM not available, using fallback mode', {
      error: loadError.message,
    });
    return null;
  }
}

/**
 * Async version for compatibility with existing code
 * (Still uses sync CJS under the hood)
 */
export async function loadRuvLLMAsync(): Promise<RuvLLMModule | null> {
  return loadRuvLLM();
}

/**
 * Check if ruvLLM is available
 */
export function isRuvLLMAvailable(): boolean {
  if (!loadAttempted) {
    loadRuvLLM();
  }
  return ruvllmModule !== null;
}

/**
 * Get the last load error if any
 */
export function getRuvLLMLoadError(): Error | null {
  return loadError;
}

/**
 * Reset the loader state (for testing)
 */
export function resetRuvLLMLoader(): void {
  ruvllmModule = null;
  loadAttempted = false;
  loadError = null;
}
