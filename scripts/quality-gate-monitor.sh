#!/bin/bash

# Quality Gate Monitoring Script
# Continuously monitors quality metrics and reports progress

AQE_DIR="/workspaces/agentic-qe-cf/agentic-qe"
NAMESPACE="aqe-remediation"

cd "$AQE_DIR"

echo "🔍 QUALITY GATE VALIDATOR - Continuous Monitoring"
echo "================================================="
echo "Target Directory: $AQE_DIR"
echo "Memory Namespace: $NAMESPACE"
echo "Timestamp: $(date)"
echo ""

# Function to run TypeScript check and count errors
check_typescript() {
    echo "📝 TypeScript Compilation Check..."
    local error_count=$(npm run typecheck 2>&1 | grep -E "error TS[0-9]+" | wc -l)
    echo "   Errors found: $error_count"

    # Store in memory
    npx claude-flow@alpha memory store "typescript-status" "{\"timestamp\":\"$(date -Iseconds)\",\"errors\":$error_count,\"target\":0}" --namespace "$NAMESPACE" 2>/dev/null

    if [ "$error_count" -eq 0 ]; then
        echo "   ✅ PASSED - No TypeScript errors"
        return 0
    else
        echo "   ❌ FAILED - $error_count errors remaining"
        return 1
    fi
}

# Function to run tests and get pass rate
check_tests() {
    echo "🧪 Test Suite Execution..."
    local test_output=$(npm test 2>&1)
    local passed=$(echo "$test_output" | grep "Tests:" | grep -o "[0-9]* passed" | grep -o "[0-9]*" || echo "0")
    local failed=$(echo "$test_output" | grep "Tests:" | grep -o "[0-9]* failed" | grep -o "[0-9]*" || echo "0")
    local total=$((passed + failed))
    local pass_rate=0

    if [ "$total" -gt 0 ]; then
        pass_rate=$(echo "scale=1; $passed * 100 / $total" | bc -l 2>/dev/null || echo "0")
    fi

    echo "   Passed: $passed"
    echo "   Failed: $failed"
    echo "   Pass Rate: ${pass_rate}%"

    # Store in memory
    npx claude-flow@alpha memory store "test-status" "{\"timestamp\":\"$(date -Iseconds)\",\"passed\":$passed,\"failed\":$failed,\"pass_rate\":\"${pass_rate}%\",\"target\":\"95%\"}" --namespace "$NAMESPACE" 2>/dev/null

    local pass_rate_num=$(echo "$pass_rate" | sed 's/%//')
    if (( $(echo "$pass_rate_num >= 95" | bc -l 2>/dev/null || echo "0") )); then
        echo "   ✅ PASSED - Test pass rate meets target (95%)"
        return 0
    else
        echo "   ❌ FAILED - Pass rate ${pass_rate}% below target (95%)"
        return 1
    fi
}

# Function to check security vulnerabilities
check_security() {
    echo "🔒 Security Audit..."
    local vulnerabilities=$(npm audit 2>&1 | grep -E "found [0-9]+ vulnerabilit" | grep -o "[0-9]*" | head -1 || echo "0")

    echo "   Vulnerabilities: $vulnerabilities"

    # Store in memory
    npx claude-flow@alpha memory store "security-status" "{\"timestamp\":\"$(date -Iseconds)\",\"vulnerabilities\":$vulnerabilities,\"target\":0,\"score\":$((100 - vulnerabilities * 5))}" --namespace "$NAMESPACE" 2>/dev/null

    if [ "$vulnerabilities" -eq 0 ]; then
        echo "   ✅ PASSED - No security vulnerabilities"
        return 0
    else
        echo "   ⚠️  WARNING - $vulnerabilities vulnerabilities found"
        return 1
    fi
}

# Function to generate overall quality report
generate_report() {
    echo ""
    echo "📈 QUALITY GATE STATUS SUMMARY"
    echo "=============================="

    local typescript_ok=$(check_typescript >/dev/null 2>&1 && echo "✅" || echo "❌")
    local tests_ok=$(check_tests >/dev/null 2>&1 && echo "✅" || echo "❌")
    local security_ok=$(check_security >/dev/null 2>&1 && echo "✅" || echo "❌")

    echo "TypeScript Compilation: $typescript_ok"
    echo "Test Pass Rate (95%):   $tests_ok"
    echo "Security (No Vulns):    $security_ok"
    echo "Coverage (87%):         ℹ️"
    echo "Performance (A-):       ℹ️"

    # Calculate overall status
    local gates_passed=0
    [ "$typescript_ok" = "✅" ] && ((gates_passed++))
    [ "$tests_ok" = "✅" ] && ((gates_passed++))
    [ "$security_ok" = "✅" ] && ((gates_passed++))

    echo ""
    echo "Gates Passed: $gates_passed/5"

    if [ "$gates_passed" -eq 5 ]; then
        echo "🎉 ALL QUALITY GATES PASSED!"
        npx claude-flow@alpha memory store "overall-status" "{\"timestamp\":\"$(date -Iseconds)\",\"status\":\"PASSED\",\"gates_passed\":$gates_passed,\"gates_total\":5}" --namespace "$NAMESPACE" 2>/dev/null
    elif [ "$gates_passed" -ge 3 ]; then
        echo "⚠️  PARTIAL - Some gates need attention"
        npx claude-flow@alpha memory store "overall-status" "{\"timestamp\":\"$(date -Iseconds)\",\"status\":\"PARTIAL\",\"gates_passed\":$gates_passed,\"gates_total\":5}" --namespace "$NAMESPACE" 2>/dev/null
    else
        echo "❌ CRITICAL - Major remediation needed"
        npx claude-flow@alpha memory store "overall-status" "{\"timestamp\":\"$(date -Iseconds)\",\"status\":\"CRITICAL\",\"gates_passed\":$gates_passed,\"gates_total\":5}" --namespace "$NAMESPACE" 2>/dev/null
    fi
}

# Main monitoring execution
echo "Starting quality gate validation..."
echo ""

check_typescript
echo ""
check_tests
echo ""
check_security
echo ""
generate_report

echo ""
echo "✅ Monitoring complete - Results stored in memory namespace: $NAMESPACE"