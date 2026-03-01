/**
 * Global InfraHealingOrchestrator Singleton
 * ADR-057: Infrastructure Self-Healing Extension
 *
 * Shared accessor for the InfraHealingOrchestrator singleton.
 * Both the MCP layer (domain-handlers.ts) and the domain layer
 * (test-execution plugin) import from here, avoiding circular dependencies.
 */

import type { InfraHealingOrchestrator } from './infra-healing-orchestrator.js';

/** Module-level singleton */
let instance: InfraHealingOrchestrator | null = null;

/**
 * Set the global InfraHealingOrchestrator instance.
 * Called during MCP server initialization (entry.ts).
 */
export function setGlobalInfraHealing(orchestrator: InfraHealingOrchestrator): void {
  instance = orchestrator;
}

/**
 * Get the global InfraHealingOrchestrator instance.
 * Returns null if infra-healing was not initialized.
 */
export function getGlobalInfraHealing(): InfraHealingOrchestrator | null {
  return instance;
}
