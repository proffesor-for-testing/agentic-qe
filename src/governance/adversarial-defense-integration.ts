import { randomUUID } from 'node:crypto';

/**
 * Adversarial Defense Integration for Agentic QE Fleet
 *
 * Wires @claude-flow/guidance adversarial defense capabilities to AQE's agent system.
 * Provides prompt injection detection, input sanitization, threat scoring,
 * automatic blocking, and trust integration.
 *
 * Threat categories:
 * - Prompt injection (ignore instructions, system prompt override)
 * - Jailbreak attempts
 * - Role manipulation (pretend you are, act as)
 * - Data exfiltration patterns
 * - Command injection (shell commands, SQL)
 * - Encoded payloads (base64, unicode escapes)
 *
 * @module governance/adversarial-defense-integration
 * @see ADR-058-guidance-governance-integration.md
 */

import { governanceFlags, isAdversarialDefenseEnabled, isStrictMode } from './feature-flags.js';
import { trustAccumulatorIntegration } from './trust-accumulator-integration.js';

/**
 * Threat context for assessment
 */
export interface ThreatContext {
  agentId?: string;
  taskType?: string;
  source?: string;
  sessionId?: string;
  previousInputs?: string[];
}

/**
 * Detected pattern information
 */
export interface DetectedPattern {
  name: string;
  category: ThreatCategory;
  matched: string;
  position: number;
  severity: number; // 0-1, higher = more severe
  description: string;
}

/**
 * Threat assessment result
 */
export interface ThreatAssessment {
  threatScore: number; // 0-1, higher = more dangerous
  detectedPatterns: string[]; // Names of detected patterns
  isBlocked: boolean;
  sanitizedInput?: string;
  recommendations: string[];
  timestamp: number;
  assessmentId: string;
}

/**
 * Detection pattern definition
 */
export interface DetectionPattern {
  name: string;
  category: ThreatCategory;
  pattern: RegExp;
  severity: number; // 0-1
  description: string;
  enabled: boolean;
}

/**
 * Threat categories
 */
export type ThreatCategory =
  | 'prompt-injection'
  | 'jailbreak'
  | 'role-manipulation'
  | 'data-exfiltration'
  | 'command-injection'
  | 'encoded-payload'
  | 'custom';

/**
 * Pattern statistics
 */
export interface PatternStats {
  totalPatterns: number;
  patternsByCategory: Record<ThreatCategory, number>;
  enabledPatterns: number;
  disabledPatterns: number;
  customPatterns: number;
}

/**
 * Defense statistics
 */
export interface DefenseStats {
  totalAssessments: number;
  blockedInputs: number;
  sanitizedInputs: number;
  averageThreatScore: number;
  patternMatchCounts: Record<string, number>;
  categoryBreakdown: Record<ThreatCategory, number>;
  agentPenalties: number;
  lastAssessment: number | null;
}

/**
 * Blocklist entry
 */
interface BlocklistEntry {
  pattern: string;
  reason: string;
  addedAt: number;
  matchCount: number;
}

/**
 * Default detection patterns for adversarial inputs
 */
const DEFAULT_PATTERNS: DetectionPattern[] = [
  // Prompt Injection Patterns
  {
    name: 'ignore-instructions',
    category: 'prompt-injection',
    pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|guidelines?|prompts?)/i,
    severity: 0.9,
    description: 'Attempts to override previous instructions',
    enabled: true,
  },
  {
    name: 'system-prompt-override',
    category: 'prompt-injection',
    pattern: /\[?(system|admin|root|sudo)\]?\s*[:>]\s*.{0,50}(override|bypass|ignore|forget|reset)/i,
    severity: 0.95,
    description: 'Attempts to impersonate system prompt',
    enabled: true,
  },
  {
    name: 'new-instructions',
    category: 'prompt-injection',
    pattern: /your\s+(new|real|actual|true)\s+(instructions?|task|purpose|goal)\s+(are?|is)/i,
    severity: 0.85,
    description: 'Attempts to redefine agent instructions',
    enabled: true,
  },
  {
    name: 'disregard-previous',
    category: 'prompt-injection',
    pattern: /(disregard|forget|omit|skip|delete)\s+(everything|all|anything)\s+(above|before|previous)/i,
    severity: 0.9,
    description: 'Attempts to clear context',
    enabled: true,
  },
  {
    name: 'prompt-leak',
    category: 'prompt-injection',
    pattern: /(show|reveal|display|output|print|echo)\s+(your|the|my)?\s*(system\s*)?(prompt|instructions?|rules?|config)/i,
    severity: 0.8,
    description: 'Attempts to extract system prompt',
    enabled: true,
  },

  // Jailbreak Patterns
  {
    name: 'dan-jailbreak',
    category: 'jailbreak',
    pattern: /\b(DAN|do\s*anything\s*now|jailbreak|unrestricted|unfiltered)\b/i,
    severity: 0.95,
    description: 'Known jailbreak attempt (DAN/unrestricted mode)',
    enabled: true,
  },
  {
    name: 'developer-mode',
    category: 'jailbreak',
    pattern: /(developer|debug|maintenance|test)\s*mode\s*(enabled?|on|active|activate)/i,
    severity: 0.9,
    description: 'Attempts to enable developer/debug mode',
    enabled: true,
  },
  {
    name: 'hypothetical-bypass',
    category: 'jailbreak',
    pattern: /(hypothetically|in\s+theory|imagine\s+if|let's\s+say|what\s+if).{0,50}(no\s+rules?|no\s+restrictions?|anything|everything)/i,
    severity: 0.7,
    description: 'Hypothetical scenario to bypass restrictions',
    enabled: true,
  },
  {
    name: 'roleplay-bypass',
    category: 'jailbreak',
    pattern: /(roleplay|role-play|pretend|act)\s*(as|like|that).{0,30}(no|without)\s*(restrictions?|limits?|rules?|ethics?)/i,
    severity: 0.85,
    description: 'Roleplay scenario to bypass ethics',
    enabled: true,
  },

  // Role Manipulation Patterns
  {
    name: 'pretend-you-are',
    category: 'role-manipulation',
    pattern: /(pretend|imagine|act|behave)\s+(you\s+are|as\s+if\s+you're|like\s+you're|that\s+you're)/i,
    severity: 0.6,
    description: 'Attempts to change agent identity',
    enabled: true,
  },
  {
    name: 'you-are-now',
    category: 'role-manipulation',
    pattern: /you\s+are\s+now\s+(a|an|the)?\s*[a-z]+/i,
    severity: 0.65,
    description: 'Direct role reassignment attempt',
    enabled: true,
  },
  {
    name: 'from-now-on',
    category: 'role-manipulation',
    pattern: /from\s+now\s+on\s*(,\s*)?(you|your)\s+(will|are|should|must|have\s+to)/i,
    severity: 0.7,
    description: 'Attempts to change future behavior',
    enabled: true,
  },
  {
    name: 'persona-switch',
    category: 'role-manipulation',
    pattern: /(switch|change|transform)\s*(to|into)\s*(a|an)?\s*(different|new|another)\s*(persona|character|role|identity)/i,
    severity: 0.75,
    description: 'Attempts to switch persona',
    enabled: true,
  },

  // Data Exfiltration Patterns
  {
    name: 'api-key-request',
    category: 'data-exfiltration',
    pattern: /(show|reveal|give|tell|output|display|print)\s*(me\s*)?(your|the|any)?\s*(api|access|secret)?\s*key/i,
    severity: 0.85,
    description: 'Attempts to extract API keys',
    enabled: true,
  },
  {
    name: 'credential-request',
    category: 'data-exfiltration',
    pattern: /(show|reveal|give|tell|output)\s*(me\s*)?(the|your|any)?\s*(credentials?|passwords?|tokens?|secrets?)/i,
    severity: 0.9,
    description: 'Attempts to extract credentials',
    enabled: true,
  },
  {
    name: 'environment-dump',
    category: 'data-exfiltration',
    pattern: /(dump|print|show|list|output)\s*(all\s*)?(environment|env)\s*(variables?)?/i,
    severity: 0.8,
    description: 'Attempts to dump environment variables',
    enabled: true,
  },
  {
    name: 'internal-state',
    category: 'data-exfiltration',
    pattern: /(show|reveal|access|dump)\s*(your|the)?\s*(internal|hidden|private)\s*(state|data|memory|context)/i,
    severity: 0.75,
    description: 'Attempts to access internal state',
    enabled: true,
  },

  // Command Injection Patterns
  {
    name: 'shell-command',
    category: 'command-injection',
    pattern: /[;\|\&`]\s*(rm|cat|wget|curl|nc|bash|sh|python|perl|ruby|eval|exec)\s+/i,
    severity: 0.95,
    description: 'Shell command injection attempt',
    enabled: true,
  },
  {
    name: 'sql-injection',
    category: 'command-injection',
    pattern: /(['";]\s*(or|and|union|select|drop|delete|insert|update)\s+)/i,
    severity: 0.9,
    description: 'SQL injection attempt',
    enabled: true,
  },
  {
    name: 'path-traversal',
    category: 'command-injection',
    pattern: /\.\.[\/\\]+/,
    severity: 0.7,
    description: 'Path traversal attempt',
    enabled: true,
  },
  {
    name: 'code-execution',
    category: 'command-injection',
    pattern: /(eval|exec|system|popen|subprocess)\s*\(/i,
    severity: 0.85,
    description: 'Code execution function call',
    enabled: true,
  },

  // Encoded Payload Patterns
  {
    name: 'base64-encoded',
    category: 'encoded-payload',
    pattern: /[A-Za-z0-9+\/]{50,}={0,2}/,
    severity: 0.5,
    description: 'Potential base64 encoded payload',
    enabled: true,
  },
  {
    name: 'unicode-escape',
    category: 'encoded-payload',
    pattern: /(\\u[0-9a-fA-F]{4}){4,}/,
    severity: 0.6,
    description: 'Unicode escape sequence (potential obfuscation)',
    enabled: true,
  },
  {
    name: 'hex-encoded',
    category: 'encoded-payload',
    pattern: /(\\x[0-9a-fA-F]{2}){8,}/,
    severity: 0.65,
    description: 'Hex-encoded data (potential obfuscation)',
    enabled: true,
  },
  {
    name: 'url-encoded',
    category: 'encoded-payload',
    pattern: /(%[0-9a-fA-F]{2}){5,}/,
    severity: 0.55,
    description: 'URL-encoded sequence (potential obfuscation)',
    enabled: true,
  },
];

/**
 * Adversarial Defense Integration for AQE agent system
 */
export class AdversarialDefenseIntegration {
  private patterns: Map<string, DetectionPattern> = new Map();
  private blocklist: Map<string, BlocklistEntry> = new Map();
  private stats: DefenseStats = this.createEmptyStats();
  private assessmentHistory: ThreatAssessment[] = [];
  private initialized = false;

  /**
   * Initialize the AdversarialDefense integration
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load default patterns
    for (const pattern of DEFAULT_PATTERNS) {
      this.patterns.set(pattern.name, pattern);
    }

    this.initialized = true;
  }

  /**
   * Assess threat level of an input
   */
  assessThreat(input: string, context?: ThreatContext): ThreatAssessment {
    if (!isAdversarialDefenseEnabled()) {
      return this.createSafeAssessment(input);
    }

    const flags = governanceFlags.getFlags().adversarialDefense;
    const detectedPatterns = this.detectInjectionPatterns(input);
    const blocklistMatches = this.checkBlocklist(input);

    // Calculate threat score from detected patterns
    let threatScore = 0;
    if (detectedPatterns.length > 0) {
      // Use max severity with diminishing returns for multiple patterns
      const severities = detectedPatterns.map(p => p.severity).sort((a, b) => b - a);
      threatScore = severities[0];
      for (let i = 1; i < severities.length; i++) {
        threatScore += severities[i] * Math.pow(0.5, i); // Diminishing returns
      }
      threatScore = Math.min(1, threatScore);
    }

    // Add blocklist contribution
    if (blocklistMatches.length > 0) {
      threatScore = Math.min(1, threatScore + 0.3);
    }

    const isBlocked = this.shouldBlock({ threatScore, detectedPatterns: detectedPatterns.map(p => p.name), isBlocked: false, recommendations: [], timestamp: Date.now(), assessmentId: '' });

    // Generate recommendations
    const recommendations = this.generateRecommendations(detectedPatterns, threatScore, isBlocked);

    // Sanitize input if enabled and not blocked
    let sanitizedInput: string | undefined;
    if (flags.sanitizeInputs && !isBlocked) {
      sanitizedInput = this.sanitizeInput(input);
    }

    const assessment: ThreatAssessment = {
      threatScore,
      detectedPatterns: detectedPatterns.map(p => p.name),
      isBlocked,
      sanitizedInput,
      recommendations,
      timestamp: Date.now(),
      assessmentId: `assess-${randomUUID()}`,
    };

    // Update statistics
    this.updateStats(assessment, detectedPatterns);

    // Store in history (limited)
    this.assessmentHistory.push(assessment);
    if (this.assessmentHistory.length > 1000) {
      this.assessmentHistory.shift();
    }

    // Penalize agent if enabled and patterns detected
    if (flags.penalizeOnDetection && context?.agentId && detectedPatterns.length > 0) {
      this.penalizeAgent(context.agentId, assessment);
    }

    // Log if enabled
    if (flags.logDetections && detectedPatterns.length > 0) {
      this.logDetection(assessment, context);
    }

    return assessment;
  }

  /**
   * Detect injection patterns in input
   */
  detectInjectionPatterns(input: string): DetectedPattern[] {
    if (!isAdversarialDefenseEnabled()) {
      return [];
    }

    const detected: DetectedPattern[] = [];
    const normalizedInput = input.toLowerCase();

    for (const [name, pattern] of this.patterns) {
      if (!pattern.enabled) continue;

      const match = pattern.pattern.exec(input) || pattern.pattern.exec(normalizedInput);
      if (match) {
        detected.push({
          name: pattern.name,
          category: pattern.category,
          matched: match[0],
          position: match.index,
          severity: pattern.severity,
          description: pattern.description,
        });

        // Update pattern match count in stats
        this.stats.patternMatchCounts[name] = (this.stats.patternMatchCounts[name] || 0) + 1;
      }
    }

    return detected;
  }

  /**
   * Sanitize input by removing/escaping dangerous patterns
   */
  sanitizeInput(input: string): string {
    if (!isAdversarialDefenseEnabled()) {
      return input;
    }

    let sanitized = input;

    // Remove or neutralize detected patterns first (before escaping)
    for (const [_, pattern] of this.patterns) {
      if (!pattern.enabled) continue;

      // For high-severity patterns, remove the matched content
      if (pattern.severity >= 0.8) {
        sanitized = sanitized.replace(pattern.pattern, '[REDACTED]');
      }
    }

    // Remove dangerous shell metacharacters entirely (not just escape)
    sanitized = sanitized.replace(/[;\|\&`$]/g, '');

    // Remove excessive whitespace
    sanitized = sanitized.replace(/\s{3,}/g, '  ');

    // Limit length
    const maxLength = 10000;
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength) + '...[TRUNCATED]';
    }

    this.stats.sanitizedInputs++;
    return sanitized;
  }

  /**
   * Escape special characters that could be used for injection
   */
  escapeSpecialCharacters(input: string): string {
    return input
      // Escape shell metacharacters
      .replace(/[;&|`$]/g, char => `\\${char}`)
      // Escape SQL quotes
      .replace(/[']/g, "''")
      // Escape backslashes (but not already escaped ones)
      .replace(/(?<!\\)\\/g, '\\\\');
  }

  /**
   * Determine if input should be blocked based on assessment
   */
  shouldBlock(assessment: ThreatAssessment): boolean {
    if (!isAdversarialDefenseEnabled()) {
      return false;
    }

    const flags = governanceFlags.getFlags().adversarialDefense;

    // Block if threat score exceeds threshold
    if (assessment.threatScore >= flags.blockThreshold) {
      return true;
    }

    // In strict mode, also block medium threats
    if (isStrictMode() && assessment.threatScore >= flags.blockThreshold * 0.7) {
      return true;
    }

    return false;
  }

  /**
   * Add a pattern to the blocklist
   */
  addToBlocklist(pattern: string, reason: string): void {
    if (!isAdversarialDefenseEnabled()) return;

    this.blocklist.set(pattern.toLowerCase(), {
      pattern,
      reason,
      addedAt: Date.now(),
      matchCount: 0,
    });
  }

  /**
   * Remove a pattern from the blocklist
   */
  removeFromBlocklist(pattern: string): void {
    this.blocklist.delete(pattern.toLowerCase());
  }

  /**
   * Check if blocklist is matched
   */
  private checkBlocklist(input: string): BlocklistEntry[] {
    const matches: BlocklistEntry[] = [];
    const normalizedInput = input.toLowerCase();

    for (const [key, entry] of this.blocklist) {
      if (normalizedInput.includes(key)) {
        entry.matchCount++;
        matches.push(entry);
      }
    }

    return matches;
  }

  /**
   * Penalize an agent's trust score based on threat assessment
   */
  penalizeAgent(agentId: string, assessment: ThreatAssessment): void {
    if (!isAdversarialDefenseEnabled()) return;

    // Calculate penalty based on threat score
    // Severe threats get higher penalties
    const basePenalty = 0.05;
    const penalty = basePenalty + (assessment.threatScore * 0.15);

    trustAccumulatorIntegration.penalizeTrust(
      agentId,
      penalty,
      `Adversarial input detected: ${assessment.detectedPatterns.join(', ')} (score: ${assessment.threatScore.toFixed(2)})`
    );

    this.stats.agentPenalties++;
  }

  /**
   * Add a custom detection pattern
   */
  addCustomPattern(pattern: DetectionPattern): void {
    // Ensure it's marked as custom
    const customPattern = {
      ...pattern,
      category: pattern.category || 'custom' as ThreatCategory,
    };
    this.patterns.set(pattern.name, customPattern);
  }

  /**
   * Remove a pattern
   */
  removePattern(name: string): boolean {
    return this.patterns.delete(name);
  }

  /**
   * Enable/disable a pattern
   */
  setPatternEnabled(name: string, enabled: boolean): boolean {
    const pattern = this.patterns.get(name);
    if (pattern) {
      pattern.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Get a specific pattern
   */
  getPattern(name: string): DetectionPattern | undefined {
    return this.patterns.get(name);
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): DetectionPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get pattern statistics
   */
  getPatternStats(): PatternStats {
    const patterns = Array.from(this.patterns.values());
    const byCategory: Record<ThreatCategory, number> = {
      'prompt-injection': 0,
      'jailbreak': 0,
      'role-manipulation': 0,
      'data-exfiltration': 0,
      'command-injection': 0,
      'encoded-payload': 0,
      'custom': 0,
    };

    let enabled = 0;
    let disabled = 0;
    let custom = 0;

    for (const pattern of patterns) {
      byCategory[pattern.category]++;
      if (pattern.enabled) enabled++;
      else disabled++;
      if (pattern.category === 'custom') custom++;
    }

    return {
      totalPatterns: patterns.length,
      patternsByCategory: byCategory,
      enabledPatterns: enabled,
      disabledPatterns: disabled,
      customPatterns: custom,
    };
  }

  /**
   * Get defense statistics
   */
  getDefenseStats(): DefenseStats {
    return { ...this.stats };
  }

  /**
   * Get blocklist entries
   */
  getBlocklist(): BlocklistEntry[] {
    return Array.from(this.blocklist.values());
  }

  /**
   * Get assessment history
   */
  getAssessmentHistory(limit: number = 100): ThreatAssessment[] {
    return this.assessmentHistory.slice(-limit);
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.patterns.clear();
    this.blocklist.clear();
    this.assessmentHistory = [];
    this.stats = this.createEmptyStats();
    this.initialized = false;
  }

  /**
   * Reset statistics only
   */
  resetStats(): void {
    this.stats = this.createEmptyStats();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Create empty stats object
   */
  private createEmptyStats(): DefenseStats {
    return {
      totalAssessments: 0,
      blockedInputs: 0,
      sanitizedInputs: 0,
      averageThreatScore: 0,
      patternMatchCounts: {},
      categoryBreakdown: {
        'prompt-injection': 0,
        'jailbreak': 0,
        'role-manipulation': 0,
        'data-exfiltration': 0,
        'command-injection': 0,
        'encoded-payload': 0,
        'custom': 0,
      },
      agentPenalties: 0,
      lastAssessment: null,
    };
  }

  /**
   * Create safe assessment for disabled state
   */
  private createSafeAssessment(input: string): ThreatAssessment {
    return {
      threatScore: 0,
      detectedPatterns: [],
      isBlocked: false,
      sanitizedInput: input,
      recommendations: [],
      timestamp: Date.now(),
      assessmentId: `safe-${Date.now()}`,
    };
  }

  /**
   * Update statistics with new assessment
   */
  private updateStats(assessment: ThreatAssessment, detectedPatterns: DetectedPattern[]): void {
    this.stats.totalAssessments++;

    if (assessment.isBlocked) {
      this.stats.blockedInputs++;
    }

    // Update average threat score (running average)
    const n = this.stats.totalAssessments;
    this.stats.averageThreatScore =
      ((this.stats.averageThreatScore * (n - 1)) + assessment.threatScore) / n;

    // Update category breakdown
    for (const pattern of detectedPatterns) {
      this.stats.categoryBreakdown[pattern.category]++;
    }

    this.stats.lastAssessment = assessment.timestamp;
  }

  /**
   * Generate recommendations based on assessment
   */
  private generateRecommendations(
    patterns: DetectedPattern[],
    threatScore: number,
    isBlocked: boolean
  ): string[] {
    const recommendations: string[] = [];

    if (isBlocked) {
      recommendations.push('Input blocked due to high threat score');
      recommendations.push('Review input source and sanitize before retry');
    }

    if (threatScore >= 0.7) {
      recommendations.push('Consider additional input validation');
      recommendations.push('Log this attempt for security review');
    }

    // Category-specific recommendations (only if patterns detected)
    if (patterns.length > 0) {
      const categories = new Set(patterns.map(p => p.category));

      if (categories.has('prompt-injection')) {
        recommendations.push('Implement input boundary markers');
        recommendations.push('Use separate instruction and data channels');
      }

      if (categories.has('jailbreak')) {
        recommendations.push('Monitor for repeated jailbreak attempts');
        recommendations.push('Consider rate limiting this user');
      }

      if (categories.has('role-manipulation')) {
        recommendations.push('Validate agent identity constraints');
        recommendations.push('Prevent role switching via user input');
      }

      if (categories.has('command-injection')) {
        recommendations.push('Never pass user input directly to command execution');
        recommendations.push('Use parameterized commands or allowlists');
      }

      if (categories.has('data-exfiltration')) {
        recommendations.push('Audit access to sensitive data');
        recommendations.push('Implement principle of least privilege');
      }

      if (categories.has('encoded-payload')) {
        recommendations.push('Decode and validate payloads before processing');
        recommendations.push('Consider rejecting deeply encoded inputs');
      }

      // General recommendation for any detected threat
      if (recommendations.length === 0) {
        recommendations.push('Review input for potential security issues');
      }
    }

    return recommendations;
  }

  /**
   * Log detection for audit trail
   */
  private logDetection(assessment: ThreatAssessment, context?: ThreatContext): void {
    if (!governanceFlags.getFlags().global.logViolations) return;

    console.warn(`[AdversarialDefense] Threat detected:`, {
      assessmentId: assessment.assessmentId,
      threatScore: assessment.threatScore.toFixed(3),
      patterns: assessment.detectedPatterns,
      isBlocked: assessment.isBlocked,
      agentId: context?.agentId,
      taskType: context?.taskType,
      source: context?.source,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Singleton instance
 */
export const adversarialDefenseIntegration = new AdversarialDefenseIntegration();

// Auto-initialize singleton on module load
adversarialDefenseIntegration.initialize().catch(() => {
  // Initialization is synchronous, but promise wrapper for future async needs
});

/**
 * Quick assessment helper
 */
export function quickThreatAssess(input: string): ThreatAssessment {
  // Ensure initialized
  if (!adversarialDefenseIntegration['initialized']) {
    adversarialDefenseIntegration.initialize();
  }
  return adversarialDefenseIntegration.assessThreat(input);
}

/**
 * Check if input is safe (threat score below threshold)
 */
export function isSafeInput(input: string): boolean {
  // Ensure initialized
  if (!adversarialDefenseIntegration['initialized']) {
    adversarialDefenseIntegration.initialize();
  }
  const assessment = adversarialDefenseIntegration.assessThreat(input);
  return !assessment.isBlocked && assessment.threatScore < 0.5;
}

/**
 * Sanitize user input
 */
export function sanitizeUserInput(input: string): string {
  // Ensure initialized
  if (!adversarialDefenseIntegration['initialized']) {
    adversarialDefenseIntegration.initialize();
  }
  return adversarialDefenseIntegration.sanitizeInput(input);
}
