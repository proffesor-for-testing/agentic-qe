import { z } from 'zod';

// Core agent metadata schema
export const AgentMetadataSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string().optional(),
  category: z.string(),
  model: z.string().optional(),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  pactLevel: z.number().optional(),
});

// Tool parameter schema
export const ToolParameterSchema = z.object({
  type: z.enum(['string', 'number', 'integer', 'boolean', 'object', 'array']),
  description: z.string().optional(),
  enum: z.array(z.string()).optional(),
  default: z.any().optional(),
  required: z.boolean().optional(),
});

// Tool schema
export const ToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), ToolParameterSchema).optional(),
});

// State transition schema
export const StateTransitionSchema = z.object({
  to: z.string(),
  trigger: z.string(),
  condition: z.string().optional(),
});

// State schema
export const StateSchema = z.object({
  description: z.string(),
  transitions: z.array(StateTransitionSchema).optional(),
});

// Trigger schema
export const TriggerSchema = z.object({
  event: z.string(),
  condition: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
});

// Workflow step schema
export const WorkflowStepSchema = z.object({
  step: z.string(),
  description: z.string(),
  actions: z.array(z.string()),
});

// Workflow schema
export const WorkflowSchema = z.object({
  steps: z.array(WorkflowStepSchema),
});

// Parameter schema for agent configuration
export const ParameterSchema = z.object({
  type: z.string(),
  default: z.any().optional(),
  description: z.string(),
});

// Complete agent schema
export const AgentSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string().optional(),
  category: z.string(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
  pactLevel: z.number().min(1).max(5).optional(),
  system_prompt: z.string().optional(),

  // Core functionality
  capabilities: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  tools: z.array(ToolSchema).optional(),
  tags: z.array(z.string()).optional(),

  // Advanced configurations
  parameters: z.record(z.string(), ParameterSchema).optional(),
  triggers: z.array(TriggerSchema).optional(),
  states: z.record(z.string(), StateSchema).optional(),
  workflows: z.record(z.string(), WorkflowSchema).optional(),

  // Metadata and examples
  metadata: z.record(z.string(), z.any()).optional(),
  example_prompts: z.array(z.string()).optional(),

  // Integration hooks
  hooks: z.record(z.string(), z.array(z.string())).optional(),

  // Monitoring and optimization
  monitoring: z.record(z.string(), z.any()).optional(),
  algorithms: z.record(z.string(), z.any()).optional(),
  fault_tolerance: z.record(z.string(), z.any()).optional(),
  optimization: z.record(z.string(), z.any()).optional(),
  error_handling: z.record(z.string(), z.any()).optional(),
  integration: z.record(z.string(), z.any()).optional(),
});

// Type definitions
export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type ToolParameter = z.infer<typeof ToolParameterSchema>;
export type StateTransition = z.infer<typeof StateTransitionSchema>;
export type State = z.infer<typeof StateSchema>;
export type Trigger = z.infer<typeof TriggerSchema>;
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type Parameter = z.infer<typeof ParameterSchema>;
export type Agent = z.infer<typeof AgentSchema>;

// Agent registry entry
export interface AgentRegistryEntry {
  agent: Agent;
  filePath: string;
  lastModified: Date;
  isRegistered: boolean;
  claudeAgentPath?: string;
  claudeCommandPath?: string;
}

// Claude Code agent configuration
export interface ClaudeAgentConfig {
  name: string;
  description: string;
  instructions: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[];
  capabilities?: string[];
}

// Claude Code command configuration
export interface ClaudeCommandConfig {
  name: string;
  description: string;
  usage: string;
  handler: string;
  parameters?: {
    [key: string]: {
      type: string;
      description: string;
      required?: boolean;
      default?: any;
    };
  };
}

// Swarm coordination configuration
export interface SwarmConfig {
  topology: 'mesh' | 'hierarchical' | 'ring' | 'star';
  strategy: 'balanced' | 'specialized' | 'adaptive';
  maxAgents: number;
  coordination: {
    memory: boolean;
    hooks: boolean;
    neural: boolean;
  };
}

// QE Framework configuration
export interface QEFrameworkConfig {
  version: string;
  agentsPath: string;
  claudeAgentsPath: string;
  claudeCommandsPath: string;
  swarm: SwarmConfig;
  logging: {
    level: string;
    file?: string;
  };
  claude_flow: {
    enabled: boolean;
    auto_spawn: boolean;
    coordination_hooks: boolean;
  };
}

// CLI operation result
export interface OperationResult {
  success: boolean;
  message: string;
  data?: any;
  errors?: string[];
  warnings?: string[];
}

// Agent spawn configuration
export interface SpawnConfig {
  agents: string[];
  parallel: boolean;
  coordination: boolean;
  memory_namespace?: string;
  swarm_id?: string;
  hooks: {
    pre_task: boolean;
    post_task: boolean;
    session_restore: boolean;
  };
}