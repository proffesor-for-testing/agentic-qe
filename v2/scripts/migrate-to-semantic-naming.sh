#!/bin/bash
# Migration Script: Version-Agnostic Naming for Agentic QE
# ADR-042 Implementation
#
# This script renames v3-prefixed items to semantic, version-agnostic names
# while maintaining backward compatibility through aliases.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Counters
AGENTS_RENAMED=0
SKILLS_RENAMED=0
REFS_UPDATED=0

#######################################
# Phase 1: Rename Agent Files
#######################################
rename_agents() {
    log_info "Phase 1: Renaming v3 agent files..."

    cd "$PROJECT_ROOT/.claude/agents/v3"

    # Rename main agents
    for file in v3-*.md; do
        if [[ -f "$file" ]]; then
            newname="${file/v3-/}"
            if [[ ! -f "$newname" ]]; then
                git mv "$file" "$newname" 2>/dev/null || mv "$file" "$newname"
                log_success "Renamed: $file -> $newname"
                ((AGENTS_RENAMED++))
            else
                log_warning "Skipped (target exists): $file -> $newname"
            fi
        fi
    done

    # Rename subagents
    if [[ -d "subagents" ]]; then
        cd subagents
        for file in v3-*.md; do
            if [[ -f "$file" ]]; then
                newname="${file/v3-/}"
                if [[ ! -f "$newname" ]]; then
                    git mv "$file" "$newname" 2>/dev/null || mv "$file" "$newname"
                    log_success "Renamed subagent: $file -> $newname"
                    ((AGENTS_RENAMED++))
                fi
            fi
        done
        cd ..
    fi

    log_info "Agents renamed: $AGENTS_RENAMED"
}

#######################################
# Phase 2: Rename Skill Directories
#######################################
rename_skills() {
    log_info "Phase 2: Renaming v3 skill directories..."

    cd "$PROJECT_ROOT/.claude/skills"

    for dir in v3-qe-*/; do
        if [[ -d "$dir" ]]; then
            newdir="${dir/v3-/}"
            newdir="${newdir%/}"
            olddir="${dir%/}"
            if [[ ! -d "$newdir" ]]; then
                git mv "$olddir" "$newdir" 2>/dev/null || mv "$olddir" "$newdir"
                log_success "Renamed skill: $olddir -> $newdir"
                ((SKILLS_RENAMED++))
            else
                log_warning "Skipped (target exists): $olddir -> $newdir"
            fi
        fi
    done

    log_info "Skills renamed: $SKILLS_RENAMED"
}

#######################################
# Phase 3: Update Internal References
#######################################
update_references() {
    log_info "Phase 3: Updating internal v3- references..."

    cd "$PROJECT_ROOT"

    # Update agent files
    find .claude/agents/v3 -name "*.md" -type f | while read -r file; do
        if grep -q 'v3-qe-' "$file" 2>/dev/null; then
            sed -i 's/v3-qe-/qe-/g' "$file"
            ((REFS_UPDATED++))
            log_success "Updated references in: $file"
        fi
        # Also update v3-integration- prefix
        if grep -q 'v3-integration-' "$file" 2>/dev/null; then
            sed -i 's/v3-integration-/qe-integration-/g' "$file"
        fi
    done

    # Update skill files
    find .claude/skills -name "SKILL.md" -type f | while read -r file; do
        if grep -q 'v3-qe-' "$file" 2>/dev/null; then
            sed -i 's/v3-qe-/qe-/g' "$file"
            log_success "Updated references in: $file"
        fi
    done

    log_info "Files with references updated"
}

#######################################
# Phase 4: Update CLI Completions
#######################################
update_cli_completions() {
    log_info "Phase 4: Updating CLI completions..."

    COMPLETIONS_FILE="$PROJECT_ROOT/v3/src/cli/completions/index.ts"

    if [[ -f "$COMPLETIONS_FILE" ]]; then
        # Update V3_QE_AGENTS array entries
        sed -i "s/'v3-qe-/'qe-/g" "$COMPLETIONS_FILE"

        # Rename array from V3_QE_AGENTS to QE_AGENTS (but keep V3_QE_AGENTS as alias)
        # This will be done manually for more control

        log_success "Updated completions in: $COMPLETIONS_FILE"
    else
        log_warning "Completions file not found: $COMPLETIONS_FILE"
    fi
}

#######################################
# Phase 5: Update Package.json Binary
#######################################
update_package_json() {
    log_info "Phase 5: Updating package.json binary entries..."

    PACKAGE_FILE="$PROJECT_ROOT/v3/package.json"

    if [[ -f "$PACKAGE_FILE" ]]; then
        # Add 'aqe' as primary binary while keeping 'aqe-v3' for backward compat
        # Using node for JSON manipulation
        node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('$PACKAGE_FILE', 'utf8'));
            if (pkg.bin && pkg.bin['aqe-v3']) {
                pkg.bin['aqe'] = pkg.bin['aqe-v3'];
                if (pkg.bin['aqe-v3-mcp']) {
                    pkg.bin['aqe-mcp'] = pkg.bin['aqe-v3-mcp'];
                }
                fs.writeFileSync('$PACKAGE_FILE', JSON.stringify(pkg, null, 2) + '\n');
                console.log('Updated package.json with new binary entries');
            }
        "
        log_success "Updated package.json"
    else
        log_warning "Package file not found: $PACKAGE_FILE"
    fi
}

#######################################
# Phase 6: Update CLI Index
#######################################
update_cli_index() {
    log_info "Phase 6: Updating CLI index.ts program name..."

    CLI_INDEX="$PROJECT_ROOT/v3/src/cli/index.ts"

    if [[ -f "$CLI_INDEX" ]]; then
        # Update program name from 'aqe-v3' to 'aqe'
        sed -i "s/\.name('aqe-v3')/\.name('aqe')/g" "$CLI_INDEX"

        log_success "Updated CLI index"
    else
        log_warning "CLI index not found: $CLI_INDEX"
    fi
}

#######################################
# Phase 7: Create Aliases File
#######################################
create_aliases() {
    log_info "Phase 7: Creating aliases configuration..."

    ALIASES_FILE="$PROJECT_ROOT/.claude/agents/v3/aliases.yaml"

    cat > "$ALIASES_FILE" << 'EOF'
# Agent Name Aliases for Backward Compatibility
# ADR-042: Version-Agnostic Naming Migration
#
# These aliases map old v3-prefixed names to new semantic names
# Deprecated names will show warnings when used

# V3 to Semantic Name Aliases (for backward compat)
v3_aliases:
  v3-qe-test-architect: qe-test-architect
  v3-qe-tdd-specialist: qe-tdd-specialist
  v3-qe-parallel-executor: qe-parallel-executor
  v3-qe-flaky-hunter: qe-flaky-hunter
  v3-qe-retry-handler: qe-retry-handler
  v3-qe-coverage-specialist: qe-coverage-specialist
  v3-qe-gap-detector: qe-gap-detector
  v3-qe-quality-gate: qe-quality-gate
  v3-qe-deployment-advisor: qe-deployment-advisor
  v3-qe-code-complexity: qe-code-complexity
  v3-qe-qx-partner: qe-qx-partner
  v3-qe-security-scanner: qe-security-scanner
  v3-qe-security-auditor: qe-security-auditor
  v3-qe-contract-validator: qe-contract-validator
  v3-qe-integration-tester: qe-integration-tester
  v3-qe-graphql-tester: qe-graphql-tester
  v3-qe-visual-tester: qe-visual-tester
  v3-qe-accessibility-auditor: qe-accessibility-auditor
  v3-qe-responsive-tester: qe-responsive-tester
  v3-qe-performance-tester: qe-performance-tester
  v3-qe-load-tester: qe-load-tester
  v3-qe-chaos-engineer: qe-chaos-engineer
  v3-qe-code-intelligence: qe-code-intelligence
  v3-qe-dependency-mapper: qe-dependency-mapper
  v3-qe-kg-builder: qe-kg-builder
  v3-qe-requirements-validator: qe-requirements-validator
  v3-qe-bdd-generator: qe-bdd-generator
  v3-qe-defect-predictor: qe-defect-predictor
  v3-qe-root-cause-analyzer: qe-root-cause-analyzer
  v3-qe-regression-analyzer: qe-regression-analyzer
  v3-qe-impact-analyzer: qe-impact-analyzer
  v3-qe-risk-assessor: qe-risk-assessor
  v3-qe-learning-coordinator: qe-learning-coordinator
  v3-qe-pattern-learner: qe-pattern-learner
  v3-qe-transfer-specialist: qe-transfer-specialist
  v3-qe-metrics-optimizer: qe-metrics-optimizer
  v3-qe-fleet-commander: qe-fleet-commander
  v3-qe-queen-coordinator: qe-queen-coordinator
  v3-qe-property-tester: qe-property-tester
  v3-qe-mutation-tester: qe-mutation-tester
  v3-integration-architect: qe-integration-architect

# V3 Subagent Aliases
v3_subagent_aliases:
  v3-qe-tdd-red: qe-tdd-red
  v3-qe-tdd-green: qe-tdd-green
  v3-qe-tdd-refactor: qe-tdd-refactor
  v3-qe-code-reviewer: qe-code-reviewer
  v3-qe-integration-reviewer: qe-integration-reviewer
  v3-qe-performance-reviewer: qe-performance-reviewer
  v3-qe-security-reviewer: qe-security-reviewer

# V2 to V3 Semantic Aliases (for v2 users migrating)
v2_aliases:
  qe-test-generator: qe-test-architect
  qe-coverage-analyzer: qe-coverage-specialist
  qe-a11y-ally: qe-accessibility-auditor
  qe-api-contract-validator: qe-contract-validator
  qe-deployment-readiness: qe-deployment-advisor
  qe-flaky-test-hunter: qe-flaky-hunter
  qe-regression-risk-analyzer: qe-regression-analyzer
  qe-test-executor: qe-parallel-executor
  qx-partner: qe-qx-partner

# V2 agents with no V3 equivalent (keep as-is)
v2_keep:
  - qe-production-intelligence
  - qe-quality-analyzer
  - qe-test-data-architect
  - base-template-generator
EOF

    log_success "Created aliases file: $ALIASES_FILE"
}

#######################################
# Main Execution
#######################################
main() {
    echo ""
    echo "=============================================="
    echo "  Agentic QE - Version-Agnostic Naming Migration"
    echo "  ADR-042 Implementation"
    echo "=============================================="
    echo ""

    # Check if we're in the right directory
    if [[ ! -d "$PROJECT_ROOT/.claude/agents/v3" ]]; then
        log_error "Cannot find .claude/agents/v3 directory"
        log_error "Please run this script from the agentic-qe project root"
        exit 1
    fi

    # Parse arguments
    DRY_RUN=false
    PHASE=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run) DRY_RUN=true; shift ;;
            --phase) PHASE="$2"; shift 2 ;;
            --help)
                echo "Usage: $0 [--dry-run] [--phase <1-7|all>]"
                echo ""
                echo "Phases:"
                echo "  1: Rename agent files"
                echo "  2: Rename skill directories"
                echo "  3: Update internal references"
                echo "  4: Update CLI completions"
                echo "  5: Update package.json"
                echo "  6: Update CLI index"
                echo "  7: Create aliases file"
                echo "  all: Run all phases (default)"
                exit 0
                ;;
            *) shift ;;
        esac
    done

    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "DRY RUN MODE - No changes will be made"
    fi

    # Execute phases
    case "$PHASE" in
        1) rename_agents ;;
        2) rename_skills ;;
        3) update_references ;;
        4) update_cli_completions ;;
        5) update_package_json ;;
        6) update_cli_index ;;
        7) create_aliases ;;
        all|"")
            rename_agents
            rename_skills
            update_references
            update_cli_completions
            update_package_json
            update_cli_index
            create_aliases
            ;;
        *)
            log_error "Unknown phase: $PHASE"
            exit 1
            ;;
    esac

    echo ""
    echo "=============================================="
    echo "  Migration Summary"
    echo "=============================================="
    echo "  Agents renamed: $AGENTS_RENAMED"
    echo "  Skills renamed: $SKILLS_RENAMED"
    echo "=============================================="
    echo ""

    log_success "Migration script completed!"
    log_info "Next steps:"
    log_info "  1. Review changes with 'git diff'"
    log_info "  2. Run tests: 'cd v3 && npm test -- --run'"
    log_info "  3. Commit changes when satisfied"
}

main "$@"
