#!/usr/bin/env node
/**
 * advisor-call.cjs — Helper script for agent advisor protocol (ADR-092)
 *
 * Agents call this instead of invoking `aqe llm advise` directly.
 * This script:
 *   1. Reads .agentic-qe/config.yaml for advisor settings
 *   2. Detects available API keys in environment
 *   3. Applies security-agent provider restrictions automatically
 *   4. Picks the best available provider/model
 *   5. Calls `aqe llm advise` with the resolved settings
 *
 * Usage from agent definitions:
 *   node "$(dirname "$(which aqe)")/../lib/helpers/advisor-call.cjs" \
 *     --agent <agent-name> \
 *     --task "<task description>" \
 *     --context "<what the executor has found so far>"
 *
 * Or simpler (when aqe is installed):
 *   aqe advisor call --agent <name> --task "<desc>" --context "<ctx>"
 *
 * Exits 0 with JSON on success, 1-6 with error JSON on failure.
 */

'use strict';

const { execFileSync } = require('child_process');
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');
const { join, dirname } = require('path');
const { tmpdir } = require('os');

// ============================================================================
// Parse arguments
// ============================================================================

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

const agentName = getArg('agent') || 'unknown';
const taskDescription = getArg('task') || '';
const context = getArg('context') || '';
const userMessage = getArg('message') || taskDescription;

if (!taskDescription && !userMessage) {
  console.error(JSON.stringify({
    error: 'Usage: advisor-call.cjs --agent <name> --task "<description>" [--context "<findings>"] [--message "<user request>"]',
    exit_code: 1,
  }));
  process.exit(1);
}

// ============================================================================
// Detect available providers from environment
// ============================================================================

const availableProviders = [];

if (process.env.OPENROUTER_API_KEY) {
  availableProviders.push({
    name: 'openrouter',
    model: 'anthropic/claude-opus-4',
    securityAllowed: false, // third-party proxy
  });
}

if (process.env.ANTHROPIC_API_KEY) {
  availableProviders.push({
    name: 'claude',
    model: 'claude-opus-4-6',
    securityAllowed: true,
  });
}

if (process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL) {
  availableProviders.push({
    name: 'ollama',
    model: process.env.OLLAMA_ADVISOR_MODEL || 'llama3.1:70b',
    securityAllowed: true, // self-hosted
  });
}

if (availableProviders.length === 0) {
  console.error(JSON.stringify({
    error: 'No advisor provider available. Set one of: OPENROUTER_API_KEY, ANTHROPIC_API_KEY, OLLAMA_HOST',
    exit_code: 4,
  }));
  process.exit(4);
}

// ============================================================================
// Read project config for advisor overrides
// ============================================================================

let advisorConfig = {};
const configPaths = [
  join(process.cwd(), '.agentic-qe', 'config.yaml'),
  join(process.cwd(), '.agentic-qe', 'config.json'),
];

for (const cfgPath of configPaths) {
  try {
    if (!existsSync(cfgPath)) continue;
    const raw = readFileSync(cfgPath, 'utf-8');

    if (cfgPath.endsWith('.yaml') || cfgPath.endsWith('.yml')) {
      // Simple YAML parse for advisor section (no dependency required)
      const advisorMatch = raw.match(/^advisor:\s*\n((?:  .+\n)*)/m);
      if (advisorMatch) {
        const lines = advisorMatch[1].split('\n').filter(Boolean);
        for (const line of lines) {
          const kv = line.match(/^\s+(\w+):\s*"?([^"#\n]+)"?/);
          if (kv) advisorConfig[kv[1].trim()] = kv[2].trim();
        }
      }
    } else {
      const json = JSON.parse(raw);
      if (json.advisor) advisorConfig = json.advisor;
    }
    break;
  } catch {
    // config not available — use defaults
  }
}

// ============================================================================
// Select provider based on agent domain + security constraints
// ============================================================================

const isSecurityAgent = /^qe-security|^qe-pentest/.test(agentName);

let selectedProvider;

// Config override takes priority
if (advisorConfig.provider) {
  selectedProvider = availableProviders.find(p => p.name === advisorConfig.provider);
}

// Security agents: filter to allowed providers only
if (!selectedProvider && isSecurityAgent) {
  selectedProvider = availableProviders.find(p => p.securityAllowed);
  if (!selectedProvider) {
    console.error(JSON.stringify({
      error: `Security agent "${agentName}" requires direct Anthropic (ANTHROPIC_API_KEY) or self-hosted Ollama. OpenRouter is not allowed for security agents.`,
      exit_code: 6,
    }));
    process.exit(6);
  }
}

// Default: first available provider (preference: openrouter > claude > ollama)
if (!selectedProvider) {
  selectedProvider = availableProviders[0];
}

// Config model override
const model = advisorConfig.model || selectedProvider.model;
const maxUses = advisorConfig.maxUses || '3';
const redactMode = advisorConfig.redact || 'strict';

// M2 fix: resolve domain-specific advisor prompt from agent name
const DOMAIN_PROMPTS = {
  'test-generation': 'You are the advisor for a test-generation executor. Respond in under 100 words, enumerated steps. Name concrete classes, methods, dependencies. Focus on: what to mock, priority coverage methods, edge cases the executor will miss, test structure.',
  'security-compliance': 'You are the advisor for a security executor. Respond in under 100 words, enumerated steps. Name concrete attack vectors, CWE IDs, code locations. Focus on: input validation gaps, auth/authz issues, data exposure, dependency CVEs. Prioritize by exploitability.',
  'coverage-analysis': 'You are the advisor for a coverage analysis executor. Respond in under 100 words, enumerated steps. Name concrete uncovered files, functions, branches. Focus on: highest business risk gaps, missed branch types, quick wins.',
  'cross-domain': 'You are the advisor for a fleet commander. Respond in under 100 words, enumerated steps. Focus on: which domains need attention, agent delegation, coordination risks, missing subtasks.',
};

const AGENT_DOMAIN_MAP = {
  'qe-test-architect': 'test-generation',
  'qe-test-generator': 'test-generation',
  'qe-coverage-specialist': 'coverage-analysis',
  'qe-coverage-analyzer': 'coverage-analysis',
  'qe-security-auditor': 'security-compliance',
  'qe-security-scanner': 'security-compliance',
  'qe-pentest-validator': 'security-compliance',
  'qe-fleet-commander': 'cross-domain',
  'qe-queen-coordinator': 'cross-domain',
  'qe-risk-assessor': 'cross-domain',
  'qe-root-cause-analyzer': 'cross-domain',
};

const agentDomain = AGENT_DOMAIN_MAP[agentName];
const domainPrompt = agentDomain ? DOMAIN_PROMPTS[agentDomain] : null;

// ============================================================================
// Write transcript and call aqe llm advise
// ============================================================================

const transcriptDir = join(tmpdir(), 'aqe-advisor');
mkdirSync(transcriptDir, { recursive: true });
const transcriptPath = join(transcriptDir, `transcript-${Date.now()}.json`);

const transcript = {
  taskDescription,
  messages: [
    { role: 'user', content: userMessage },
    ...(context ? [{ role: 'assistant', content: context }] : []),
  ],
};

writeFileSync(transcriptPath, JSON.stringify(transcript));

// Find aqe binary
let aqeBin = 'aqe';
try {
  execFileSync('which', ['aqe'], { encoding: 'utf-8' });
} catch {
  // aqe not on PATH — try npx
  aqeBin = 'npx';
}

const cliArgs = aqeBin === 'npx'
  ? ['aqe', 'llm', 'advise']
  : ['llm', 'advise'];

cliArgs.push(
  '--transcript', transcriptPath,
  '--agent', agentName,
  '--provider', selectedProvider.name,
  '--model', model,
  '--redact', redactMode,
  '--json',
);

// M2 fix: pass domain-specific prompt if resolved
if (domainPrompt) {
  cliArgs.push('--advisor-prompt', domainPrompt);
}

try {
  const result = execFileSync(aqeBin, cliArgs, {
    encoding: 'utf-8',
    timeout: 60000,
    env: process.env,
  });

  // Forward the JSON result, filtering out non-JSON lines (e.g., UnifiedMemory init)
  const lines = result.split('\n');
  let inJson = false;
  let jsonDepth = 0;
  const jsonLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inJson && trimmed.startsWith('{')) {
      inJson = true;
    }
    if (inJson) {
      jsonLines.push(line);
      jsonDepth += (trimmed.match(/{/g) || []).length;
      jsonDepth -= (trimmed.match(/}/g) || []).length;
      if (jsonDepth <= 0) break;
    }
  }

  if (jsonLines.length > 0) {
    console.log(jsonLines.join('\n'));
  }

  // Clean up transcript
  try { require('fs').unlinkSync(transcriptPath); } catch {}

  process.exit(0);
} catch (err) {
  const exitCode = err.status || 1;
  const stderr = err.stderr || err.message || 'Unknown error';

  console.error(JSON.stringify({
    error: stderr.slice(0, 500),
    exit_code: exitCode,
    provider: selectedProvider.name,
    model,
    agent: agentName,
  }));

  // Clean up
  try { require('fs').unlinkSync(transcriptPath); } catch {}

  process.exit(exitCode);
}
