# SPEC-043-D: Agent-Aware Routing Rules

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-043-D |
| **Parent ADR** | [ADR-043](../adrs/ADR-043-vendor-independent-llm.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-15 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the rule-based routing system that automatically selects optimal providers and models based on agent type, task complexity, and requirements.

---

## Routing Rule Structure

```typescript
interface RoutingRule {
  condition: {
    agentType?: string[];        // Route specific agent types
    requiresTools?: boolean;      // Route tool-using requests
    complexity?: 'low' | 'medium' | 'high';
    localOnly?: boolean;          // Force local ONNX provider
    requiresReasoning?: boolean;  // Route to advanced models
    maxLatencyMs?: number;        // Latency constraint
    maxCostPer1kTokens?: number;  // Cost constraint
  };
  action: {
    provider: ProviderType;
    model: string;
    temperature?: number;
    fallbackProvider?: ProviderType;
  };
  priority: number;  // Higher = evaluated first
}
```

---

## QE Agent Routing Rules

```typescript
const QE_ROUTING_RULES: RoutingRule[] = [
  // Security agents need highest capability
  {
    condition: { agentType: ['security-auditor', 'qe-security-scanner'] },
    action: { provider: 'anthropic', model: 'claude-opus-4' },
    priority: 100
  },

  // Tool-using agents need tool support
  {
    condition: { agentType: ['qe-test-architect'], requiresTools: true },
    action: { provider: 'anthropic', model: 'claude-sonnet-4.5' },
    priority: 90
  },

  // Low complexity can use local inference
  {
    condition: { complexity: 'low', localOnly: true },
    action: { provider: 'onnx', model: 'phi-4' },
    priority: 80
  },

  // Cost-sensitive routing
  {
    condition: { maxCostPer1kTokens: 0.001 },
    action: { provider: 'ollama', model: 'llama3:8b' },
    priority: 70
  },

  // Default fallback
  {
    condition: {},
    action: { provider: 'anthropic', model: 'claude-sonnet-4.5' },
    priority: 0
  }
];
```

---

## Rule Evaluation Algorithm

```typescript
function evaluateRules(
  rules: RoutingRule[],
  params: ChatParams
): RoutingRule | null {
  // Sort by priority descending
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);

  for (const rule of sorted) {
    if (matchesCondition(rule.condition, params)) {
      return rule;
    }
  }
  return null;
}

function matchesCondition(
  condition: RoutingRule['condition'],
  params: ChatParams
): boolean {
  if (condition.agentType && params.agentType) {
    if (!condition.agentType.includes(params.agentType)) {
      return false;
    }
  }

  if (condition.requiresTools !== undefined) {
    const hasTools = (params.tools?.length ?? 0) > 0;
    if (condition.requiresTools !== hasTools) {
      return false;
    }
  }

  if (condition.complexity && params.complexity) {
    if (condition.complexity !== params.complexity) {
      return false;
    }
  }

  // All conditions matched (or no conditions specified)
  return true;
}
```

---

## Prompt Translation Layer

```typescript
interface PromptTranslator {
  translateMessages(messages: Message[], targetProvider: ProviderType): Message[];
  handleSystemPrompt(system: string, targetProvider: ProviderType): SystemConfig;
  translateTools(tools: Tool[], targetProvider: ProviderType): Tool[];
}

// Provider-specific system prompt handling
const SYSTEM_PROMPT_FORMATS: Record<ProviderType, (s: string) => SystemConfig> = {
  anthropic: (s) => ({ system: s }),
  openai: (s) => ({ messages: [{ role: 'system', content: s }] }),
  gemini: (s) => ({ systemInstruction: s }),
  // ... other providers
};
```

---

## Implementation Files

| File | LOC | Description |
|------|-----|-------------|
| `src/shared/llm/router/routing-rules.ts` | 200 | Rule engine and QE rules |
| `src/shared/llm/translation/prompt-translator.ts` | 150 | Message translation |

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-043-D-001 | Rules must have unique priority per condition set | Warning |
| SPEC-043-D-002 | Default fallback rule (priority 0) must exist | Error |
| SPEC-043-D-003 | Agent types in rules must be valid agent names | Warning |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-15 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-043-vendor-independent-llm.md)
- [SPEC-043-B: HybridRouter Core](./SPEC-043-B-hybrid-router-core.md)
