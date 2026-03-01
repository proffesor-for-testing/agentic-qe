/**
 * Graceful Degradation Middleware
 *
 * Evaluates whether a skill can run on the current provider/model and returns
 * an appropriate action: proceed, warn, suggest-alternative, or block.
 *
 * This middleware sits between skill invocation and execution, ensuring that
 * AQE skills degrade gracefully when run on models below their minimum tier.
 *
 * @module degradation/graceful-degradation
 */

/**
 * Re-declare the types locally to avoid a hard dependency on
 * @agentic-qe/opencode-types when the workspace link is unavailable.
 */
export type ModelTierString = 'tier1-any' | 'tier2-good' | 'tier3-best';
export type DegradationBehavior = 'warn' | 'skip-step' | 'use-fallback' | 'block';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of evaluating degradation for a skill on a given provider/model.
 */
export interface DegradationResult {
  /** Action to take */
  action: 'proceed' | 'warn' | 'suggest-alternative' | 'block';
  /** Human-readable message explaining the action */
  message?: string;
  /** Alternative skill name when action is 'suggest-alternative' */
  alternativeSkill?: string;
  /** Extra guidance to inject into the prompt for quality improvement */
  extraGuidance?: string;
}

/**
 * Minimal skill tier info needed for degradation evaluation.
 * Avoids a hard dependency on the full registry module.
 */
export interface SkillTierInfo {
  skillName: string;
  minModelTier: ModelTierString;
  degradationBehavior: DegradationBehavior;
  fallbackSkill?: string;
}

/**
 * Function signature for looking up skill tier metadata.
 * Allows dependency injection of the registry.
 */
export type SkillTierLookup = (skillName: string) => SkillTierInfo | undefined;

// ---------------------------------------------------------------------------
// Provider-to-tier mapping
// ---------------------------------------------------------------------------

/**
 * Known provider/model combinations mapped to their effective tier.
 * The key format is `${providerId}/${modelId}` or just `${providerId}` for defaults.
 */
const PROVIDER_MODEL_TIERS: Record<string, ModelTierString> = {
  // Anthropic
  'anthropic/claude-opus-4': 'tier3-best',
  'anthropic/claude-sonnet-4': 'tier3-best',
  'anthropic/claude-haiku-3.5': 'tier2-good',
  'anthropic': 'tier3-best',

  // OpenAI
  'openai/gpt-4o': 'tier2-good',
  'openai/gpt-4o-mini': 'tier2-good',
  'openai/gpt-4-turbo': 'tier2-good',
  'openai/gpt-3.5-turbo': 'tier1-any',
  'openai/o1': 'tier3-best',
  'openai/o1-mini': 'tier2-good',
  'openai/o3-mini': 'tier2-good',
  'openai': 'tier2-good',

  // Google
  'google/gemini-pro': 'tier2-good',
  'google/gemini-ultra': 'tier3-best',
  'google/gemini-flash': 'tier1-any',
  'google': 'tier2-good',

  // Local models
  'ollama/llama3.1:70b': 'tier2-good',
  'ollama/llama3.1:8b': 'tier1-any',
  'ollama/mistral-large': 'tier2-good',
  'ollama/mistral:7b': 'tier1-any',
  'ollama/codellama:34b': 'tier1-any',
  'ollama': 'tier1-any',

  'lmstudio': 'tier1-any',
};

// ---------------------------------------------------------------------------
// Tier ranking
// ---------------------------------------------------------------------------

const TIER_RANK: Record<ModelTierString, number> = {
  'tier1-any': 1,
  'tier2-good': 2,
  'tier3-best': 3,
};

const TIER_LABELS: Record<ModelTierString, string> = {
  'tier1-any': 'any model',
  'tier2-good': 'a capable model (GPT-4o, Claude Haiku, or better)',
  'tier3-best': 'an advanced model (Claude Sonnet/Opus, GPT-o1, or Gemini Ultra)',
};

// ---------------------------------------------------------------------------
// Core evaluation function
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a skill can run on the current provider/model combination.
 *
 * @param skillName - The AQE skill name to evaluate
 * @param currentProvider - Provider identifier (e.g., 'anthropic', 'openai', 'ollama')
 * @param currentModel - Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o', 'llama3.1:8b')
 * @param lookupSkillTier - Function to look up skill tier metadata (dependency injection)
 * @returns DegradationResult with the recommended action
 */
export function evaluateDegradation(
  skillName: string,
  currentProvider: string,
  currentModel: string,
  lookupSkillTier?: SkillTierLookup,
): DegradationResult {
  // 1. Look up skill tier
  const skillTier = lookupSkillTier?.(skillName);
  if (!skillTier) {
    // Unknown skill — allow execution (could be a platform skill)
    return { action: 'proceed' };
  }

  // 2. Resolve current model's effective tier
  const modelTier = resolveModelTier(currentProvider, currentModel);

  // 3. Compare tiers
  const requiredRank = TIER_RANK[skillTier.minModelTier];
  const availableRank = TIER_RANK[modelTier];

  if (availableRank >= requiredRank) {
    return { action: 'proceed' };
  }

  // 4. Model is below minimum — apply degradation behavior
  const tierGap = requiredRank - availableRank;
  const tierLabel = TIER_LABELS[skillTier.minModelTier];

  switch (skillTier.degradationBehavior) {
    case 'block':
      return {
        action: 'block',
        message:
          `Skill "${skillName}" requires ${tierLabel}. ` +
          `Current model (${currentProvider}/${currentModel}) does not meet the minimum requirement. ` +
          `This skill is blocked because it involves security-critical analysis where lower-quality results are unacceptable.`,
      };

    case 'use-fallback':
      if (skillTier.fallbackSkill) {
        return {
          action: 'suggest-alternative',
          message:
            `Skill "${skillName}" works best with ${tierLabel}. ` +
            `Consider using "${skillTier.fallbackSkill}" instead for better results with the current model.`,
          alternativeSkill: skillTier.fallbackSkill,
        };
      }
      // No fallback defined — fall through to warn
      return {
        action: 'warn',
        message:
          `Skill "${skillName}" works best with ${tierLabel}. ` +
          `Current model may produce lower quality results.`,
        extraGuidance: buildDegradationGuidance(skillName, tierGap),
      };

    case 'skip-step':
      return {
        action: 'warn',
        message:
          `Skill "${skillName}" works best with ${tierLabel}. ` +
          `Some advanced steps will be skipped with the current model.`,
        extraGuidance:
          'Focus on the core analysis steps. Skip advanced reasoning steps like ' +
          'mutation design, deep security analysis, or multi-factor defect prediction.',
      };

    case 'warn':
    default:
      return {
        action: 'warn',
        message:
          `Skill "${skillName}" works best with ${tierLabel}. ` +
          `Current model (${currentProvider}/${currentModel}) may produce lower quality results.`,
        extraGuidance: buildDegradationGuidance(skillName, tierGap),
      };
  }
}

// ---------------------------------------------------------------------------
// Helper: resolve a provider/model pair to an effective tier
// ---------------------------------------------------------------------------

/**
 * Resolve the effective model tier for a provider/model combination.
 * Falls back to provider default, then to tier1-any for unknown providers.
 */
export function resolveModelTier(provider: string, model: string): ModelTierString {
  const normalized = provider.toLowerCase();
  const modelNormalized = model.toLowerCase();

  // Try exact match first
  const exact = PROVIDER_MODEL_TIERS[`${normalized}/${modelNormalized}`];
  if (exact) return exact;

  // Try provider default
  const providerDefault = PROVIDER_MODEL_TIERS[normalized];
  if (providerDefault) return providerDefault;

  // Unknown provider — assume lowest tier for safety
  return 'tier1-any';
}

// ---------------------------------------------------------------------------
// Helper: build degradation guidance text
// ---------------------------------------------------------------------------

function buildDegradationGuidance(skillName: string, tierGap: number): string {
  if (tierGap >= 2) {
    return (
      `The current model is significantly below the recommended tier for "${skillName}". ` +
      'Focus on the most straightforward aspects of the analysis. ' +
      'Avoid complex multi-step reasoning chains. ' +
      'Present findings with explicit confidence levels.'
    );
  }

  return (
    `The current model is one tier below the recommended tier for "${skillName}". ` +
    'Take extra care with complex reasoning steps. ' +
    'Validate conclusions by checking them from multiple angles.'
  );
}
