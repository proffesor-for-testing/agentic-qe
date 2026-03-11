/**
 * Agent Customization Overlay Schema (BMAD-002)
 *
 * Allows users to customize agent behavior via .claude/agent-overrides/*.yaml
 * files that survive `aqe init` reinstalls.
 */

export interface AgentOverlay {
  /** Agent identifier, e.g. "qe-test-architect" */
  agent: string;

  /** Fields that REPLACE base agent content */
  replace?: {
    description?: string;
    domains?: string[];
    complexity?: string;
  };

  /** Fields that APPEND to base agent content */
  append?: {
    /** Additional instructions appended to agent .md body */
    instructions?: string;
    /** Additional capabilities */
    capabilities?: string[];
    /** Additional tags */
    tags?: string[];
  };

  /** Runtime configuration overrides */
  config?: {
    /** For review agents - minimum weighted findings */
    minimumFindings?: number;
    /** Maximum parallel agents for orchestrators */
    maxParallelAgents?: number;
    /** Preferred test frameworks */
    preferredFrameworks?: string[];
    /** Severity thresholds per category */
    severityThresholds?: Record<string, number>;
    /** Context compilation opt-out */
    needsContext?: boolean;
  };
}

export interface OverlayLoadResult {
  overlays: AgentOverlay[];
  warnings: string[];
  errors: string[];
}

export interface AppliedOverlay {
  agentName: string;
  overlayFile: string;
  replacedFields: string[];
  appendedFields: string[];
  configOverrides: string[];
}

/**
 * Validates an overlay object against the schema.
 * Returns validation errors (empty array = valid).
 */
export function validateOverlay(overlay: unknown): string[] {
  const errors: string[] = [];

  if (!overlay || typeof overlay !== 'object') {
    errors.push('Overlay must be a non-null object');
    return errors;
  }

  const obj = overlay as Record<string, unknown>;

  if (!obj.agent || typeof obj.agent !== 'string') {
    errors.push('Overlay must have a string "agent" field');
  }

  if (obj.replace !== undefined) {
    if (typeof obj.replace !== 'object' || obj.replace === null) {
      errors.push('"replace" must be an object');
    } else {
      const replace = obj.replace as Record<string, unknown>;
      if (replace.description !== undefined && typeof replace.description !== 'string') {
        errors.push('"replace.description" must be a string');
      }
      if (replace.domains !== undefined && !Array.isArray(replace.domains)) {
        errors.push('"replace.domains" must be an array');
      }
      if (replace.complexity !== undefined && typeof replace.complexity !== 'string') {
        errors.push('"replace.complexity" must be a string');
      }
    }
  }

  if (obj.append !== undefined) {
    if (typeof obj.append !== 'object' || obj.append === null) {
      errors.push('"append" must be an object');
    } else {
      const append = obj.append as Record<string, unknown>;
      if (append.instructions !== undefined && typeof append.instructions !== 'string') {
        errors.push('"append.instructions" must be a string');
      }
      if (append.capabilities !== undefined && !Array.isArray(append.capabilities)) {
        errors.push('"append.capabilities" must be an array');
      }
      if (append.tags !== undefined && !Array.isArray(append.tags)) {
        errors.push('"append.tags" must be an array');
      }
    }
  }

  if (obj.config !== undefined) {
    if (typeof obj.config !== 'object' || obj.config === null) {
      errors.push('"config" must be an object');
    } else {
      const config = obj.config as Record<string, unknown>;
      if (config.minimumFindings !== undefined && typeof config.minimumFindings !== 'number') {
        errors.push('"config.minimumFindings" must be a number');
      }
      if (config.maxParallelAgents !== undefined && typeof config.maxParallelAgents !== 'number') {
        errors.push('"config.maxParallelAgents" must be a number');
      }
      if (config.preferredFrameworks !== undefined && !Array.isArray(config.preferredFrameworks)) {
        errors.push('"config.preferredFrameworks" must be an array');
      }
      if (config.needsContext !== undefined && typeof config.needsContext !== 'boolean') {
        errors.push('"config.needsContext" must be a boolean');
      }
    }
  }

  return errors;
}
