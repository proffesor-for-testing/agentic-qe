/**
 * Agentic QE v3 - Token Tracking Bootstrap
 * ADR-042: Initializes token optimization and persistence
 *
 * This module wires up:
 * 1. TokenOptimizerService with a memory backend
 * 2. TokenMetricsCollector persistence
 * 3. Shutdown hooks for saving metrics
 */

import * as path from 'path';
import * as fs from 'fs';
import { initializeTokenOptimizer, TokenOptimizerService } from '../optimization/token-optimizer-service.js';
import { TokenMetricsCollector } from '../learning/token-tracker.js';
import { createDefaultMemoryBackend, createMemoryBackend } from '../kernel/memory-factory.js';
import type { MemoryBackend } from '../kernel/interfaces.js';

// ============================================================================
// Configuration
// ============================================================================

export interface TokenBootstrapConfig {
  /** Enable token optimization (default: true) */
  enableOptimization: boolean;

  /** Enable persistence (default: true) */
  enablePersistence: boolean;

  /** Storage directory for metrics (default: .aqe) */
  storagePath: string;

  /** Auto-save interval in ms (default: 60000 = 1 minute) */
  autoSaveIntervalMs: number;

  /** Verbose logging (default: false) */
  verbose: boolean;
}

const DEFAULT_CONFIG: TokenBootstrapConfig = {
  enableOptimization: true,
  enablePersistence: true,
  storagePath: process.env.AQE_STORAGE_PATH ?? '.aqe',
  autoSaveIntervalMs: 60000,
  verbose: process.env.AQE_VERBOSE === 'true',
};

// ============================================================================
// State
// ============================================================================

let initialized = false;
let memoryBackend: MemoryBackend | null = null;
let shutdownRegistered = false;

// ============================================================================
// Bootstrap Functions
// ============================================================================

/**
 * Initialize token tracking and optimization.
 * Safe to call multiple times - will only initialize once.
 */
export async function bootstrapTokenTracking(
  config?: Partial<TokenBootstrapConfig>
): Promise<void> {
  if (initialized) {
    return;
  }

  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (cfg.verbose) {
    console.log('[TokenBootstrap] Initializing token tracking...');
  }

  // Ensure storage directory exists
  if (cfg.enablePersistence) {
    const storageDir = path.resolve(cfg.storagePath);
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
  }

  // Initialize memory backend for pattern storage
  if (cfg.enableOptimization) {
    try {
      const result = await createDefaultMemoryBackend(true);
      memoryBackend = result.backend;

      // Initialize TokenOptimizerService
      await initializeTokenOptimizer(memoryBackend, {
        enabled: true,
        verbose: cfg.verbose,
      });

      if (cfg.verbose) {
        console.log('[TokenBootstrap] TokenOptimizerService initialized');
        console.log(`[TokenBootstrap] isEnabled() = ${TokenOptimizerService.isEnabled()}`);
      }
    } catch (error) {
      // Don't fail startup if optimization can't initialize
      console.error('[TokenBootstrap] Failed to initialize TokenOptimizerService:', error);
    }
  }

  // Configure persistence
  if (cfg.enablePersistence) {
    const metricsPath = path.join(cfg.storagePath, 'token-metrics.json');

    TokenMetricsCollector.configurePersistence({
      filePath: metricsPath,
      autoSaveIntervalMs: cfg.autoSaveIntervalMs,
    });

    // Load existing metrics
    try {
      const loaded = await TokenMetricsCollector.load();
      if (cfg.verbose) {
        console.log(`[TokenBootstrap] Loaded existing metrics: ${loaded}`);
      }
    } catch (error) {
      // Don't fail if no previous metrics exist
      if (cfg.verbose) {
        console.log('[TokenBootstrap] No existing metrics to load');
      }
    }

    // Start auto-save
    TokenMetricsCollector.startAutoSave();

    if (cfg.verbose) {
      console.log(`[TokenBootstrap] Persistence configured: ${metricsPath}`);
    }
  }

  // Register shutdown hooks (only once)
  if (!shutdownRegistered) {
    registerShutdownHooks(cfg.verbose);
    shutdownRegistered = true;
  }

  initialized = true;

  if (cfg.verbose) {
    console.log('[TokenBootstrap] Token tracking initialized successfully');
  }
}

/**
 * Shutdown token tracking gracefully.
 * Saves any pending metrics.
 */
export async function shutdownTokenTracking(verbose = false): Promise<void> {
  if (!initialized) {
    return;
  }

  if (verbose) {
    console.log('[TokenBootstrap] Shutting down token tracking...');
  }

  // Stop auto-save
  TokenMetricsCollector.stopAutoSave();

  // Save any unsaved metrics
  if (TokenMetricsCollector.hasUnsavedChanges()) {
    try {
      await TokenMetricsCollector.save();
      if (verbose) {
        console.log('[TokenBootstrap] Metrics saved successfully');
      }
    } catch (error) {
      console.error('[TokenBootstrap] Failed to save metrics:', error);
    }
  }

  // Dispose memory backend
  if (memoryBackend) {
    try {
      await memoryBackend.dispose();
    } catch (error) {
      // Ignore disposal errors
    }
    memoryBackend = null;
  }

  initialized = false;
}

/**
 * Check if token tracking is initialized.
 */
export function isTokenTrackingInitialized(): boolean {
  return initialized;
}

/**
 * Get the memory backend (if initialized).
 */
export function getTokenMemoryBackend(): MemoryBackend | null {
  return memoryBackend;
}

// ============================================================================
// Internal Functions
// ============================================================================

function registerShutdownHooks(verbose: boolean): void {
  const shutdown = async (signal: string) => {
    if (verbose) {
      console.log(`[TokenBootstrap] Received ${signal}, saving metrics...`);
    }
    await shutdownTokenTracking(verbose);
  };

  // Handle various shutdown signals
  process.on('beforeExit', () => shutdown('beforeExit'));

  // Note: SIGINT and SIGTERM handlers should be registered by the main entry point
  // We just expose shutdownTokenTracking() for them to call
}
