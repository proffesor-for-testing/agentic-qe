/**
 * Shell Completions for AQE CLI
 * ADR-041: Shell Completions for Enhanced Developer Experience
 * ADR-042: Version-Agnostic Naming Convention
 *
 * Provides intelligent tab-completion for:
 * - Command names and subcommands
 * - Domain names (test-generation, coverage-analysis, etc.)
 * - Agent types (qe-test-architect, qe-coverage-specialist, etc.)
 * - Common flags and options
 *
 * Supported shells: Bash, Zsh, Fish, PowerShell
 */

// ============================================================================
// Completion Data
// ============================================================================

/**
 * All 12 DDD bounded context domains
 */
export const DOMAINS = [
  'test-generation',
  'test-execution',
  'coverage-analysis',
  'quality-assessment',
  'defect-intelligence',
  'requirements-validation',
  'code-intelligence',
  'security-compliance',
  'contract-testing',
  'visual-accessibility',
  'chaos-resilience',
  'learning-optimization',
] as const;

/**
 * QE Agents - Version-agnostic names (ADR-042)
 * Note: v3-qe-* prefixed names are deprecated but still supported via aliases
 */
export const QE_AGENTS = [
  // Core QE Agents
  'qe-tdd-specialist',
  'qe-test-architect',
  'qe-parallel-executor',
  'qe-flaky-hunter',
  'qe-retry-handler',
  'qe-coverage-specialist',
  'qe-gap-detector',
  'qe-quality-gate',
  'qe-deployment-advisor',
  'qe-code-complexity',
  'qe-qx-partner',
  'qe-security-scanner',
  'qe-security-auditor',
  'qe-contract-validator',
  'qe-integration-tester',
  'qe-graphql-tester',
  'qe-visual-tester',
  'qe-accessibility-auditor',
  'qe-responsive-tester',
  'qe-performance-tester',
  'qe-load-tester',
  'qe-chaos-engineer',
  'qe-code-intelligence',
  'qe-dependency-mapper',
  'qe-kg-builder',
  'qe-requirements-validator',
  'qe-bdd-generator',
  'qe-defect-predictor',
  'qe-root-cause-analyzer',
  'qe-regression-analyzer',
  'qe-impact-analyzer',
  'qe-risk-assessor',
  'qe-learning-coordinator',
  'qe-pattern-learner',
  'qe-transfer-specialist',
  'qe-metrics-optimizer',
  'qe-fleet-commander',
  'qe-queen-coordinator',
  'qe-property-tester',
  'qe-mutation-tester',
  // QE Subagents
  'qe-tdd-red',
  'qe-tdd-green',
  'qe-tdd-refactor',
  'qe-code-reviewer',
  'qe-integration-reviewer',
  'qe-performance-reviewer',
  'qe-security-reviewer',
] as const;

/**
 * General and specialized agent types
 */
export const OTHER_AGENTS = [
  // General agents
  'tester',
  'reviewer',
  'security-auditor',
  'security-architect',
  'performance-engineer',
  'code-analyzer',
  'cicd-engineer',
  // V3 Specialized
  'reasoningbank-learner',
  'adr-architect',
  'ddd-domain-expert',
  'v3-integration-architect',
  'memory-specialist',
  'claims-authorizer',
  'sparc-orchestrator',
  'sona-learning-optimizer',
  'safla-neural',
  'production-validator',
  'tdd-london-swarm',
  // Swarm agents
  'queen-coordinator',
  'swarm-memory-manager',
  'worker-specialist',
  'collective-intelligence-coordinator',
  'scout-explorer',
  'adaptive-coordinator',
  'mesh-coordinator',
  'hierarchical-coordinator',
  // Consensus agents
  'consensus-coordinator',
  'byzantine-coordinator',
  'raft-manager',
  'crdt-synchronizer',
  // n8n agents
  'n8n-workflow-executor',
  'n8n-unit-tester',
  'n8n-integration-test',
  'n8n-trigger-test',
  'n8n-security-auditor',
] as const;

/**
 * All agent types combined
 */
export const ALL_AGENTS = [...QE_AGENTS, ...OTHER_AGENTS] as const;

/**
 * CLI Commands and their subcommands
 */
export const COMMANDS = {
  // Main commands
  init: {
    description: 'Initialize the AQE v3 system',
    options: ['--wizard', '--auto', '--minimal', '--domains', '--max-agents', '--memory', '--lazy', '--skip-patterns'],
  },
  status: {
    description: 'Show system status',
    options: ['-v', '--verbose'],
  },
  health: {
    description: 'Check system health',
    options: ['-d', '--domain'],
  },
  // Task commands
  task: {
    description: 'Manage QE tasks',
    subcommands: {
      submit: { options: ['-p', '--priority', '-d', '--domain', '-t', '--timeout', '--payload'] },
      list: { options: ['-s', '--status', '-p', '--priority', '-d', '--domain'] },
      cancel: { options: [] },
      status: { options: [] },
    },
  },
  // Agent commands
  agent: {
    description: 'Manage QE agents',
    subcommands: {
      list: { options: ['-d', '--domain', '-s', '--status'] },
      spawn: { options: ['-t', '--type', '-c', '--capabilities'] },
    },
  },
  // Domain commands
  domain: {
    description: 'Domain operations',
    subcommands: {
      list: { options: [] },
      health: { options: [] },
    },
  },
  // Protocol commands
  protocol: {
    description: 'Execute coordination protocols',
    subcommands: {
      run: { options: ['--params'] },
    },
  },
  // Shortcut commands
  test: {
    description: 'Test generation and execution',
    options: ['-f', '--framework', '-t', '--type'],
  },
  coverage: {
    description: 'Coverage analysis',
    options: ['--risk', '--gaps'],
  },
  quality: {
    description: 'Quality assessment',
    options: ['--gate'],
  },
  security: {
    description: 'Security scanning',
    options: ['--sast', '--dast', '--compliance', '-t', '--target'],
  },
  code: {
    description: 'Code intelligence',
    options: ['--depth', '--include-tests'],
  },
  migrate: {
    description: 'V2 to V3 migration',
    options: ['--dry-run', '--backup', '--skip-memory', '--skip-patterns', '--skip-config', '--force'],
  },
  // Completions command (meta)
  completions: {
    description: 'Generate shell completions',
    subcommands: {
      bash: { options: [] },
      zsh: { options: [] },
      fish: { options: [] },
      powershell: { options: [] },
      install: { options: ['--shell'] },
    },
  },
} as const;

/**
 * Task types for completion
 */
export const TASK_TYPES = [
  'generate-tests',
  'execute-tests',
  'analyze-coverage',
  'assess-quality',
  'predict-defects',
  'validate-requirements',
  'analyze-code',
  'scan-security',
  'validate-contracts',
  'test-accessibility',
  'chaos-test',
  'optimize-learning',
] as const;

/**
 * Priority levels
 */
export const PRIORITIES = ['p0', 'p1', 'p2', 'p3'] as const;

/**
 * Task statuses
 */
export const STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const;

/**
 * Test frameworks
 */
export const FRAMEWORKS = ['jest', 'vitest', 'pytest', 'junit', 'playwright', 'cypress', 'go-test'] as const;

/**
 * Test types
 */
export const TEST_TYPES = ['unit', 'integration', 'e2e'] as const;

/**
 * Memory backends
 */
export const MEMORY_BACKENDS = ['sqlite', 'agentdb', 'hybrid'] as const;

// ============================================================================
// Bash Completion Generator
// ============================================================================

/**
 * Generate Bash completion script
 */
export function generateBashCompletion(): string {
  const script = `#!/bin/bash
# AQE CLI Bash Completion Script
# Generated by aqe completions bash
# ADR-041: Shell Completions for Enhanced Developer Experience
# ADR-042: Version-Agnostic Naming Convention

# Helper function to complete test files (*.test.ts, *.spec.ts, *.test.js, etc.)
_aqe_complete_test_files() {
    local cur="\$1"
    local IFS=$'\\n'
    local files=()

    # Complete test files with common test file patterns
    # Use find for more reliable glob matching across directories
    if [[ -z "\$cur" || "\$cur" == "." ]]; then
        # No prefix - search from current directory
        while IFS= read -r file; do
            files+=("\$file")
        done < <(find . -maxdepth 3 -type f \\( -name "*.test.ts" -o -name "*.spec.ts" -o -name "*.test.js" -o -name "*.spec.js" -o -name "*.test.tsx" -o -name "*.spec.tsx" \\) 2>/dev/null | head -30)
    else
        # Has prefix - use compgen with glob patterns
        files+=(\$(compgen -f -X '!*.test.ts' -- "\$cur" 2>/dev/null))
        files+=(\$(compgen -f -X '!*.spec.ts' -- "\$cur" 2>/dev/null))
        files+=(\$(compgen -f -X '!*.test.js' -- "\$cur" 2>/dev/null))
        files+=(\$(compgen -f -X '!*.spec.js' -- "\$cur" 2>/dev/null))
        files+=(\$(compgen -f -X '!*.test.tsx' -- "\$cur" 2>/dev/null))
        files+=(\$(compgen -f -X '!*.spec.tsx' -- "\$cur" 2>/dev/null))
    fi

    # Also include directories for navigation
    COMPREPLY=(\$(compgen -d -- "\$cur"))

    # Add test files to completions
    for file in "\${files[@]}"; do
        [[ -n "\$file" ]] && COMPREPLY+=("\$file")
    done
}

# Helper function to complete directories
_aqe_complete_directories() {
    local cur="\$1"
    COMPREPLY=( \$(compgen -d -- "$cur") )
}

# Main completion function (version-agnostic name per ADR-042)
_aqe_completions() {
    local cur prev words cword
    _init_completion || return

    local commands="init status health task agent domain protocol test coverage quality security code migrate completions"
    local task_subcmds="submit list cancel status"
    local agent_subcmds="list spawn"
    local domain_subcmds="list health"
    local protocol_subcmds="run"
    local completions_subcmds="bash zsh fish powershell install"
    local code_actions="index search impact deps"
    local test_actions="generate execute"

    # Domains
    local domains="${DOMAINS.join(' ')}"

    # Agent types (qe-* per ADR-042)
    local qe_agents="${QE_AGENTS.join(' ')}"
    local other_agents="${OTHER_AGENTS.join(' ')}"
    local all_agents="$qe_agents $other_agents"

    # Task types
    local task_types="${TASK_TYPES.join(' ')}"

    # Priorities
    local priorities="${PRIORITIES.join(' ')}"

    # Statuses
    local statuses="${STATUSES.join(' ')}"

    # Frameworks
    local frameworks="${FRAMEWORKS.join(' ')}"

    # Test types
    local test_types="${TEST_TYPES.join(' ')}"

    # Memory backends
    local memory_backends="${MEMORY_BACKENDS.join(' ')}"

    case "\${words[1]}" in
        init)
            case "$prev" in
                --domains|-d)
                    COMPREPLY=( $(compgen -W "$domains all" -- "$cur") )
                    return
                    ;;
                --memory|-m)
                    COMPREPLY=( $(compgen -W "$memory_backends" -- "$cur") )
                    return
                    ;;
                --max-agents)
                    COMPREPLY=( $(compgen -W "5 10 15 20 25 30 50" -- "$cur") )
                    return
                    ;;
            esac
            COMPREPLY=( $(compgen -W "--wizard --auto --minimal --domains --max-agents --memory --lazy --skip-patterns" -- "$cur") )
            return
            ;;
        status)
            COMPREPLY=( $(compgen -W "-v --verbose" -- "$cur") )
            return
            ;;
        health)
            case "$prev" in
                --domain|-d)
                    COMPREPLY=( $(compgen -W "$domains" -- "$cur") )
                    return
                    ;;
            esac
            COMPREPLY=( $(compgen -W "-d --domain" -- "$cur") )
            return
            ;;
        task)
            case "\${words[2]}" in
                submit)
                    case "$prev" in
                        --priority|-p)
                            COMPREPLY=( $(compgen -W "$priorities" -- "$cur") )
                            return
                            ;;
                        --domain|-d)
                            COMPREPLY=( $(compgen -W "$domains" -- "$cur") )
                            return
                            ;;
                        submit)
                            COMPREPLY=( $(compgen -W "$task_types" -- "$cur") )
                            return
                            ;;
                    esac
                    COMPREPLY=( $(compgen -W "-p --priority -d --domain -t --timeout --payload" -- "$cur") )
                    return
                    ;;
                list)
                    case "$prev" in
                        --status|-s)
                            COMPREPLY=( $(compgen -W "$statuses" -- "$cur") )
                            return
                            ;;
                        --priority|-p)
                            COMPREPLY=( $(compgen -W "$priorities" -- "$cur") )
                            return
                            ;;
                        --domain|-d)
                            COMPREPLY=( $(compgen -W "$domains" -- "$cur") )
                            return
                            ;;
                    esac
                    COMPREPLY=( $(compgen -W "-s --status -p --priority -d --domain" -- "$cur") )
                    return
                    ;;
                cancel|status)
                    # These need a task ID - no completion
                    return
                    ;;
                *)
                    COMPREPLY=( $(compgen -W "$task_subcmds" -- "$cur") )
                    return
                    ;;
            esac
            ;;
        agent)
            case "\${words[2]}" in
                list)
                    case "$prev" in
                        --domain|-d)
                            COMPREPLY=( $(compgen -W "$domains" -- "$cur") )
                            return
                            ;;
                        --status|-s)
                            COMPREPLY=( $(compgen -W "active idle failed" -- "$cur") )
                            return
                            ;;
                    esac
                    COMPREPLY=( $(compgen -W "-d --domain -s --status" -- "$cur") )
                    return
                    ;;
                spawn)
                    case "$prev" in
                        --type|-t)
                            # Show all agent types with v3-qe- prefix highlighted
                            COMPREPLY=( $(compgen -W "$all_agents" -- "$cur") )
                            return
                            ;;
                        spawn)
                            # Domain argument
                            COMPREPLY=( $(compgen -W "$domains" -- "$cur") )
                            return
                            ;;
                    esac
                    COMPREPLY=( $(compgen -W "-t --type -c --capabilities" -- "$cur") )
                    return
                    ;;
                *)
                    COMPREPLY=( $(compgen -W "$agent_subcmds" -- "$cur") )
                    return
                    ;;
            esac
            ;;
        domain)
            case "\${words[2]}" in
                health)
                    if [[ $cword -eq 3 ]]; then
                        COMPREPLY=( $(compgen -W "$domains" -- "$cur") )
                        return
                    fi
                    ;;
                *)
                    COMPREPLY=( $(compgen -W "$domain_subcmds" -- "$cur") )
                    return
                    ;;
            esac
            ;;
        protocol)
            case "\${words[2]}" in
                run)
                    COMPREPLY=( $(compgen -W "--params" -- "$cur") )
                    return
                    ;;
                *)
                    COMPREPLY=( $(compgen -W "$protocol_subcmds" -- "$cur") )
                    return
                    ;;
            esac
            ;;
        test)
            case "\${words[2]}" in
                generate)
                    case "$prev" in
                        --framework|-f)
                            COMPREPLY=( $(compgen -W "$frameworks" -- "$cur") )
                            return
                            ;;
                        --type|-t)
                            COMPREPLY=( $(compgen -W "$test_types" -- "$cur") )
                            return
                            ;;
                        --file)
                            # Complete test files for --file argument
                            _aqe_complete_test_files "$cur"
                            return
                            ;;
                    esac
                    if [[ "$cur" != -* ]]; then
                        # Positional argument - suggest directories for source files
                        _aqe_complete_directories "$cur"
                        return
                    fi
                    COMPREPLY=( $(compgen -W "-f --framework -t --type --file" -- "$cur") )
                    return
                    ;;
                execute)
                    case "$prev" in
                        --framework|-f)
                            COMPREPLY=( $(compgen -W "$frameworks" -- "$cur") )
                            return
                            ;;
                        --type|-t)
                            COMPREPLY=( $(compgen -W "$test_types" -- "$cur") )
                            return
                            ;;
                        --file)
                            # Complete test files for --file argument
                            _aqe_complete_test_files "$cur"
                            return
                            ;;
                    esac
                    if [[ "$cur" != -* && $cword -eq 3 ]]; then
                        # First positional argument after 'test execute' - suggest test files
                        _aqe_complete_test_files "$cur"
                        return
                    fi
                    COMPREPLY=( $(compgen -W "-f --framework -t --type --file --parallel --watch" -- "$cur") )
                    return
                    ;;
                *)
                    COMPREPLY=( $(compgen -W "$test_actions" -- "$cur") )
                    return
                    ;;
            esac
            ;;
        coverage)
            case "$prev" in
                --target|-t|coverage)
                    # Complete directories for coverage target
                    _aqe_complete_directories "$cur"
                    return
                    ;;
            esac
            if [[ "$cur" != -* && $cword -eq 2 ]]; then
                # First positional argument - suggest directories
                _aqe_complete_directories "$cur"
                return
            fi
            COMPREPLY=( $(compgen -W "--risk --gaps -t --target" -- "$cur") )
            return
            ;;
        quality)
            COMPREPLY=( $(compgen -W "--gate" -- "$cur") )
            return
            ;;
        security)
            case "$prev" in
                --compliance)
                    COMPREPLY=( $(compgen -W "gdpr hipaa soc2 pci-dss ccpa" -- "$cur") )
                    return
                    ;;
                --target|-t)
                    # Complete directories for security scan target
                    _aqe_complete_directories "$cur"
                    return
                    ;;
            esac
            if [[ "$cur" != -* && $cword -eq 2 ]]; then
                # First positional argument - suggest directories
                _aqe_complete_directories "$cur"
                return
            fi
            COMPREPLY=( $(compgen -W "--sast --dast --compliance -t --target" -- "$cur") )
            return
            ;;
        code)
            case "\${words[2]}" in
                index|search|impact|deps)
                    case "$prev" in
                        --depth)
                            COMPREPLY=( $(compgen -W "1 2 3 4 5" -- "$cur") )
                            return
                            ;;
                    esac
                    if [[ "$cur" != -* && $cword -eq 3 ]]; then
                        # Second positional after action - suggest directories
                        _aqe_complete_directories "$cur"
                        return
                    fi
                    COMPREPLY=( $(compgen -W "--depth --include-tests" -- "$cur") )
                    return
                    ;;
                *)
                    COMPREPLY=( $(compgen -W "$code_actions" -- "$cur") )
                    return
                    ;;
            esac
            ;;
        migrate)
            COMPREPLY=( $(compgen -W "--dry-run --backup --skip-memory --skip-patterns --skip-config --force" -- "$cur") )
            return
            ;;
        completions)
            case "\${words[2]}" in
                install)
                    case "$prev" in
                        --shell)
                            COMPREPLY=( $(compgen -W "bash zsh fish powershell" -- "$cur") )
                            return
                            ;;
                    esac
                    COMPREPLY=( $(compgen -W "--shell" -- "$cur") )
                    return
                    ;;
                *)
                    COMPREPLY=( $(compgen -W "$completions_subcmds" -- "$cur") )
                    return
                    ;;
            esac
            ;;
        *)
            COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
            return
            ;;
    esac
}

# Register completions (version-agnostic name per ADR-042)
complete -F _aqe_completions aqe

# Enable for npm/npx invocations as well
complete -F _aqe_completions "npx aqe"
`;

  return script;
}

// ============================================================================
// Zsh Completion Generator
// ============================================================================

/**
 * Generate Zsh completion script
 */
export function generateZshCompletion(): string {
  const script = `#compdef aqe
# AQE CLI Zsh Completion Script
# Generated by aqe completions zsh
# ADR-041: Shell Completions for Enhanced Developer Experience
# ADR-042: Version-Agnostic Naming Convention

# Main completion function (version-agnostic name per ADR-042)
_aqe() {
    local -a commands
    local -a domains
    local -a agents
    local -a qe_agents
    local -a task_types
    local -a priorities
    local -a statuses
    local -a frameworks
    local -a test_types
    local -a memory_backends
    local -a code_actions
    local -a test_actions

    commands=(
        'init:Initialize the AQE system'
        'status:Show system status'
        'health:Check system health'
        'task:Manage QE tasks'
        'agent:Manage QE agents'
        'domain:Domain operations'
        'protocol:Execute coordination protocols'
        'test:Test generation and execution'
        'coverage:Coverage analysis'
        'quality:Quality assessment'
        'security:Security scanning'
        'code:Code intelligence'
        'migrate:V2 to V3 migration'
        'completions:Generate shell completions'
    )

    domains=(
        ${DOMAINS.map(d => `'${d}:${d.replace(/-/g, ' ')} domain'`).join('\n        ')}
    )

    qe_agents=(
        ${QE_AGENTS.map(a => `'${a}'`).join('\n        ')}
    )

    agents=(
        \${qe_agents}
        ${OTHER_AGENTS.map(a => `'${a}'`).join('\n        ')}
    )

    task_types=(
        ${TASK_TYPES.map(t => `'${t}:${t.replace(/-/g, ' ')}'`).join('\n        ')}
    )

    priorities=(
        'p0:Critical priority'
        'p1:High priority'
        'p2:Medium priority'
        'p3:Low priority'
    )

    statuses=(
        'pending:Task is pending'
        'running:Task is running'
        'completed:Task completed successfully'
        'failed:Task failed'
        'cancelled:Task was cancelled'
    )

    frameworks=(
        ${FRAMEWORKS.map(f => `'${f}'`).join('\n        ')}
    )

    test_types=(
        'unit:Unit tests'
        'integration:Integration tests'
        'e2e:End-to-end tests'
    )

    memory_backends=(
        'sqlite:SQLite backend'
        'agentdb:AgentDB backend'
        'hybrid:Hybrid backend'
    )

    code_actions=(
        'index:Index codebase'
        'search:Search code'
        'impact:Analyze impact'
        'deps:Map dependencies'
    )

    test_actions=(
        'generate:Generate tests'
        'execute:Execute tests'
    )

    _arguments -C \\
        '1:command:->command' \\
        '*::arg:->args'

    case "$state" in
        command)
            _describe -t commands 'aqe commands' commands
            ;;
        args)
            case "$words[1]" in
                init)
                    _arguments \\
                        '--wizard[Run interactive setup wizard]' \\
                        '--auto[Auto-configure based on project analysis]' \\
                        '--minimal[Minimal configuration]' \\
                        '(-d --domains)'{-d,--domains}'[Domains to enable]:domains:_values -s , domain \${domains}' \\
                        '--max-agents[Maximum concurrent agents]:number:(5 10 15 20 25 30 50)' \\
                        '(-m --memory)'{-m,--memory}'[Memory backend]:backend:_values backend \${memory_backends}' \\
                        '--lazy[Enable lazy loading]' \\
                        '--skip-patterns[Skip loading pre-trained patterns]'
                    ;;
                status)
                    _arguments \\
                        '(-v --verbose)'{-v,--verbose}'[Show detailed status]'
                    ;;
                health)
                    _arguments \\
                        '(-d --domain)'{-d,--domain}'[Check specific domain]:domain:_values domain \${domains}'
                    ;;
                task)
                    local -a task_commands
                    task_commands=(
                        'submit:Submit a task'
                        'list:List all tasks'
                        'cancel:Cancel a task'
                        'status:Get task status'
                    )
                    _arguments -C \\
                        '1:task command:->task_cmd' \\
                        '*::arg:->task_args'
                    case "$state" in
                        task_cmd)
                            _describe -t commands 'task commands' task_commands
                            ;;
                        task_args)
                            case "$words[1]" in
                                submit)
                                    _arguments \\
                                        '1:task type:_values type \${task_types}' \\
                                        '(-p --priority)'{-p,--priority}'[Task priority]:priority:_values priority \${priorities}' \\
                                        '(-d --domain)'{-d,--domain}'[Target domain]:domain:_values domain \${domains}' \\
                                        '(-t --timeout)'{-t,--timeout}'[Task timeout in ms]:timeout:' \\
                                        '--payload[Task payload as JSON]:json:'
                                    ;;
                                list)
                                    _arguments \\
                                        '(-s --status)'{-s,--status}'[Filter by status]:status:_values status \${statuses}' \\
                                        '(-p --priority)'{-p,--priority}'[Filter by priority]:priority:_values priority \${priorities}' \\
                                        '(-d --domain)'{-d,--domain}'[Filter by domain]:domain:_values domain \${domains}'
                                    ;;
                                cancel|status)
                                    _arguments \\
                                        '1:task ID:'
                                    ;;
                            esac
                            ;;
                    esac
                    ;;
                agent)
                    local -a agent_commands
                    agent_commands=(
                        'list:List all agents'
                        'spawn:Spawn an agent'
                    )
                    _arguments -C \\
                        '1:agent command:->agent_cmd' \\
                        '*::arg:->agent_args'
                    case "$state" in
                        agent_cmd)
                            _describe -t commands 'agent commands' agent_commands
                            ;;
                        agent_args)
                            case "$words[1]" in
                                list)
                                    _arguments \\
                                        '(-d --domain)'{-d,--domain}'[Filter by domain]:domain:_values domain \${domains}' \\
                                        '(-s --status)'{-s,--status}'[Filter by status]:status:(active idle failed)'
                                    ;;
                                spawn)
                                    _arguments \\
                                        '1:domain:_values domain \${domains}' \\
                                        '(-t --type)'{-t,--type}'[Agent type]:type:_values type \${agents}' \\
                                        '(-c --capabilities)'{-c,--capabilities}'[Capabilities]:capabilities:'
                                    ;;
                            esac
                            ;;
                    esac
                    ;;
                domain)
                    local -a domain_commands
                    domain_commands=(
                        'list:List all domains'
                        'health:Get domain health'
                    )
                    _arguments -C \\
                        '1:domain command:->domain_cmd' \\
                        '*::arg:->domain_args'
                    case "$state" in
                        domain_cmd)
                            _describe -t commands 'domain commands' domain_commands
                            ;;
                        domain_args)
                            case "$words[1]" in
                                health)
                                    _arguments \\
                                        '1:domain:_values domain \${domains}'
                                    ;;
                            esac
                            ;;
                    esac
                    ;;
                protocol)
                    local -a protocol_commands
                    protocol_commands=(
                        'run:Execute a protocol'
                    )
                    _arguments -C \\
                        '1:protocol command:->protocol_cmd' \\
                        '*::arg:->protocol_args'
                    case "$state" in
                        protocol_cmd)
                            _describe -t commands 'protocol commands' protocol_commands
                            ;;
                        protocol_args)
                            case "$words[1]" in
                                run)
                                    _arguments \\
                                        '1:protocol ID:' \\
                                        '--params[Protocol parameters as JSON]:json:'
                                    ;;
                            esac
                            ;;
                    esac
                    ;;
                test)
                    local -a test_file_patterns
                    test_file_patterns=('*.test.ts' '*.spec.ts' '*.test.js' '*.spec.js' '*.test.tsx' '*.spec.tsx')

                    _arguments -C \\
                        '1:action:_values action \${test_actions}' \\
                        '*:test pattern:_files -g "*.test.{ts,tsx,js,jsx}" -g "*.spec.{ts,tsx,js,jsx}"' \\
                        '(-f --framework)'{-f,--framework}'[Test framework]:framework:_values framework \${frameworks}' \\
                        '(-t --type)'{-t,--type}'[Test type]:type:_values type \${test_types}' \\
                        '--file[Test file pattern]:file:_files -g "*.test.{ts,tsx,js,jsx}" -g "*.spec.{ts,tsx,js,jsx}"' \\
                        '--parallel[Run tests in parallel]' \\
                        '--watch[Watch mode]'
                    ;;
                coverage)
                    _arguments \\
                        '1:target directory:_files -/' \\
                        '--risk[Include risk scoring]' \\
                        '--gaps[Detect coverage gaps]' \\
                        '(-t --target)'{-t,--target}'[Target directory]:target:_files -/'
                    ;;
                quality)
                    _arguments \\
                        '--gate[Run quality gate evaluation]'
                    ;;
                security)
                    _arguments \\
                        '1:target directory:_files -/' \\
                        '--sast[Run SAST scan]' \\
                        '--dast[Run DAST scan]' \\
                        '--compliance[Check compliance]:frameworks:_values -s , framework gdpr hipaa soc2 pci-dss ccpa' \\
                        '(-t --target)'{-t,--target}'[Target directory]:target:_files -/'
                    ;;
                code)
                    _arguments -C \\
                        '1:action:_values action \${code_actions}' \\
                        '2:target directory:_files -/' \\
                        '--depth[Analysis depth]:depth:(1 2 3 4 5)' \\
                        '--include-tests[Include test files]'
                    ;;
                migrate)
                    _arguments \\
                        '--dry-run[Preview migration without changes]' \\
                        '--backup[Create backup before migration]' \\
                        '--skip-memory[Skip memory database migration]' \\
                        '--skip-patterns[Skip pattern migration]' \\
                        '--skip-config[Skip configuration migration]' \\
                        '--force[Force migration even if v3 exists]'
                    ;;
                completions)
                    local -a completion_commands
                    completion_commands=(
                        'bash:Generate Bash completion script'
                        'zsh:Generate Zsh completion script'
                        'fish:Generate Fish completion script'
                        'powershell:Generate PowerShell completion script'
                        'install:Auto-install for current shell'
                    )
                    _arguments -C \\
                        '1:shell:->completion_cmd' \\
                        '*::arg:->completion_args'
                    case "$state" in
                        completion_cmd)
                            _describe -t commands 'completion targets' completion_commands
                            ;;
                        completion_args)
                            case "$words[1]" in
                                install)
                                    _arguments \\
                                        '--shell[Target shell]:shell:(bash zsh fish powershell)'
                                    ;;
                            esac
                            ;;
                    esac
                    ;;
            esac
            ;;
    esac
}

# Register with version-agnostic name
_aqe "$@"

# Backward compatibility alias (deprecated, use _aqe)
_aqe_v3() { _aqe "$@"; }
`;

  return script;
}

// ============================================================================
// Fish Completion Generator
// ============================================================================

/**
 * Generate Fish completion script
 */
export function generateFishCompletion(): string {
  const script = `# AQE CLI Fish Completion Script
# Generated by aqe completions fish
# ADR-041: Shell Completions for Enhanced Developer Experience
# ADR-042: Version-Agnostic Naming Convention

# Disable file completions by default
complete -c aqe -f

# Main commands
complete -c aqe -n "__fish_use_subcommand" -a "init" -d "Initialize the AQE system"
complete -c aqe -n "__fish_use_subcommand" -a "status" -d "Show system status"
complete -c aqe -n "__fish_use_subcommand" -a "health" -d "Check system health"
complete -c aqe -n "__fish_use_subcommand" -a "task" -d "Manage QE tasks"
complete -c aqe -n "__fish_use_subcommand" -a "agent" -d "Manage QE agents"
complete -c aqe -n "__fish_use_subcommand" -a "domain" -d "Domain operations"
complete -c aqe -n "__fish_use_subcommand" -a "protocol" -d "Execute coordination protocols"
complete -c aqe -n "__fish_use_subcommand" -a "test" -d "Test generation and execution"
complete -c aqe -n "__fish_use_subcommand" -a "coverage" -d "Coverage analysis"
complete -c aqe -n "__fish_use_subcommand" -a "quality" -d "Quality assessment"
complete -c aqe -n "__fish_use_subcommand" -a "security" -d "Security scanning"
complete -c aqe -n "__fish_use_subcommand" -a "code" -d "Code intelligence"
complete -c aqe -n "__fish_use_subcommand" -a "migrate" -d "V2 to V3 migration"
complete -c aqe -n "__fish_use_subcommand" -a "completions" -d "Generate shell completions"

# Domains list
set -l domains ${DOMAINS.join(' ')}

# QE Agents (version-agnostic names per ADR-042)
set -l qe_agents ${QE_AGENTS.join(' ')}

# Other agents
set -l other_agents ${OTHER_AGENTS.join(' ')}

# All agents
set -l all_agents $qe_agents $other_agents

# Task types
set -l task_types ${TASK_TYPES.join(' ')}

# Priorities
set -l priorities p0 p1 p2 p3

# Statuses
set -l statuses pending running completed failed cancelled

# Frameworks
set -l frameworks ${FRAMEWORKS.join(' ')}

# Test types
set -l test_types unit integration e2e

# Memory backends
set -l memory_backends sqlite agentdb hybrid

# Init command options
complete -c aqe -n "__fish_seen_subcommand_from init" -l wizard -d "Run interactive setup wizard"
complete -c aqe -n "__fish_seen_subcommand_from init" -l auto -d "Auto-configure based on project analysis"
complete -c aqe -n "__fish_seen_subcommand_from init" -l minimal -d "Minimal configuration"
complete -c aqe -n "__fish_seen_subcommand_from init" -s d -l domains -d "Domains to enable" -xa "$domains all"
complete -c aqe -n "__fish_seen_subcommand_from init" -l max-agents -d "Maximum concurrent agents" -xa "5 10 15 20 25 30 50"
complete -c aqe -n "__fish_seen_subcommand_from init" -s m -l memory -d "Memory backend" -xa "$memory_backends"
complete -c aqe -n "__fish_seen_subcommand_from init" -l lazy -d "Enable lazy loading"
complete -c aqe -n "__fish_seen_subcommand_from init" -l skip-patterns -d "Skip loading pre-trained patterns"

# Status command options
complete -c aqe -n "__fish_seen_subcommand_from status" -s v -l verbose -d "Show detailed status"

# Health command options
complete -c aqe -n "__fish_seen_subcommand_from health" -s d -l domain -d "Check specific domain" -xa "$domains"

# Task subcommands
complete -c aqe -n "__fish_seen_subcommand_from task; and not __fish_seen_subcommand_from submit list cancel status" -a "submit" -d "Submit a task"
complete -c aqe -n "__fish_seen_subcommand_from task; and not __fish_seen_subcommand_from submit list cancel status" -a "list" -d "List all tasks"
complete -c aqe -n "__fish_seen_subcommand_from task; and not __fish_seen_subcommand_from submit list cancel status" -a "cancel" -d "Cancel a task"
complete -c aqe -n "__fish_seen_subcommand_from task; and not __fish_seen_subcommand_from submit list cancel status" -a "status" -d "Get task status"

# Task submit options
complete -c aqe -n "__fish_seen_subcommand_from task; and __fish_seen_subcommand_from submit" -xa "$task_types"
complete -c aqe -n "__fish_seen_subcommand_from task; and __fish_seen_subcommand_from submit" -s p -l priority -d "Task priority" -xa "$priorities"
complete -c aqe -n "__fish_seen_subcommand_from task; and __fish_seen_subcommand_from submit" -s d -l domain -d "Target domain" -xa "$domains"
complete -c aqe -n "__fish_seen_subcommand_from task; and __fish_seen_subcommand_from submit" -s t -l timeout -d "Task timeout in ms"
complete -c aqe -n "__fish_seen_subcommand_from task; and __fish_seen_subcommand_from submit" -l payload -d "Task payload as JSON"

# Task list options
complete -c aqe -n "__fish_seen_subcommand_from task; and __fish_seen_subcommand_from list" -s s -l status -d "Filter by status" -xa "$statuses"
complete -c aqe -n "__fish_seen_subcommand_from task; and __fish_seen_subcommand_from list" -s p -l priority -d "Filter by priority" -xa "$priorities"
complete -c aqe -n "__fish_seen_subcommand_from task; and __fish_seen_subcommand_from list" -s d -l domain -d "Filter by domain" -xa "$domains"

# Agent subcommands
complete -c aqe -n "__fish_seen_subcommand_from agent; and not __fish_seen_subcommand_from list spawn" -a "list" -d "List all agents"
complete -c aqe -n "__fish_seen_subcommand_from agent; and not __fish_seen_subcommand_from list spawn" -a "spawn" -d "Spawn an agent"

# Agent list options
complete -c aqe -n "__fish_seen_subcommand_from agent; and __fish_seen_subcommand_from list" -s d -l domain -d "Filter by domain" -xa "$domains"
complete -c aqe -n "__fish_seen_subcommand_from agent; and __fish_seen_subcommand_from list" -s s -l status -d "Filter by status" -xa "active idle failed"

# Agent spawn options
complete -c aqe -n "__fish_seen_subcommand_from agent; and __fish_seen_subcommand_from spawn" -xa "$domains"
complete -c aqe -n "__fish_seen_subcommand_from agent; and __fish_seen_subcommand_from spawn" -s t -l type -d "Agent type" -xa "$all_agents"
complete -c aqe -n "__fish_seen_subcommand_from agent; and __fish_seen_subcommand_from spawn" -s c -l capabilities -d "Capabilities"

# Domain subcommands
complete -c aqe -n "__fish_seen_subcommand_from domain; and not __fish_seen_subcommand_from list health" -a "list" -d "List all domains"
complete -c aqe -n "__fish_seen_subcommand_from domain; and not __fish_seen_subcommand_from list health" -a "health" -d "Get domain health"

# Domain health argument
complete -c aqe -n "__fish_seen_subcommand_from domain; and __fish_seen_subcommand_from health" -xa "$domains"

# Protocol subcommands
complete -c aqe -n "__fish_seen_subcommand_from protocol; and not __fish_seen_subcommand_from run" -a "run" -d "Execute a protocol"
complete -c aqe -n "__fish_seen_subcommand_from protocol; and __fish_seen_subcommand_from run" -l params -d "Protocol parameters as JSON"

# Test command
complete -c aqe -n "__fish_seen_subcommand_from test; and not __fish_seen_subcommand_from generate execute" -a "generate" -d "Generate tests"
complete -c aqe -n "__fish_seen_subcommand_from test; and not __fish_seen_subcommand_from generate execute" -a "execute" -d "Execute tests"
complete -c aqe -n "__fish_seen_subcommand_from test" -s f -l framework -d "Test framework" -xa "$frameworks"
complete -c aqe -n "__fish_seen_subcommand_from test" -s t -l type -d "Test type" -xa "$test_types"
# File completion for test execute - enable full file completion (-F) plus suggest test files
complete -c aqe -n "__fish_seen_subcommand_from test; and __fish_seen_subcommand_from execute" -F
complete -c aqe -n "__fish_seen_subcommand_from test; and __fish_seen_subcommand_from execute" -xa "(find . -maxdepth 3 -type f \\( -name '*.test.ts' -o -name '*.spec.ts' -o -name '*.test.js' -o -name '*.spec.js' -o -name '*.test.tsx' -o -name '*.spec.tsx' \\) 2>/dev/null | head -20)"
complete -c aqe -n "__fish_seen_subcommand_from test; and __fish_seen_subcommand_from execute" -l file -d "Test file pattern" -F
complete -c aqe -n "__fish_seen_subcommand_from test; and __fish_seen_subcommand_from execute" -l parallel -d "Run tests in parallel"
complete -c aqe -n "__fish_seen_subcommand_from test; and __fish_seen_subcommand_from execute" -l watch -d "Watch mode"
# Directory completion for test generate
complete -c aqe -n "__fish_seen_subcommand_from test; and __fish_seen_subcommand_from generate" -xa "(__fish_complete_directories)"
complete -c aqe -n "__fish_seen_subcommand_from test; and __fish_seen_subcommand_from generate" -l file -d "Source file" -F

# Coverage command - directory completion for target and enable file completion
complete -c aqe -n "__fish_seen_subcommand_from coverage" -F
complete -c aqe -n "__fish_seen_subcommand_from coverage" -l risk -d "Include risk scoring"
complete -c aqe -n "__fish_seen_subcommand_from coverage" -l gaps -d "Detect coverage gaps"
complete -c aqe -n "__fish_seen_subcommand_from coverage" -s t -l target -d "Target directory" -xa "(__fish_complete_directories)"
complete -c aqe -n "__fish_seen_subcommand_from coverage" -xa "(__fish_complete_directories)"

# Quality command
complete -c aqe -n "__fish_seen_subcommand_from quality" -l gate -d "Run quality gate evaluation"

# Security command - directory completion for target and enable file completion
complete -c aqe -n "__fish_seen_subcommand_from security" -F
complete -c aqe -n "__fish_seen_subcommand_from security" -l sast -d "Run SAST scan"
complete -c aqe -n "__fish_seen_subcommand_from security" -l dast -d "Run DAST scan"
complete -c aqe -n "__fish_seen_subcommand_from security" -l compliance -d "Check compliance" -xa "gdpr hipaa soc2 pci-dss ccpa"
complete -c aqe -n "__fish_seen_subcommand_from security" -s t -l target -d "Target directory" -xa "(__fish_complete_directories)"
complete -c aqe -n "__fish_seen_subcommand_from security" -xa "(__fish_complete_directories)"

# Code command - directory completion for target
complete -c aqe -n "__fish_seen_subcommand_from code; and not __fish_seen_subcommand_from index search impact deps" -a "index" -d "Index codebase"
complete -c aqe -n "__fish_seen_subcommand_from code; and not __fish_seen_subcommand_from index search impact deps" -a "search" -d "Search code"
complete -c aqe -n "__fish_seen_subcommand_from code; and not __fish_seen_subcommand_from index search impact deps" -a "impact" -d "Analyze impact"
complete -c aqe -n "__fish_seen_subcommand_from code; and not __fish_seen_subcommand_from index search impact deps" -a "deps" -d "Map dependencies"
complete -c aqe -n "__fish_seen_subcommand_from code" -l depth -d "Analysis depth" -xa "1 2 3 4 5"
complete -c aqe -n "__fish_seen_subcommand_from code" -l include-tests -d "Include test files"
# Directory completion for code actions
complete -c aqe -n "__fish_seen_subcommand_from code; and __fish_seen_subcommand_from index search impact deps" -xa "(__fish_complete_directories)"

# Migrate command
complete -c aqe -n "__fish_seen_subcommand_from migrate" -l dry-run -d "Preview migration without changes"
complete -c aqe -n "__fish_seen_subcommand_from migrate" -l backup -d "Create backup before migration"
complete -c aqe -n "__fish_seen_subcommand_from migrate" -l skip-memory -d "Skip memory database migration"
complete -c aqe -n "__fish_seen_subcommand_from migrate" -l skip-patterns -d "Skip pattern migration"
complete -c aqe -n "__fish_seen_subcommand_from migrate" -l skip-config -d "Skip configuration migration"
complete -c aqe -n "__fish_seen_subcommand_from migrate" -l force -d "Force migration even if v3 exists"

# Completions command
complete -c aqe -n "__fish_seen_subcommand_from completions; and not __fish_seen_subcommand_from bash zsh fish powershell install" -a "bash" -d "Generate Bash completion script"
complete -c aqe -n "__fish_seen_subcommand_from completions; and not __fish_seen_subcommand_from bash zsh fish powershell install" -a "zsh" -d "Generate Zsh completion script"
complete -c aqe -n "__fish_seen_subcommand_from completions; and not __fish_seen_subcommand_from bash zsh fish powershell install" -a "fish" -d "Generate Fish completion script"
complete -c aqe -n "__fish_seen_subcommand_from completions; and not __fish_seen_subcommand_from bash zsh fish powershell install" -a "powershell" -d "Generate PowerShell completion script"
complete -c aqe -n "__fish_seen_subcommand_from completions; and not __fish_seen_subcommand_from bash zsh fish powershell install" -a "install" -d "Auto-install for current shell"
complete -c aqe -n "__fish_seen_subcommand_from completions; and __fish_seen_subcommand_from install" -l shell -d "Target shell" -xa "bash zsh fish powershell"
`;

  return script;
}

// ============================================================================
// PowerShell Completion Generator
// ============================================================================

/**
 * Generate PowerShell completion script
 */
export function generatePowerShellCompletion(): string {
  const script = `# AQE CLI PowerShell Completion Script
# Generated by aqe completions powershell
# ADR-041: Shell Completions for Enhanced Developer Experience
# ADR-042: Version-Agnostic Naming Convention

$script:AQE_DOMAINS = @(
    ${DOMAINS.map(d => `'${d}'`).join(',\n    ')}
)

# QE Agents (version-agnostic names per ADR-042)
$script:AQE_QE_AGENTS = @(
    ${QE_AGENTS.map(a => `'${a}'`).join(',\n    ')}
)

$script:AQE_OTHER_AGENTS = @(
    ${OTHER_AGENTS.map(a => `'${a}'`).join(',\n    ')}
)

$script:AQE_ALL_AGENTS = $script:AQE_QE_AGENTS + $script:AQE_OTHER_AGENTS

$script:AQE_TASK_TYPES = @(
    ${TASK_TYPES.map(t => `'${t}'`).join(',\n    ')}
)

$script:AQE_PRIORITIES = @('p0', 'p1', 'p2', 'p3')
$script:AQE_STATUSES = @('pending', 'running', 'completed', 'failed', 'cancelled')
$script:AQE_FRAMEWORKS = @(${FRAMEWORKS.map(f => `'${f}'`).join(', ')})
$script:AQE_TEST_TYPES = @('unit', 'integration', 'e2e')
$script:AQE_MEMORY_BACKENDS = @('sqlite', 'agentdb', 'hybrid')

$script:AQE_COMMANDS = @{
    'init' = 'Initialize the AQE system'
    'status' = 'Show system status'
    'health' = 'Check system health'
    'task' = 'Manage QE tasks'
    'agent' = 'Manage QE agents'
    'domain' = 'Domain operations'
    'protocol' = 'Execute coordination protocols'
    'test' = 'Test generation and execution'
    'coverage' = 'Coverage analysis'
    'quality' = 'Quality assessment'
    'security' = 'Security scanning'
    'code' = 'Code intelligence'
    'migrate' = 'V2 to V3 migration'
    'completions' = 'Generate shell completions'
}

Register-ArgumentCompleter -Native -CommandName 'aqe' -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $commandElements = $commandAst.CommandElements
    $command = @()

    for ($i = 1; $i -lt $commandElements.Count; $i++) {
        $element = $commandElements[$i]
        if ($element.Extent.StartOffset -lt $cursorPosition -and
            $element.Extent.EndOffset -le $cursorPosition) {
            $command += $element.Extent.Text
        }
    }

    $completions = @()

    # Helper function to create completion results
    function New-Completion {
        param($Name, $Description, $Type = 'ParameterValue')
        [System.Management.Automation.CompletionResult]::new(
            $Name,
            $Name,
            $Type,
            $Description
        )
    }

    if ($command.Count -eq 0) {
        # Complete main commands
        $script:AQE_COMMANDS.GetEnumerator() | Where-Object { $_.Key -like "$wordToComplete*" } | ForEach-Object {
            $completions += New-Completion $_.Key $_.Value 'Command'
        }
    }
    elseif ($command.Count -ge 1) {
        $mainCmd = $command[0]

        switch ($mainCmd) {
            'init' {
                if ($wordToComplete -like '-*' -or $wordToComplete -eq '') {
                    $completions += New-Completion '--wizard' 'Run interactive setup wizard'
                    $completions += New-Completion '--auto' 'Auto-configure based on project analysis'
                    $completions += New-Completion '--minimal' 'Minimal configuration'
                    $completions += New-Completion '--domains' 'Domains to enable'
                    $completions += New-Completion '--max-agents' 'Maximum concurrent agents'
                    $completions += New-Completion '--memory' 'Memory backend'
                    $completions += New-Completion '--lazy' 'Enable lazy loading'
                    $completions += New-Completion '--skip-patterns' 'Skip loading pre-trained patterns'
                }
                elseif ($command[-1] -eq '--domains' -or $command[-1] -eq '-d') {
                    $script:AQE_DOMAINS | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        $completions += New-Completion $_ "Enable $_ domain"
                    }
                    $completions += New-Completion 'all' 'Enable all domains'
                }
                elseif ($command[-1] -eq '--memory' -or $command[-1] -eq '-m') {
                    $script:AQE_MEMORY_BACKENDS | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        $completions += New-Completion $_ "$_ memory backend"
                    }
                }
                elseif ($command[-1] -eq '--max-agents') {
                    @(5, 10, 15, 20, 25, 30, 50) | ForEach-Object {
                        $completions += New-Completion $_.ToString() "$_ agents maximum"
                    }
                }
            }

            'status' {
                $completions += New-Completion '-v' 'Show detailed status'
                $completions += New-Completion '--verbose' 'Show detailed status'
            }

            'health' {
                if ($command[-1] -eq '--domain' -or $command[-1] -eq '-d') {
                    $script:AQE_DOMAINS | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        $completions += New-Completion $_ "Check $_ domain health"
                    }
                }
                else {
                    $completions += New-Completion '-d' 'Check specific domain'
                    $completions += New-Completion '--domain' 'Check specific domain'
                }
            }

            'task' {
                if ($command.Count -eq 1) {
                    $completions += New-Completion 'submit' 'Submit a task'
                    $completions += New-Completion 'list' 'List all tasks'
                    $completions += New-Completion 'cancel' 'Cancel a task'
                    $completions += New-Completion 'status' 'Get task status'
                }
                elseif ($command[1] -eq 'submit') {
                    if ($command[-1] -eq '--priority' -or $command[-1] -eq '-p') {
                        $script:AQE_PRIORITIES | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                            $completions += New-Completion $_ "$_ priority"
                        }
                    }
                    elseif ($command[-1] -eq '--domain' -or $command[-1] -eq '-d') {
                        $script:AQE_DOMAINS | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                            $completions += New-Completion $_ "Target $_ domain"
                        }
                    }
                    elseif ($command.Count -eq 2) {
                        $script:AQE_TASK_TYPES | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                            $completions += New-Completion $_ "$_ task type"
                        }
                    }
                    else {
                        $completions += New-Completion '-p' 'Task priority'
                        $completions += New-Completion '--priority' 'Task priority'
                        $completions += New-Completion '-d' 'Target domain'
                        $completions += New-Completion '--domain' 'Target domain'
                        $completions += New-Completion '-t' 'Task timeout'
                        $completions += New-Completion '--timeout' 'Task timeout'
                        $completions += New-Completion '--payload' 'Task payload as JSON'
                    }
                }
                elseif ($command[1] -eq 'list') {
                    if ($command[-1] -eq '--status' -or $command[-1] -eq '-s') {
                        $script:AQE_STATUSES | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                            $completions += New-Completion $_ "Filter by $_ status"
                        }
                    }
                    elseif ($command[-1] -eq '--priority' -or $command[-1] -eq '-p') {
                        $script:AQE_PRIORITIES | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                            $completions += New-Completion $_ "Filter by $_ priority"
                        }
                    }
                    elseif ($command[-1] -eq '--domain' -or $command[-1] -eq '-d') {
                        $script:AQE_DOMAINS | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                            $completions += New-Completion $_ "Filter by $_ domain"
                        }
                    }
                    else {
                        $completions += New-Completion '-s' 'Filter by status'
                        $completions += New-Completion '--status' 'Filter by status'
                        $completions += New-Completion '-p' 'Filter by priority'
                        $completions += New-Completion '--priority' 'Filter by priority'
                        $completions += New-Completion '-d' 'Filter by domain'
                        $completions += New-Completion '--domain' 'Filter by domain'
                    }
                }
            }

            'agent' {
                if ($command.Count -eq 1) {
                    $completions += New-Completion 'list' 'List all agents'
                    $completions += New-Completion 'spawn' 'Spawn an agent'
                }
                elseif ($command[1] -eq 'list') {
                    if ($command[-1] -eq '--domain' -or $command[-1] -eq '-d') {
                        $script:AQE_DOMAINS | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                            $completions += New-Completion $_ "Filter by $_ domain"
                        }
                    }
                    elseif ($command[-1] -eq '--status' -or $command[-1] -eq '-s') {
                        @('active', 'idle', 'failed') | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                            $completions += New-Completion $_ "Filter by $_ status"
                        }
                    }
                    else {
                        $completions += New-Completion '-d' 'Filter by domain'
                        $completions += New-Completion '--domain' 'Filter by domain'
                        $completions += New-Completion '-s' 'Filter by status'
                        $completions += New-Completion '--status' 'Filter by status'
                    }
                }
                elseif ($command[1] -eq 'spawn') {
                    if ($command[-1] -eq '--type' -or $command[-1] -eq '-t') {
                        $script:AQE_ALL_AGENTS | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                            $completions += New-Completion $_ "$_ agent type"
                        }
                    }
                    elseif ($command.Count -eq 2) {
                        $script:AQE_DOMAINS | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                            $completions += New-Completion $_ "Spawn in $_ domain"
                        }
                    }
                    else {
                        $completions += New-Completion '-t' 'Agent type'
                        $completions += New-Completion '--type' 'Agent type'
                        $completions += New-Completion '-c' 'Capabilities'
                        $completions += New-Completion '--capabilities' 'Capabilities'
                    }
                }
            }

            'domain' {
                if ($command.Count -eq 1) {
                    $completions += New-Completion 'list' 'List all domains'
                    $completions += New-Completion 'health' 'Get domain health'
                }
                elseif ($command[1] -eq 'health' -and $command.Count -eq 2) {
                    $script:AQE_DOMAINS | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        $completions += New-Completion $_ "$_ domain health"
                    }
                }
            }

            'protocol' {
                if ($command.Count -eq 1) {
                    $completions += New-Completion 'run' 'Execute a protocol'
                }
                elseif ($command[1] -eq 'run') {
                    $completions += New-Completion '--params' 'Protocol parameters as JSON'
                }
            }

            'test' {
                if ($command.Count -eq 1) {
                    $completions += New-Completion 'generate' 'Generate tests'
                    $completions += New-Completion 'execute' 'Execute tests'
                }
                elseif ($command[-1] -eq '--framework' -or $command[-1] -eq '-f') {
                    $script:AQE_FRAMEWORKS | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        $completions += New-Completion $_ "$_ framework"
                    }
                }
                elseif ($command[-1] -eq '--type' -or $command[-1] -eq '-t') {
                    $script:AQE_TEST_TYPES | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        $completions += New-Completion $_ "$_ tests"
                    }
                }
                elseif ($command[-1] -eq '--file' -or ($command[1] -eq 'execute' -and $command.Count -eq 2)) {
                    # Complete test files (*.test.ts, *.spec.ts, *.test.js, *.spec.js, etc.)
                    Get-ChildItem -Path "." -Recurse -Depth 3 -Include "*.test.ts","*.spec.ts","*.test.js","*.spec.js","*.test.tsx","*.spec.tsx","*.test.jsx","*.spec.jsx" -ErrorAction SilentlyContinue |
                        Select-Object -First 30 |
                        Where-Object { $_.FullName -like "*$wordToComplete*" } |
                        ForEach-Object {
                            $relativePath = Resolve-Path -Relative $_.FullName
                            $completions += New-Completion $relativePath "Test file"
                        }
                    # Also suggest directories for navigation
                    Get-ChildItem -Directory -Path "." -ErrorAction SilentlyContinue |
                        Where-Object { $_.Name -like "$wordToComplete*" } |
                        ForEach-Object {
                            $completions += New-Completion $_.Name "Directory"
                        }
                }
                else {
                    $completions += New-Completion '-f' 'Test framework'
                    $completions += New-Completion '--framework' 'Test framework'
                    $completions += New-Completion '-t' 'Test type'
                    $completions += New-Completion '--type' 'Test type'
                    $completions += New-Completion '--file' 'Test file pattern'
                    $completions += New-Completion '--parallel' 'Run tests in parallel'
                    $completions += New-Completion '--watch' 'Watch mode'
                }
            }

            'coverage' {
                if ($command[-1] -eq '--target' -or $command[-1] -eq '-t' -or $command.Count -eq 1) {
                    # Complete directories
                    Get-ChildItem -Directory -Path "." -ErrorAction SilentlyContinue |
                        Where-Object { $_.Name -like "$wordToComplete*" } |
                        ForEach-Object {
                            $completions += New-Completion $_.Name "Directory"
                        }
                }
                else {
                    $completions += New-Completion '--risk' 'Include risk scoring'
                    $completions += New-Completion '--gaps' 'Detect coverage gaps'
                    $completions += New-Completion '-t' 'Target directory'
                    $completions += New-Completion '--target' 'Target directory'
                }
            }

            'quality' {
                $completions += New-Completion '--gate' 'Run quality gate evaluation'
            }

            'security' {
                if ($command[-1] -eq '--compliance') {
                    @('gdpr', 'hipaa', 'soc2', 'pci-dss', 'ccpa') | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        $completions += New-Completion $_ "$_ compliance"
                    }
                }
                elseif ($command[-1] -eq '--target' -or $command[-1] -eq '-t' -or $command.Count -eq 1) {
                    # Complete directories for security scan target
                    Get-ChildItem -Directory -Path "." -ErrorAction SilentlyContinue |
                        Where-Object { $_.Name -like "$wordToComplete*" } |
                        ForEach-Object {
                            $completions += New-Completion $_.Name "Directory"
                        }
                }
                else {
                    $completions += New-Completion '--sast' 'Run SAST scan'
                    $completions += New-Completion '--dast' 'Run DAST scan'
                    $completions += New-Completion '--compliance' 'Check compliance'
                    $completions += New-Completion '-t' 'Target directory'
                    $completions += New-Completion '--target' 'Target directory'
                }
            }

            'code' {
                if ($command.Count -eq 1) {
                    $completions += New-Completion 'index' 'Index codebase'
                    $completions += New-Completion 'search' 'Search code'
                    $completions += New-Completion 'impact' 'Analyze impact'
                    $completions += New-Completion 'deps' 'Map dependencies'
                }
                elseif ($command[-1] -eq '--depth') {
                    @(1, 2, 3, 4, 5) | ForEach-Object {
                        $completions += New-Completion $_.ToString() "Depth $_"
                    }
                }
                elseif ($command.Count -eq 2 -and @('index', 'search', 'impact', 'deps') -contains $command[1]) {
                    # Complete directories for code action targets
                    Get-ChildItem -Directory -Path "." -ErrorAction SilentlyContinue |
                        Where-Object { $_.Name -like "$wordToComplete*" } |
                        ForEach-Object {
                            $completions += New-Completion $_.Name "Directory"
                        }
                }
                else {
                    $completions += New-Completion '--depth' 'Analysis depth'
                    $completions += New-Completion '--include-tests' 'Include test files'
                }
            }

            'migrate' {
                $completions += New-Completion '--dry-run' 'Preview migration without changes'
                $completions += New-Completion '--backup' 'Create backup before migration'
                $completions += New-Completion '--skip-memory' 'Skip memory database migration'
                $completions += New-Completion '--skip-patterns' 'Skip pattern migration'
                $completions += New-Completion '--skip-config' 'Skip configuration migration'
                $completions += New-Completion '--force' 'Force migration even if v3 exists'
            }

            'completions' {
                if ($command.Count -eq 1) {
                    $completions += New-Completion 'bash' 'Generate Bash completion script'
                    $completions += New-Completion 'zsh' 'Generate Zsh completion script'
                    $completions += New-Completion 'fish' 'Generate Fish completion script'
                    $completions += New-Completion 'powershell' 'Generate PowerShell completion script'
                    $completions += New-Completion 'install' 'Auto-install for current shell'
                }
                elseif ($command[1] -eq 'install') {
                    if ($command[-1] -eq '--shell') {
                        @('bash', 'zsh', 'fish', 'powershell') | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                            $completions += New-Completion $_ "$_ shell"
                        }
                    }
                    else {
                        $completions += New-Completion '--shell' 'Target shell'
                    }
                }
            }
        }
    }

    # Filter completions by word to complete
    $completions | Where-Object { $_.CompletionText -like "$wordToComplete*" }
}
`;

  return script;
}

// ============================================================================
// Installation Helper
// ============================================================================

/**
 * Shell detection result
 */
export interface ShellInfo {
  name: 'bash' | 'zsh' | 'fish' | 'powershell' | 'unknown';
  configFile: string | null;
  detected: boolean;
}

/**
 * Detect the current shell
 */
export function detectShell(): ShellInfo {
  const shell = process.env.SHELL || '';
  const psVersion = process.env.PSVersionTable;

  if (psVersion || process.env.PSModulePath) {
    return {
      name: 'powershell',
      configFile: process.platform === 'win32'
        ? `${process.env.USERPROFILE}\\Documents\\WindowsPowerShell\\Microsoft.PowerShell_profile.ps1`
        : `${process.env.HOME}/.config/powershell/Microsoft.PowerShell_profile.ps1`,
      detected: true,
    };
  }

  if (shell.includes('bash')) {
    return {
      name: 'bash',
      configFile: `${process.env.HOME}/.bashrc`,
      detected: true,
    };
  }

  if (shell.includes('zsh')) {
    return {
      name: 'zsh',
      configFile: `${process.env.HOME}/.zshrc`,
      detected: true,
    };
  }

  if (shell.includes('fish')) {
    return {
      name: 'fish',
      configFile: `${process.env.HOME}/.config/fish/completions/aqe.fish`,
      detected: true,
    };
  }

  return {
    name: 'unknown',
    configFile: null,
    detected: false,
  };
}

/**
 * Get installation instructions for a shell
 */
export function getInstallInstructions(shell: ShellInfo['name']): string {
  switch (shell) {
    case 'bash':
      return `# Add to your ~/.bashrc:
eval "$(aqe completions bash)"

# Or save to a file:
aqe completions bash > /etc/bash_completion.d/aqe
# or
aqe completions bash > ~/.local/share/bash-completion/completions/aqe`;

    case 'zsh':
      return `# Add to your ~/.zshrc:
eval "$(aqe completions zsh)"

# Or save to a file:
aqe completions zsh > ~/.zfunc/_aqe
# Then add to ~/.zshrc:
fpath=(~/.zfunc $fpath)
autoload -Uz compinit && compinit`;

    case 'fish':
      return `# Save to completions directory:
aqe completions fish > ~/.config/fish/completions/aqe.fish`;

    case 'powershell':
      return `# Add to your PowerShell profile ($PROFILE):
Invoke-Expression (& aqe completions powershell | Out-String)

# Or save to a file and dot-source it:
aqe completions powershell > ~/.config/powershell/aqe-completions.ps1
# Then add to $PROFILE:
. ~/.config/powershell/aqe-completions.ps1`;

    default:
      return `Shell not detected. Available shells:
  - bash: aqe completions bash
  - zsh: aqe completions zsh
  - fish: aqe completions fish
  - powershell: aqe completions powershell`;
  }
}

/**
 * Generate completion script for a given shell
 */
export function generateCompletion(shell: 'bash' | 'zsh' | 'fish' | 'powershell'): string {
  switch (shell) {
    case 'bash':
      return generateBashCompletion();
    case 'zsh':
      return generateZshCompletion();
    case 'fish':
      return generateFishCompletion();
    case 'powershell':
      return generatePowerShellCompletion();
    default:
      throw new Error(`Unsupported shell: ${shell}`);
  }
}
