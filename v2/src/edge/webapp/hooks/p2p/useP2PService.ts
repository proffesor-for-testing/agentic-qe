/**
 * useP2PService Hook
 *
 * Initialize and manage P2PService lifecycle.
 *
 * @module edge/webapp/hooks/p2p/useP2PService
 * @version 1.0.0
 */

import { useCallback, useEffect, useRef } from 'react';
import { useP2PContext, P2PEventType } from '../../context/P2PContext';
import type { UseP2PServiceOptions, UseP2PServiceReturn } from './types';

/**
 * Hook for managing P2P service lifecycle.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isInitialized, error, initialize, shutdown } = useP2PService({
 *     autoInit: true,
 *     onError: (err) => console.error('P2P error:', err),
 *   });
 *
 *   if (!isInitialized) return <Loading />;
 *   if (error) return <Error message={error.message} />;
 *
 *   return <Dashboard />;
 * }
 * ```
 */
export function useP2PService(options: UseP2PServiceOptions = {}): UseP2PServiceReturn {
  const {
    autoInit = true,
    config,
    onError,
  } = options;

  const context = useP2PContext();
  const onErrorRef = useRef(onError);
  const hasInitializedRef = useRef(false);

  // Keep onError ref updated
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Initialize with optional config override
  const initialize = useCallback(async (): Promise<void> => {
    try {
      await context.initialize(config);
      hasInitializedRef.current = true;
    } catch (error) {
      if (onErrorRef.current) {
        onErrorRef.current(error as Error);
      }
      throw error;
    }
  }, [context, config]);

  // Shutdown service
  const shutdown = useCallback(async (): Promise<void> => {
    await context.shutdown();
    hasInitializedRef.current = false;
  }, [context]);

  // Subscribe to error events
  useEffect(() => {
    if (!onErrorRef.current) return;

    const unsubscribe = context.subscribe(P2PEventType.ERROR, (event) => {
      if (onErrorRef.current) {
        onErrorRef.current((event.data as { error: Error }).error);
      }
    });

    return unsubscribe;
  }, [context]);

  // Auto-initialize on mount if enabled
  useEffect(() => {
    if (autoInit && !context.isInitialized && !context.isInitializing && !hasInitializedRef.current) {
      initialize().catch((error) => {
        console.error('[useP2PService] Auto-init failed:', error);
      });
    }
  }, [autoInit, context.isInitialized, context.isInitializing, initialize]);

  return {
    isInitialized: context.isInitialized,
    isInitializing: context.isInitializing,
    error: context.initError,
    identity: context.localIdentity,
    initialize,
    shutdown,
  };
}

export default useP2PService;
