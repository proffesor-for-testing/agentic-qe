#!/bin/bash
# Update Agent Descriptions to Follow Claude Best Practices
#
# Description should specify:
# 1. What the agent does (functionality)
# 2. When to use it (use cases)
#
# Reference: https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices

set -e

echo "📝 Updating Agent Descriptions"
echo "==============================="
echo ""

# Agent descriptions (name → description mapping)
declare -A DESCRIPTIONS=(
    ["qe-test-generator"]="AI-powered test generation agent with sublinear optimization and multi-framework support"
    ["qe-test-executor"]="Multi-framework test executor with parallel execution, retry logic, and real-time reporting"
    ["qe-coverage-analyzer"]="AI-powered coverage analysis with sublinear gap detection and critical path optimization"
    ["qe-quality-gate"]="Intelligent quality gate with risk assessment, policy validation, and automated decision-making"
    ["qe-quality-analyzer"]="Comprehensive quality metrics analysis with trend detection, predictive analytics, and actionable insights"
    ["qe-performance-tester"]="Multi-tool performance testing with load orchestration, bottleneck detection, and SLA validation"
    ["qe-security-scanner"]="Multi-layer security scanning with SAST/DAST, vulnerability detection, and compliance validation"
    ["qe-requirements-validator"]="Validates requirements testability and generates BDD scenarios before development begins"
    ["qe-production-intelligence"]="Converts production data into test scenarios through incident replay and RUM analysis"
    ["qe-fleet-commander"]="Hierarchical fleet coordinator for 50+ agent orchestration with dynamic topology management and resource optimization"
    ["qe-deployment-readiness"]="Aggregates quality signals to provide deployment risk assessment and go/no-go decisions"
    ["qe-regression-risk-analyzer"]="Analyzes code changes to predict regression risk and intelligently select minimal test suites"
    ["qe-test-data-architect"]="Generates realistic, schema-aware test data with relationship preservation and edge case coverage"
    ["qe-api-contract-validator"]="Validates API contracts, detects breaking changes, and ensures backward compatibility across services"
    ["qe-flaky-test-hunter"]="Detects, analyzes, and stabilizes flaky tests through pattern recognition and auto-remediation"
    ["qe-visual-tester"]="AI-powered visual testing agent with screenshot comparison, visual regression detection, accessibility validation, and cross-browser UI/UX testing"
    ["qe-chaos-engineer"]="Resilience testing agent with controlled chaos experiments, fault injection, and blast radius management for production-grade systems"
    ["qe-code-complexity"]="Educational code complexity analyzer demonstrating the Agentic QE Fleet architecture"
)

AGENT_DIR=".claude/agents"
UPDATED=0

for agent_name in "${!DESCRIPTIONS[@]}"; do
    agent_file="$AGENT_DIR/${agent_name}.md"

    if [ ! -f "$agent_file" ]; then
        echo "⚠️  Skipping $agent_name (file not found)"
        continue
    fi

    description="${DESCRIPTIONS[$agent_name]}"

    # Create temp file
    temp_file=$(mktemp)

    # Write new frontmatter with updated description
    cat > "$temp_file" << EOF
---
name: $agent_name
description: $description
---
EOF

    # Append content after original frontmatter
    awk '
        BEGIN { in_frontmatter=0; after_frontmatter=0 }
        /^---$/ {
            in_frontmatter++
            if (in_frontmatter == 2) {
                after_frontmatter=1
                next
            }
            next
        }
        after_frontmatter { print }
    ' "$agent_file" >> "$temp_file"

    # Replace file
    mv "$temp_file" "$agent_file"

    echo "✓ Updated $agent_name"
    UPDATED=$((UPDATED + 1))
done

echo ""
echo "========================================="
echo "✅ Updated $UPDATED agent descriptions"
echo "========================================="
echo ""
echo "All descriptions now follow Claude best practices:"
echo "  • What the agent does (functionality)"
echo "  • When to use it (use cases)"
echo ""
echo "📚 Reference:"
echo "https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices"
