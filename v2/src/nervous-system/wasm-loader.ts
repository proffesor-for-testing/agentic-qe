/**
 * WASM Loader for RuVector Nervous System
 *
 * Provides Node.js-compatible WASM initialization for the nervous system module.
 * The default WASM loader uses fetch() which isn't available in Node.js,
 * so we load the .wasm file directly from the filesystem.
 *
 * @module nervous-system/wasm-loader
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Re-export all WASM types and functions
export {
  BTSPLayer,
  BTSPAssociativeMemory,
  BTSPSynapse,
  Hypervector,
  HdcMemory,
  WTALayer,
  KWTALayer,
  GlobalWorkspace,
  WorkspaceItem,
  version,
  available_mechanisms,
  performance_targets,
  biological_references,
} from '@ruvector/nervous-system-wasm';

import init from '@ruvector/nervous-system-wasm';

/**
 * Tracks whether WASM has been initialized
 */
let wasmInitialized = false;

/**
 * Promise for pending initialization
 */
let initPromise: Promise<void> | null = null;

/**
 * Find the WASM file path in node_modules
 *
 * Supports both ESM and CommonJS module systems by using multiple path resolution strategies.
 */
function findWasmPath(): string {
  const wasmFileName = 'ruvector_nervous_system_wasm_bg.wasm';
  const packagePath = join('@ruvector', 'nervous-system-wasm', wasmFileName);

  const possiblePaths: string[] = [];

  // Try __dirname first (CommonJS)
  if (typeof __dirname !== 'undefined') {
    possiblePaths.push(
      join(__dirname, '..', '..', 'node_modules', packagePath),
      join(__dirname, '..', 'node_modules', packagePath),
    );
  }

  // Add common fallback paths
  possiblePaths.push(
    // From project root via cwd
    join(process.cwd(), 'node_modules', packagePath),
    // Absolute resolve
    resolve('node_modules', packagePath),
  );

  for (const wasmPath of possiblePaths) {
    if (existsSync(wasmPath)) {
      return wasmPath;
    }
  }

  throw new Error(
    'Could not find ruvector_nervous_system_wasm_bg.wasm. ' +
    'Ensure @ruvector/nervous-system-wasm is installed: npm install @ruvector/nervous-system-wasm'
  );
}

/**
 * Initialize the WASM module for Node.js
 *
 * This function is idempotent - calling it multiple times is safe.
 * All subsequent calls will return immediately if already initialized,
 * or wait for the pending initialization to complete.
 *
 * @example
 * ```typescript
 * import { initNervousSystem, Hypervector } from './wasm-loader.js';
 *
 * await initNervousSystem();
 * const v = Hypervector.random();
 * ```
 */
export async function initNervousSystem(): Promise<void> {
  // Already initialized
  if (wasmInitialized) {
    return;
  }

  // Initialization in progress
  if (initPromise) {
    return initPromise;
  }

  // Start initialization
  initPromise = (async () => {
    try {
      const wasmPath = findWasmPath();
      const wasmBytes = readFileSync(wasmPath);
      await init(wasmBytes);
      wasmInitialized = true;
    } catch (error) {
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Check if WASM is initialized
 */
export function isWasmInitialized(): boolean {
  return wasmInitialized;
}

/**
 * Ensure WASM is initialized before running a function
 *
 * Decorator pattern for automatic initialization.
 *
 * @example
 * ```typescript
 * const createVector = ensureInitialized(() => Hypervector.random());
 * const v = await createVector(); // Auto-initializes if needed
 * ```
 */
export function ensureInitialized<T>(fn: () => T): () => Promise<T> {
  return async () => {
    await initNervousSystem();
    return fn();
  };
}

/**
 * Get WASM module info
 */
export async function getWasmInfo(): Promise<{
  version: string;
  mechanisms: Array<[string, string]>;
  targets: Array<[string, string]>;
  initialized: boolean;
}> {
  const { version, available_mechanisms, performance_targets } = await import('@ruvector/nervous-system-wasm');

  if (!wasmInitialized) {
    return {
      version: 'not initialized',
      mechanisms: [],
      targets: [],
      initialized: false,
    };
  }

  return {
    version: version(),
    mechanisms: available_mechanisms() as Array<[string, string]>,
    targets: performance_targets() as Array<[string, string]>,
    initialized: true,
  };
}
