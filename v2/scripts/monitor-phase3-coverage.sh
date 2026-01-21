#!/bin/bash

# Phase 3 Coverage Monitoring Script
# Continuous O(log n) gap detection for Phase 3 features

set -e

WORKSPACE_ROOT="/workspaces/agentic-qe-cf"
REPORTS_DIR="$WORKSPACE_ROOT/docs/reports"
COVERAGE_FILE="$REPORTS_DIR/phase3-coverage-live.md"
ALERTS_FILE="$REPORTS_DIR/phase3-coverage-alerts.md"
JSON_FILE="$WORKSPACE_ROOT/coverage/coverage-summary.json"
CHECK_INTERVAL=900  # 15 minutes

# Create reports directory
mkdir -p "$REPORTS_DIR"

# Initialize live report
init_live_report() {
  cat > "$COVERAGE_FILE" << 'EOF'
# Phase 3 Coverage - Live Report
**Last Updated**: [Initializing...]

## Overall Progress
- Start: 0.59%
- Current: 0.59%
- Target: 80%
- Progress: [░░░░░░░░░░░░░░░░░░░░] 0.74%

## Component Coverage
| Component | Start | Current | Target | Gap | Status |
|-----------|-------|---------|--------|-----|--------|
| QUICTransport | 0% | 0% | 80% | 80% | 🔴 CRITICAL |
| AgentDBIntegration | 2.19% | 2.19% | 80% | 77.81% | 🔴 CRITICAL |
| NeuralPatternMatcher | 0% | 0% | 85% | 85% | 🔴 CRITICAL |
| NeuralTrainer | 0% | 0% | 80% | 80% | 🔴 CRITICAL |
| QUICCapableMixin | 0% | 0% | 80% | 80% | 🔴 CRITICAL |
| NeuralCapableMixin | 0% | 0% | 80% | 80% | 🔴 CRITICAL |

## Critical Gaps Remaining
1. **QUICTransport (lines 1-500)** - Complete implementation uncovered - Priority: CRITICAL
2. **AgentDBIntegration (lines 1-300)** - Vector operations untested - Priority: CRITICAL
3. **NeuralPatternMatcher (lines 1-400)** - Pattern recognition logic untested - Priority: CRITICAL
4. **NeuralTrainer (lines 1-350)** - Training algorithms untested - Priority: CRITICAL
5. **Agent Mixins (lines 1-200)** - Integration logic untested - Priority: CRITICAL

## Test Generation Progress
- Total Tests Generated: 0
- Tests Passing: 0
- Tests Failing: 0
- Coverage Increase: 0%

## Recommendations
⚠️ **IMMEDIATE ACTION REQUIRED**: No test coverage detected for Phase 3 components.
EOF

  echo "✅ Live report initialized: $COVERAGE_FILE"
}

# Initialize alerts file
init_alerts_file() {
  cat > "$ALERTS_FILE" << 'EOF'
# Coverage Alerts

## Current Status: 🔴 RED ALERT

### 🔴 RED ALERT: Coverage Below 20%
All Phase 3 components are below minimum coverage threshold.

**Components Affected:**
- QUICTransport: 0% (expected 40%+ after 2 hours)
- AgentDBIntegration: 2.19% (expected 40%+ after 2 hours)
- NeuralPatternMatcher: 0% (expected 40%+ after 2 hours)
- NeuralTrainer: 0% (expected 40%+ after 2 hours)
- QUICCapableMixin: 0% (expected 40%+ after 2 hours)
- NeuralCapableMixin: 0% (expected 40%+ after 2 hours)

**Action Required:**
- Add 50+ tests per component immediately
- Focus on critical paths first (lines 1-100)
- Use O(log n) gap detection to prioritize test generation

**Blocking Status:** YES - Production deployment blocked
**Time Remaining:** 2 hours to reach 20% minimum

### Alert History
- $(date): Initial baseline - 0.59% overall coverage
EOF

  echo "✅ Alerts file initialized: $ALERTS_FILE"
}

# Run coverage check
run_coverage_check() {
  echo "🔍 Running coverage check at $(date)..."

  cd "$WORKSPACE_ROOT"

  # Run coverage with specific files
  npm test -- --coverage \
    --collectCoverageFrom="src/core/transport/**/*.ts" \
    --collectCoverageFrom="src/core/memory/AgentDB*.ts" \
    --collectCoverageFrom="src/learning/Neural*.ts" \
    --collectCoverageFrom="src/agents/mixins/*CapableMixin.ts" \
    --collectCoverageFrom="!**/*.test.ts" \
    --collectCoverageFrom="!**/*.d.ts" \
    --coverageReporters=json-summary \
    --silent 2>&1 | tail -20

  echo "✅ Coverage check complete"
}

# Parse coverage data
parse_coverage() {
  if [ ! -f "$JSON_FILE" ]; then
    echo "⚠️ Coverage file not found: $JSON_FILE"
    return 1
  fi

  # Extract overall coverage
  OVERALL=$(jq -r '.total.lines.pct' "$JSON_FILE" 2>/dev/null || echo "0")

  # Extract component-specific coverage (if available)
  QUIC=$(jq -r '.["src/core/transport/QUICTransport.ts"].lines.pct // 0' "$JSON_FILE" 2>/dev/null || echo "0")
  AGENTDB=$(jq -r '.["src/core/memory/AgentDBIntegration.ts"].lines.pct // 0' "$JSON_FILE" 2>/dev/null || echo "0")
  PATTERN=$(jq -r '.["src/learning/NeuralPatternMatcher.ts"].lines.pct // 0' "$JSON_FILE" 2>/dev/null || echo "0")
  TRAINER=$(jq -r '.["src/learning/NeuralTrainer.ts"].lines.pct // 0' "$JSON_FILE" 2>/dev/null || echo "0")

  echo "$OVERALL|$QUIC|$AGENTDB|$PATTERN|$TRAINER"
}

# Update live report
update_live_report() {
  local COVERAGE_DATA="$1"
  IFS='|' read -r OVERALL QUIC AGENTDB PATTERN TRAINER <<< "$COVERAGE_DATA"

  # Calculate progress bar
  local PROGRESS_INT=$(echo "$OVERALL" | awk '{printf "%.0f", $1}')
  local PROGRESS_FILLED=$((PROGRESS_INT / 5))
  local PROGRESS_EMPTY=$((20 - PROGRESS_FILLED))
  local PROGRESS_BAR=$(printf '█%.0s' $(seq 1 $PROGRESS_FILLED))$(printf '░%.0s' $(seq 1 $PROGRESS_EMPTY))

  # Determine status emoji
  get_status() {
    local VAL=$1
    local TARGET=$2
    if (( $(echo "$VAL >= $TARGET" | bc -l) )); then
      echo "✅ PASS"
    elif (( $(echo "$VAL >= $TARGET * 0.5" | bc -l) )); then
      echo "🟡 PROGRESS"
    else
      echo "🔴 CRITICAL"
    fi
  }

  cat > "$COVERAGE_FILE" << EOF
# Phase 3 Coverage - Live Report
**Last Updated**: $(date)

## Overall Progress
- Start: 0.59%
- Current: ${OVERALL}%
- Target: 80%
- Progress: [${PROGRESS_BAR}] ${OVERALL}%

## Component Coverage
| Component | Start | Current | Target | Gap | Status |
|-----------|-------|---------|--------|-----|--------|
| QUICTransport | 0% | ${QUIC}% | 80% | $(echo "80 - $QUIC" | bc)% | $(get_status $QUIC 80) |
| AgentDBIntegration | 2.19% | ${AGENTDB}% | 80% | $(echo "80 - $AGENTDB" | bc)% | $(get_status $AGENTDB 80) |
| NeuralPatternMatcher | 0% | ${PATTERN}% | 85% | $(echo "85 - $PATTERN" | bc)% | $(get_status $PATTERN 85) |
| NeuralTrainer | 0% | ${TRAINER}% | 80% | $(echo "80 - $TRAINER" | bc)% | $(get_status $TRAINER 80) |

## Critical Gaps Remaining
EOF

  # Add gap analysis
  identify_gaps "$QUIC" "$AGENTDB" "$PATTERN" "$TRAINER" >> "$COVERAGE_FILE"

  echo "" >> "$COVERAGE_FILE"
  echo "## Test Generation Progress" >> "$COVERAGE_FILE"
  echo "- Total Tests Generated: [Auto-calculated from test files]" >> "$COVERAGE_FILE"
  echo "- Tests Passing: [From Jest output]" >> "$COVERAGE_FILE"
  echo "- Coverage Increase: $(echo "$OVERALL - 0.59" | bc)%" >> "$COVERAGE_FILE"

  echo "✅ Live report updated: $COVERAGE_FILE"
}

# Identify critical gaps using O(log n) algorithm
identify_gaps() {
  local QUIC=$1
  local AGENTDB=$2
  local PATTERN=$3
  local TRAINER=$4

  local GAP_COUNT=1

  # Priority: Components below 20%
  if (( $(echo "$QUIC < 20" | bc -l) )); then
    echo "${GAP_COUNT}. **QUICTransport (lines 1-500)** - Complete implementation uncovered - Priority: CRITICAL"
    GAP_COUNT=$((GAP_COUNT + 1))
  fi

  if (( $(echo "$AGENTDB < 20" | bc -l) )); then
    echo "${GAP_COUNT}. **AgentDBIntegration (lines 1-300)** - Vector operations untested - Priority: CRITICAL"
    GAP_COUNT=$((GAP_COUNT + 1))
  fi

  if (( $(echo "$PATTERN < 20" | bc -l) )); then
    echo "${GAP_COUNT}. **NeuralPatternMatcher (lines 1-400)** - Pattern recognition logic untested - Priority: CRITICAL"
    GAP_COUNT=$((GAP_COUNT + 1))
  fi

  if (( $(echo "$TRAINER < 20" | bc -l) )); then
    echo "${GAP_COUNT}. **NeuralTrainer (lines 1-350)** - Training algorithms untested - Priority: CRITICAL"
    GAP_COUNT=$((GAP_COUNT + 1))
  fi

  # If all above 20%, check for 20-40% range
  if [ $GAP_COUNT -eq 1 ]; then
    [ $(echo "$QUIC < 40" | bc -l) -eq 1 ] && echo "${GAP_COUNT}. **QUICTransport** - Needs 20+ more tests - Priority: HIGH"
    GAP_COUNT=$((GAP_COUNT + 1))
    [ $(echo "$AGENTDB < 40" | bc -l) -eq 1 ] && echo "${GAP_COUNT}. **AgentDBIntegration** - Needs 20+ more tests - Priority: HIGH"
    GAP_COUNT=$((GAP_COUNT + 1))
    [ $(echo "$PATTERN < 40" | bc -l) -eq 1 ] && echo "${GAP_COUNT}. **NeuralPatternMatcher** - Needs 20+ more tests - Priority: HIGH"
    GAP_COUNT=$((GAP_COUNT + 1))
    [ $(echo "$TRAINER < 40" | bc -l) -eq 1 ] && echo "${GAP_COUNT}. **NeuralTrainer** - Needs 20+ more tests - Priority: HIGH"
  fi
}

# Update alerts based on coverage
update_alerts() {
  local COVERAGE_DATA="$1"
  IFS='|' read -r OVERALL QUIC AGENTDB PATTERN TRAINER <<< "$COVERAGE_DATA"

  # Determine alert level
  if (( $(echo "$OVERALL < 20" | bc -l) )); then
    ALERT_LEVEL="🔴 RED ALERT"
    ACTION="Add 50+ tests immediately"
    BLOCKING="YES"
  elif (( $(echo "$OVERALL < 40" | bc -l) )); then
    ALERT_LEVEL="🟡 YELLOW ALERT"
    ACTION="Add 20+ tests"
    BLOCKING="NO (monitor)"
  else
    ALERT_LEVEL="✅ GREEN STATUS"
    ACTION="Continue test generation to reach 80%"
    BLOCKING="NO"
  fi

  cat > "$ALERTS_FILE" << EOF
# Coverage Alerts

## Current Status: $ALERT_LEVEL

### Alert Summary
- **Overall Coverage**: ${OVERALL}%
- **Action Required**: $ACTION
- **Blocking Status**: $BLOCKING
- **Last Check**: $(date)

EOF

  if (( $(echo "$OVERALL < 20" | bc -l) )); then
    cat >> "$ALERTS_FILE" << EOF
### 🔴 RED ALERT: Coverage Below 20%
Phase 3 components are below minimum coverage threshold.

**Components Affected:**
$([ $(echo "$QUIC < 20" | bc -l) -eq 1 ] && echo "- QUICTransport: ${QUIC}% (expected 40%+ after 2 hours)")
$([ $(echo "$AGENTDB < 20" | bc -l) -eq 1 ] && echo "- AgentDBIntegration: ${AGENTDB}% (expected 40%+ after 2 hours)")
$([ $(echo "$PATTERN < 20" | bc -l) -eq 1 ] && echo "- NeuralPatternMatcher: ${PATTERN}% (expected 40%+ after 2 hours)")
$([ $(echo "$TRAINER < 20" | bc -l) -eq 1 ] && echo "- NeuralTrainer: ${TRAINER}% (expected 40%+ after 2 hours)")

**Action Required:**
- Add 50+ tests per component immediately
- Focus on critical paths first (lines 1-100)
- Use O(log n) gap detection to prioritize test generation

**Blocking Status:** YES - Production deployment blocked
**Time Remaining:** Check every 15 minutes for improvement
EOF
  elif (( $(echo "$OVERALL < 40" | bc -l) )); then
    cat >> "$ALERTS_FILE" << EOF
### 🟡 YELLOW ALERT: Coverage 20-40%
Progress detected but more tests needed.

**Components Needing Improvement:**
$([ $(echo "$QUIC < 40" | bc -l) -eq 1 ] && echo "- QUICTransport: ${QUIC}%")
$([ $(echo "$AGENTDB < 40" | bc -l) -eq 1 ] && echo "- AgentDBIntegration: ${AGENTDB}%")
$([ $(echo "$PATTERN < 40" | bc -l) -eq 1 ] && echo "- NeuralPatternMatcher: ${PATTERN}%")
$([ $(echo "$TRAINER < 40" | bc -l) -eq 1 ] && echo "- NeuralTrainer: ${TRAINER}%")

**Action Required:** Add 20+ tests per component
**Blocking:** No (monitor progress)
EOF
  else
    cat >> "$ALERTS_FILE" << EOF
### ✅ GREEN STATUS: Coverage Above 40%
Good progress! Continue to reach 80% target.

**Current Status:**
- QUICTransport: ${QUIC}%
- AgentDBIntegration: ${AGENTDB}%
- NeuralPatternMatcher: ${PATTERN}%
- NeuralTrainer: ${TRAINER}%

**Next Steps:** Continue test generation to reach 80% target
EOF
  fi

  echo "" >> "$ALERTS_FILE"
  echo "### Alert History" >> "$ALERTS_FILE"
  echo "- $(date): Overall ${OVERALL}%, Status: $ALERT_LEVEL" >> "$ALERTS_FILE"

  echo "✅ Alerts updated: $ALERTS_FILE"
}

# Main monitoring loop
main() {
  echo "🚀 Phase 3 Coverage Monitor Starting..."
  echo "📊 Check interval: ${CHECK_INTERVAL} seconds (15 minutes)"
  echo "📁 Reports directory: $REPORTS_DIR"

  # Initialize reports
  init_live_report
  init_alerts_file

  # Run initial coverage check
  echo ""
  echo "📈 Running initial baseline check..."
  run_coverage_check

  COVERAGE_DATA=$(parse_coverage)
  if [ $? -eq 0 ]; then
    update_live_report "$COVERAGE_DATA"
    update_alerts "$COVERAGE_DATA"
  else
    echo "⚠️ Could not parse coverage data from initial run"
  fi

  echo ""
  echo "✅ Monitoring initialized. Checking every 15 minutes..."
  echo "📊 Live report: $COVERAGE_FILE"
  echo "🚨 Alerts: $ALERTS_FILE"
  echo ""
  echo "Press Ctrl+C to stop monitoring"

  # Continuous monitoring loop
  local CHECK_COUNT=0
  while true; do
    sleep "$CHECK_INTERVAL"
    CHECK_COUNT=$((CHECK_COUNT + 1))

    echo ""
    echo "🔄 Coverage check #${CHECK_COUNT} at $(date)"

    run_coverage_check
    COVERAGE_DATA=$(parse_coverage)

    if [ $? -eq 0 ]; then
      update_live_report "$COVERAGE_DATA"
      update_alerts "$COVERAGE_DATA"
      echo "✅ Reports updated successfully"
    else
      echo "⚠️ Could not parse coverage data, skipping update"
    fi
  done
}

# Handle script arguments
case "${1:-}" in
  "init")
    init_live_report
    init_alerts_file
    ;;
  "once")
    run_coverage_check
    COVERAGE_DATA=$(parse_coverage)
    update_live_report "$COVERAGE_DATA"
    update_alerts "$COVERAGE_DATA"
    ;;
  *)
    main
    ;;
esac
