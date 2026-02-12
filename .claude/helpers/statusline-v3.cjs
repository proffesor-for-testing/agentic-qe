#!/usr/bin/env node
/**
 * Agentic QE v3 Statusline Generator (Node.js)
 * Combines best of claude-flow and AQE v3 approaches
 *
 * Features:
 * - Fast Node.js execution
 * - Accurate sqlite3 queries for patterns/experiences
 * - Claude Code stdin JSON for context awareness
 * - Real-time process detection for running agents
 * - CVE caching for performance
 * - JSON output mode for automation
 *
 * Usage: node statusline-v3.cjs [--json] [--compact] [--no-color]
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// Use better-sqlite3 for reliable database access (no CLI dependency)
let Database;
try {
  Database = require('better-sqlite3');
} catch {
  Database = null; // Fallback to CLI if better-sqlite3 not available
}

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  // Targets
  domainsTotal: 13,
  v3QeTarget: 60,
  coverageTarget: 90,
  learningTarget: 15,
  flashAttentionTarget: '2.49x-7.47x',
  intelligenceTargetExp: 1000, // 1000 experiences = 100%

  // Paths - ROOT database is the consolidated source (MCP writes here)
  // Priority: root > v3 (v3 db is stale, kept only for backup)
  memoryDbPaths: [
    '.agentic-qe/memory.db',       // ROOT: Primary when CWD is project root
    '../.agentic-qe/memory.db',    // ROOT: When CWD is v3/ or other subdirectory
    'v3/.agentic-qe/memory.db',    // V3: Fallback only (stale after consolidation)
  ],
  cveCache: '.agentic-qe/.cve-cache',
  cveCacheAge: 3600, // 1 hour
  learningConfigPaths: [
    'v3/.agentic-qe/learning-config.json',      // V3 config
    '.agentic-qe/data/learning-config.json',    // Root data dir
    '.agentic-qe/learning-config.json',         // Root fallback
  ],
  coverageFile: 'coverage/coverage-summary.json',

  // Domain list
  domains: [
    'test-generation', 'test-execution', 'coverage-analysis',
    'quality-assessment', 'defect-intelligence', 'requirements-validation',
    'code-intelligence', 'security-compliance', 'contract-testing',
    'visual-accessibility', 'chaos-resilience', 'learning-optimization',
    'enterprise-integration'
  ],
};

// ═══════════════════════════════════════════════════════════════
// ANSI Colors
// ═══════════════════════════════════════════════════════════════

const useColor = !process.argv.includes('--no-color');

const c = useColor ? {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[0;33m',
  blue: '\x1b[0;34m',
  purple: '\x1b[0;35m',
  cyan: '\x1b[0;36m',
  white: '\x1b[0;37m',
  brightRed: '\x1b[1;31m',
  brightGreen: '\x1b[1;32m',
  brightYellow: '\x1b[1;33m',
  brightBlue: '\x1b[1;34m',
  brightPurple: '\x1b[1;35m',
  brightCyan: '\x1b[1;36m',
  brightWhite: '\x1b[1;37m',
} : Object.fromEntries(Object.keys({
  reset: '', bold: '', dim: '', red: '', green: '', yellow: '',
  blue: '', purple: '', cyan: '', white: '', brightRed: '', brightGreen: '',
  brightYellow: '', brightBlue: '', brightPurple: '', brightCyan: '', brightWhite: ''
}).map(k => [k, '']));

// ═══════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════

function execQuiet(cmd, defaultValue = '') {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return defaultValue;
  }
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readJsonFile(filePath, defaultValue = {}) {
  try {
    if (fileExists(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // Ignore
  }
  return defaultValue;
}

// Database connection cache for performance
let dbCache = new Map();

function getDb(dbPath) {
  if (!dbCache.has(dbPath)) {
    if (Database && fileExists(dbPath)) {
      try {
        const db = new Database(dbPath, { readonly: true, fileMustExist: true });
        dbCache.set(dbPath, db);
      } catch {
        dbCache.set(dbPath, null);
      }
    } else {
      dbCache.set(dbPath, null);
    }
  }
  return dbCache.get(dbPath);
}

function sqlite3Query(dbPath, query, defaultValue = '0') {
  if (!fileExists(dbPath)) return defaultValue;

  // Prefer better-sqlite3 (Node.js native, no CLI dependency)
  if (Database) {
    try {
      const db = getDb(dbPath);
      if (db) {
        const row = db.prepare(query).get();
        if (row) {
          // Return the first column value
          const values = Object.values(row);
          return values.length > 0 ? String(values[0]) : defaultValue;
        }
      }
      return defaultValue;
    } catch {
      return defaultValue;
    }
  }

  // Fallback to CLI if better-sqlite3 not available
  try {
    const result = execSync(`sqlite3 "${dbPath}" "${query}" 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 3000
    }).trim();
    return result || defaultValue;
  } catch {
    return defaultValue;
  }
}

function padLeft(str, len) {
  return String(str).padStart(len, ' ');
}

// ═══════════════════════════════════════════════════════════════
// Data Collection Functions
// ═══════════════════════════════════════════════════════════════

function getClaudeCodeInput() {
  // Try to read Claude Code JSON from stdin (non-blocking)
  try {
    if (!process.stdin.isTTY) {
      const fd = fs.openSync('/dev/stdin', 'r');
      const buffer = Buffer.alloc(65536);
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      fs.closeSync(fd);
      if (bytesRead > 0) {
        return JSON.parse(buffer.toString('utf-8', 0, bytesRead));
      }
    }
  } catch {
    // Ignore - stdin not available or not JSON
  }
  return {};
}

function getUserInfo(claudeInput) {
  let name = execQuiet('gh api user --jq ".login" 2>/dev/null') ||
             execQuiet('git config user.name 2>/dev/null') ||
             'developer';

  let gitBranch = execQuiet('git branch --show-current 2>/dev/null');

  let modelName = '';
  if (claudeInput.model?.display_name) {
    modelName = claudeInput.model.display_name;
  }

  return { name, gitBranch, modelName };
}

function getDomainProgress(projectDir) {
  let completed = 0;
  let inProgress = 0;

  for (const domain of CONFIG.domains) {
    const domainDir = path.join(projectDir, 'v3/src/domains', domain);
    if (fileExists(domainDir)) {
      try {
        const files = fs.readdirSync(domainDir).filter(f => f.endsWith('.ts'));
        if (files.length >= 3) {
          completed++;
        } else if (files.length >= 1) {
          inProgress++;
        }
      } catch {
        // Ignore
      }
    }
  }

  return { completed, inProgress, total: CONFIG.domainsTotal };
}

function getTestCounts(projectDir) {
  let unit = 0;
  let integration = 0;

  const unitDir = path.join(projectDir, 'v3/tests/unit');
  const intDir = path.join(projectDir, 'v3/tests/integration');

  try {
    if (fileExists(unitDir)) {
      unit = parseInt(execQuiet(`find "${unitDir}" -name "*.test.ts" 2>/dev/null | wc -l`)) || 0;
    }
    if (fileExists(intDir)) {
      integration = parseInt(execQuiet(`find "${intDir}" -name "*.test.ts" 2>/dev/null | wc -l`)) || 0;
    }
  } catch {
    // Ignore
  }

  return { unit, integration };
}

function getLearningMetrics(projectDir) {
  // Find the consolidated V3 database
  let dbPath = null;

  for (const relPath of CONFIG.memoryDbPaths) {
    const candidate = path.join(projectDir, relPath);
    if (fileExists(candidate)) {
      dbPath = candidate;
      break;
    }
  }

  if (!dbPath) {
    return {
      patterns: 0, synthesized: 0, totalPatterns: 0, experiences: 0,
      transfers: 0, successRate: 0, intelligencePct: 0, mode: 'off',
      dbSource: 'none'
    };
  }

  // Consolidated V3 DB has BOTH old schema tables (migrated) and new V3 tables
  // Read from ALL relevant tables for complete metrics

  // Legacy patterns (migrated from root DB)
  const legacyPatterns = parseInt(sqlite3Query(dbPath, 'SELECT COUNT(*) FROM patterns')) || 0;
  // V3 SONA patterns (new V3 neural patterns)
  const sonaPatterns = parseInt(sqlite3Query(dbPath, 'SELECT COUNT(*) FROM sona_patterns')) || 0;
  // Synthesized patterns (dream-generated)
  const synthesized = parseInt(sqlite3Query(dbPath, 'SELECT COUNT(*) FROM synthesized_patterns')) || 0;
  // QE patterns (v3 pattern store)
  const qePatterns = parseInt(sqlite3Query(dbPath, 'SELECT COUNT(*) FROM qe_patterns')) || 0;
  // KV store patterns (MCP-stored patterns)
  const kvPatterns = parseInt(sqlite3Query(dbPath, "SELECT COUNT(*) FROM kv_store WHERE key LIKE '%pattern%'")) || 0;

  // Total patterns = legacy + SONA + QE + KV patterns (deduplicated estimate)
  const patterns = legacyPatterns + sonaPatterns + qePatterns + Math.floor(kvPatterns / 10);

  // Learning experiences (migrated from root DB)
  const legacyExperiences = parseInt(sqlite3Query(dbPath, 'SELECT COUNT(*) FROM learning_experiences')) || 0;
  // V3 trajectories (new V3 trajectory tracking)
  const trajectories = parseInt(sqlite3Query(dbPath, 'SELECT COUNT(*) FROM qe_trajectories')) || 0;
  // Captured experiences (task execution captures)
  const capturedExp = parseInt(sqlite3Query(dbPath, 'SELECT COUNT(*) FROM captured_experiences')) || 0;
  // Memory entries with learning data (MCP-stored experiences)
  const memoryLearning = parseInt(sqlite3Query(dbPath, "SELECT COUNT(*) FROM memory_entries WHERE key LIKE 'learning%' OR key LIKE 'phase2/learning%'")) || 0;

  // Total experiences = all sources
  const experiences = legacyExperiences + trajectories + capturedExp + memoryLearning;

  // Transfer learning count
  const transfers = parseInt(sqlite3Query(dbPath, 'SELECT COUNT(*) FROM transfer_registry')) || 0;

  // Success rate from legacy patterns
  const successRate = parseFloat(sqlite3Query(dbPath,
    'SELECT ROUND(AVG(success_rate)*100) FROM patterns WHERE success_rate > 0', '0')) || 0;

  // Intelligence % based on total learning data (target: 1000 = 100%)
  const totalLearningData = patterns + synthesized + experiences;
  const intelligencePct = Math.min(100, Math.floor((totalLearningData / CONFIG.intelligenceTargetExp) * 100));

  // Get learning mode from config (check multiple paths)
  let mode = 'off';
  for (const relPath of CONFIG.learningConfigPaths) {
    const configPath = path.join(projectDir, relPath);
    const config = readJsonFile(configPath);
    if (config.enabled && config.scheduler?.mode) {
      mode = config.scheduler.mode;
      break;
    }
  }

  // Determine dbSource from which path was found
  const dbSource = dbPath.includes('v3/.agentic-qe') ? 'v3' : 'root';

  return {
    patterns,
    synthesized,
    totalPatterns: patterns + synthesized,
    experiences,
    transfers,
    successRate,
    intelligencePct,
    mode,
    dbSource,  // 'root' = consolidated primary, 'v3' = legacy
  };
}

function getCveStatus(projectDir) {
  const cachePath = path.join(projectDir, CONFIG.cveCache);
  let total = 0;
  let fixed = 0;

  // Check cache first
  if (fileExists(cachePath)) {
    try {
      const stat = fs.statSync(cachePath);
      const age = (Date.now() - stat.mtimeMs) / 1000;
      if (age < CONFIG.cveCacheAge) {
        const cache = readJsonFile(cachePath);
        total = cache.total || 0;
        fixed = cache.fixed || 0;
        return { total, fixed, unfixed: total - fixed, cached: true };
      }
    } catch {
      // Cache invalid
    }
  }

  // Fetch fresh CVE data (with timeout)
  try {
    const output = execQuiet('timeout 2 npx @claude-flow/cli@latest security cve --list 2>/dev/null');
    if (output) {
      total = (output.match(/CVE-/g) || []).length;
      fixed = (output.match(/Fixed/g) || []).length;

      // Update cache
      try {
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify({ total, fixed, updated: new Date().toISOString() }));
      } catch {
        // Ignore cache write errors
      }
    }
  } catch {
    // Ignore
  }

  return { total, fixed, unfixed: total - fixed, cached: false };
}

function getAgentCounts(projectDir, claudeInput) {
  // V3-QE agent definitions (from files)
  // Note: Agents were renamed from v3-qe-*.md to qe-*.md pattern
  let v3QeAgents = 0;
  const agentsDir = path.join(projectDir, '.claude/agents/v3');
  if (fileExists(agentsDir)) {
    try {
      v3QeAgents = parseInt(execQuiet(`find "${agentsDir}" -name "qe-*.md" 2>/dev/null | wc -l`)) || 0;
    } catch {
      // Ignore
    }
  }

  // Running sub-agents (from processes)
  let runningAgents = 0;
  try {
    // Check for claude-flow or agentic agents
    const ps = execQuiet('ps aux 2>/dev/null | grep -E "(claude-flow.*agent|agentic.*agent)" | grep -v grep | wc -l');
    runningAgents = Math.max(0, parseInt(ps) || 0);
  } catch {
    // Ignore
  }

  // Also check Claude Code JSON for sub-agents
  if (claudeInput.agents?.active_count) {
    runningAgents = Math.max(runningAgents, claudeInput.agents.active_count);
  }

  return { v3QeAgents, runningAgents };
}

function getContextUsage(claudeInput) {
  let pct = 0;

  if (claudeInput.context_window) {
    const cw = claudeInput.context_window;
    const windowSize = cw.context_window_size || 0;
    if (windowSize > 0) {
      const usage = cw.current_usage || {};
      const current = (usage.input_tokens || 0) +
                      (usage.cache_creation_input_tokens || 0) +
                      (usage.cache_read_input_tokens || 0);
      pct = Math.floor((current / windowSize) * 100);
    }
  }

  return pct;
}

function getArchitectureMetrics(projectDir) {
  // ADR count - deduplicated across embedded and standalone files
  let adrCount = 0;
  const adrDir = path.join(projectDir, 'v3/implementation/adrs');
  const adrFile = path.join(adrDir, 'v3-adrs.md');
  const uniqueAdrNums = new Set();

  if (fileExists(adrDir)) {
    // Embedded ADRs - extract ADR numbers (normalize by parsing as int)
    if (fileExists(adrFile)) {
      const content = fs.readFileSync(adrFile, 'utf-8');
      const matches = content.match(/^## ADR-(\d+)/gm) || [];
      matches.forEach(m => {
        const num = m.match(/\d+/)?.[0];
        if (num) uniqueAdrNums.add(parseInt(num, 10)); // Normalize: "036" -> 36
      });
    }
    // Standalone ADR files - extract ADR numbers (normalize by parsing as int)
    try {
      const standaloneFiles = execQuiet(`find "${adrDir}" -maxdepth 1 -name "ADR-0*.md" -exec basename {} \\; 2>/dev/null`);
      if (standaloneFiles) {
        standaloneFiles.split('\n').forEach(f => {
          const num = f.match(/ADR-0*(\d+)/)?.[1];
          if (num) uniqueAdrNums.add(parseInt(num, 10)); // Normalize: "36" -> 36
        });
      }
    } catch {
      // Ignore
    }
    adrCount = uniqueAdrNums.size;
  }

  // Hooks count
  let hooksCount = 0;
  const hooksDir = path.join(projectDir, '.claude/hooks');
  if (fileExists(hooksDir)) {
    try {
      hooksCount = parseInt(execQuiet(`find "${hooksDir}" \\( -name "*.sh" -o -name "*.json" \\) 2>/dev/null | wc -l`)) || 0;
    } catch {
      // Ignore
    }
  }

  // AgentDB size - check both V3 and root databases
  let agentDbSize = '';
  for (const relPath of CONFIG.memoryDbPaths) {
    const dbPath = path.join(projectDir, relPath);
    if (fileExists(dbPath)) {
      try {
        const stats = fs.statSync(dbPath);
        const sizeKB = Math.floor(stats.size / 1024);
        agentDbSize = sizeKB > 1024 ? `${Math.floor(sizeKB / 1024)}M` : `${sizeKB}K`;
        break; // Use first found database
      } catch {
        // Ignore
      }
    }
  }

  return { adrCount, hooksCount, agentDbSize };
}

function getCoverage(projectDir) {
  const coveragePath = path.join(projectDir, CONFIG.coverageFile);
  if (fileExists(coveragePath)) {
    const coverage = readJsonFile(coveragePath);
    return Math.round(coverage.total?.lines?.pct || 0);
  }
  return -1; // No coverage data
}

// ═══════════════════════════════════════════════════════════════
// Output Generators
// ═══════════════════════════════════════════════════════════════

function generateDomainBar(completed, inProgress, total) {
  const completedDot = `${c.brightGreen}●${c.reset}`;
  const progressDot = `${c.yellow}◐${c.reset}`;
  const pendingDot = `${c.dim}○${c.reset}`;

  let bar = '[';
  for (let i = 0; i < completed; i++) bar += completedDot;
  for (let i = 0; i < inProgress; i++) bar += progressDot;
  for (let i = 0; i < (total - completed - inProgress); i++) bar += pendingDot;
  bar += ']';

  return bar;
}

function colorByThreshold(value, thresholds, colors) {
  for (let i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i]) return colors[i];
  }
  return colors[colors.length - 1];
}

function generateStatusline(data) {
  const lines = [];

  // Header Line
  let header = `${c.bold}${c.brightPurple}▊ Agentic QE v3 ${c.reset}`;
  header += `${c.brightCyan}${data.user.name}${c.reset}`;
  if (data.user.gitBranch) {
    header += `  ${c.dim}│${c.reset}  ${c.brightBlue}⎇ ${data.user.gitBranch}${c.reset}`;
  }
  if (data.user.modelName) {
    header += `  ${c.dim}│${c.reset}  ${c.purple}${data.user.modelName}${c.reset}`;
  }
  lines.push(header);

  // Separator
  lines.push(`${c.dim}─────────────────────────────────────────────────────────────────${c.reset}`);

  // Line 1: DDD Domains + Flash Attention
  const domainBar = generateDomainBar(data.domains.completed, data.domains.inProgress, data.domains.total);
  let line1 = `${c.brightCyan}🏗️  DDD Domains${c.reset}    ${domainBar}  ${c.brightGreen}${data.domains.completed}${c.reset}`;
  if (data.domains.inProgress > 0) {
    line1 += `+${c.yellow}${data.domains.inProgress}${c.reset}`;
  }
  line1 += `/${c.brightWhite}${data.domains.total}${c.reset}`;
  line1 += `    ${c.brightYellow}⚡ 1.0x${c.reset} ${c.dim}→${c.reset} ${c.brightYellow}${CONFIG.flashAttentionTarget}${c.reset}`;
  lines.push(line1);

  // Line 2: Agent Fleet + Security + Intelligence + Context
  const agentIndicator = data.agents.v3QeAgents > 0 ? `${c.brightGreen}◉${c.reset}` : `${c.dim}○${c.reset}`;
  const agentColor = colorByThreshold(data.agents.v3QeAgents, [20, 5, 0], [c.brightGreen, c.yellow, c.dim]);

  const cveIcon = data.cve.unfixed > 0 ? '🔴' : data.cve.total > 0 ? '🟢' : '⚪';
  const cveColor = data.cve.unfixed > 0 ? c.brightRed : c.brightGreen;

  const intelColor = colorByThreshold(data.learning.intelligencePct, [50, 25, 1], [c.brightGreen, c.brightYellow, c.yellow]);
  const ctxColor = colorByThreshold(100 - data.context.pct, [50, 25, 0], [c.brightGreen, c.brightYellow, c.brightRed]);

  let line2 = `${c.brightYellow}🤖 V3-QE Fleet${c.reset}  ${agentIndicator}[${agentColor}${padLeft(data.agents.v3QeAgents, 2)}${c.reset}/${c.brightWhite}${CONFIG.v3QeTarget}${c.reset}]`;
  line2 += `  ${c.brightPurple}👥${c.reset}${c.white}${data.agents.runningAgents}${c.reset}`;
  line2 += `    ${cveColor}${cveIcon} CVE ${data.cve.fixed}/${data.cve.total}${c.reset}`;
  line2 += `    ${intelColor}🧠 ${padLeft(data.learning.intelligencePct, 3)}%${c.reset}`;
  line2 += `    ${ctxColor}📂 ${padLeft(data.context.pct, 3)}%${c.reset}`;
  lines.push(line2);

  // Line 3: Learning Status
  const modeIndicator = data.learning.mode === 'continuous' ? `${c.brightGreen}●` :
                        data.learning.mode === 'scheduled' ? `${c.yellow}◐` : `${c.dim}○`;
  const transferIndicator = data.learning.transfers > 10 ? `${c.brightGreen}●` :
                            data.learning.transfers > 0 ? `${c.yellow}◐` : `${c.dim}○`;
  const dbSourceIndicator = data.learning.dbSource === 'v3' ? `${c.brightCyan}v3` :
                            data.learning.dbSource === 'root' ? `${c.yellow}root` : `${c.dim}none`;

  let line3 = `${c.brightPurple}🎓 Learning${c.reset}     ${c.cyan}Patterns${c.reset} ${c.white}${padLeft(data.learning.totalPatterns, 4)}${c.reset}`;
  line3 += `  ${c.dim}│${c.reset}  ${c.cyan}Exp${c.reset} ${c.white}${padLeft(data.learning.experiences, 4)}${c.reset}`;
  line3 += `  ${c.dim}│${c.reset}  ${c.cyan}Mode${c.reset} ${modeIndicator}${data.learning.mode}${c.reset}`;
  line3 += `  ${c.dim}│${c.reset}  ${c.cyan}Transfer${c.reset} ${transferIndicator}${data.learning.transfers}${c.reset}`;
  line3 += `  ${c.dim}│${c.reset}  ${c.cyan}DB${c.reset} ${dbSourceIndicator}${c.reset}`;
  lines.push(line3);

  // Line 4: Architecture Status
  const adrStatus = data.arch.adrCount >= 20 ? `${c.brightGreen}●${data.arch.adrCount}` :
                    data.arch.adrCount >= 10 ? `${c.yellow}◐${data.arch.adrCount}` : `${c.dim}○${data.arch.adrCount}`;
  const hooksStatus = data.arch.hooksCount >= 2 ? `${c.brightGreen}●${data.arch.hooksCount}` :
                      data.arch.hooksCount >= 1 ? `${c.yellow}◐${data.arch.hooksCount}` : `${c.dim}○`;
  const dbStatus = data.arch.agentDbSize ? `${c.brightGreen}●${data.arch.agentDbSize}` : `${c.dim}○`;

  let line4 = `${c.brightPurple}🔧 Architecture${c.reset}    ${c.cyan}ADR${c.reset} ${adrStatus}${c.reset}`;
  line4 += `  ${c.dim}│${c.reset}  ${c.cyan}Hooks${c.reset} ${hooksStatus}${c.reset}`;
  line4 += `  ${c.dim}│${c.reset}  ${c.cyan}AgentDB${c.reset} ${dbStatus}${c.reset}`;

  if (data.tests.unit > 0 || data.tests.integration > 0) {
    line4 += `  ${c.dim}│${c.reset}  ${c.cyan}Tests${c.reset} ${c.brightGreen}U${c.white}${data.tests.unit}${c.reset}/${c.brightCyan}I${c.white}${data.tests.integration}${c.reset}`;
  }
  lines.push(line4);

  // Footer
  lines.push(`${c.dim}─────────────────────────────────────────────────────────────────${c.reset}`);

  return lines.join('\n');
}

function generateJSON(data) {
  return {
    user: data.user,
    domains: data.domains,
    agents: data.agents,
    learning: {
      ...data.learning,
      dbSource: data.learning.dbSource,
    },
    security: data.cve,
    context: data.context,
    architecture: data.arch,
    tests: data.tests,
    coverage: data.coverage,
    performance: {
      flashAttentionTarget: CONFIG.flashAttentionTarget,
      searchImprovement: '150x-12,500x',
      memoryReduction: '50-75%',
    },
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

function main() {
  const projectDir = process.cwd();
  const claudeInput = getClaudeCodeInput();

  // Collect all data
  const data = {
    user: getUserInfo(claudeInput),
    domains: getDomainProgress(projectDir),
    tests: getTestCounts(projectDir),
    learning: getLearningMetrics(projectDir),
    cve: getCveStatus(projectDir),
    agents: getAgentCounts(projectDir, claudeInput),
    context: { pct: getContextUsage(claudeInput) },
    arch: getArchitectureMetrics(projectDir),
    coverage: getCoverage(projectDir),
  };

  // Output
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(generateJSON(data), null, 2));
  } else if (process.argv.includes('--compact')) {
    console.log(JSON.stringify(generateJSON(data)));
  } else {
    console.log(generateStatusline(data));
  }
}

main();
