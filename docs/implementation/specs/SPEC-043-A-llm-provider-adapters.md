# SPEC-043-A: LLM Provider Adapters

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-043-A |
| **Parent ADR** | [ADR-043](../adrs/ADR-043-vendor-independent-llm.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-15 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the provider adapter implementations for the HybridRouter system, covering all 7 supported LLM providers with their configuration interfaces and capability flags.

---

## Provider Implementations

### Provider Interface Extension

```typescript
interface LLMProvider {
  // Existing (ADR-011)
  generate(params: GenerateParams): Promise<LLMResponse>;
  embed(texts: string[]): Promise<number[][]>;
  healthCheck(): Promise<boolean>;

  // New capability flags
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsMCP: boolean;

  // Capability validation
  validateCapabilities(features: string[]): boolean;
}
```

### Supported Providers

| Provider | SDK | Key Features |
|----------|-----|--------------|
| **Anthropic Claude** | @anthropic-ai/sdk | Native, MCP support |
| **OpenAI** | openai | GPT-4, tools |
| **Ollama** | axios | Local inference |
| **OpenRouter** | axios | 100+ models, unified API |
| **Gemini** | @google/genai | Gemini Pro/Ultra/Flash |
| **Azure OpenAI** | @azure/openai | Enterprise, Azure AD |
| **AWS Bedrock** | @aws-sdk/client-bedrock | IAM, Claude on AWS |

### Provider Configuration Interfaces

```typescript
// OpenRouter configuration
interface OpenRouterConfig {
  apiKey: string;
  baseUrl?: string;  // default: https://openrouter.ai/api/v1
  defaultModel?: string;
  siteUrl?: string;  // For rankings
  siteName?: string;
}

// Gemini configuration
interface GeminiConfig {
  apiKey: string;
  projectId?: string;
  location?: string;  // default: us-central1
  defaultModel?: string;  // default: gemini-pro
}

// Azure OpenAI configuration
interface AzureOpenAIConfig {
  endpoint: string;  // e.g., https://myinstance.openai.azure.com
  apiKey?: string;
  useAzureAD?: boolean;
  deploymentName: string;
  apiVersion?: string;  // default: 2024-02-01
}

// AWS Bedrock configuration
interface BedrockConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  useIAMRole?: boolean;  // For EC2/Lambda
  defaultModel?: string;  // default: anthropic.claude-3-sonnet-20240229-v1:0
}

// ONNX Local configuration
interface ONNXConfig {
  modelPath: string;
  executionProvider?: 'cpu' | 'cuda' | 'coreml';
  numThreads?: number;
  quantized?: boolean;
}
```

---

## Implementation Files

| File | LOC | Description |
|------|-----|-------------|
| `src/shared/llm/providers/openrouter.ts` | 200 | OpenRouter adapter |
| `src/shared/llm/providers/gemini.ts` | 180 | Google Gemini adapter |
| `src/shared/llm/providers/azure-openai.ts` | 220 | Azure OpenAI adapter |
| `src/shared/llm/providers/bedrock.ts` | 350 | AWS Bedrock with SigV4 signing |
| `src/shared/llm/interfaces.ts` | - | All config interfaces |

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-043-A-001 | Provider config must include required auth fields | Error |
| SPEC-043-A-002 | Capability validation must return boolean | Error |
| SPEC-043-A-003 | All providers must implement healthCheck() | Error |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-15 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-043-vendor-independent-llm.md)
- [ADR-011: LLM Provider System](../adrs/v3-adrs.md#adr-011)
