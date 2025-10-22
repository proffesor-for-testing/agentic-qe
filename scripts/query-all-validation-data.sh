#!/bin/bash
# Query All Validation Data from SwarmMemoryManager

echo "=========================================="
echo "COMPREHENSIVE STABILITY VALIDATION DATA"
echo "=========================================="
echo ""

echo "1. ORCHESTRATOR STATUS"
echo "----------------------"
npx ts-node scripts/query-aqe-memory.ts --key "aqe/validation/orchestrator-initialized" --partition coordination
echo ""

echo "2. CHECKPOINT 1"
echo "---------------"
npx ts-node scripts/query-aqe-memory.ts --key "aqe/validation/checkpoint-1" --partition coordination
echo ""

echo "3. GO CRITERIA"
echo "--------------"
npx ts-node scripts/query-aqe-memory.ts --key "aqe/validation/go-criteria" --partition coordination
echo ""

echo "4. WORKSTREAM STATUS"
echo "--------------------"
echo "Quick Fixes:"
npx ts-node scripts/query-aqe-memory.ts --key "tasks/QUICK-FIXES-SUMMARY/status" --partition coordination 2>/dev/null || echo "  No data yet"
echo ""

echo "Test Suite Batch 2:"
npx ts-node scripts/query-aqe-memory.ts --key "tasks/BATCH-002/status" --partition coordination 2>/dev/null || echo "  No data yet"
echo ""

echo "Test Suite Batch 3:"
npx ts-node scripts/query-aqe-memory.ts --key "tasks/BATCH-003/status" --partition coordination 2>/dev/null || echo "  No data yet"
echo ""

echo "Test Suite Batch 4:"
npx ts-node scripts/query-aqe-memory.ts --key "tasks/BATCH-004/status" --partition coordination 2>/dev/null || echo "  No data yet"
echo ""

echo "Coverage Phase 2:"
npx ts-node scripts/query-aqe-memory.ts --key "aqe/coverage/phase-2-complete" --partition coordination 2>/dev/null || echo "  No data yet"
echo ""

echo "Coverage Phase 3:"
npx ts-node scripts/query-aqe-memory.ts --key "aqe/coverage/phase-3-complete" --partition coordination 2>/dev/null || echo "  No data yet"
echo ""

echo "Coverage Phase 4:"
npx ts-node scripts/query-aqe-memory.ts --key "aqe/coverage/phase-4-complete" --partition coordination 2>/dev/null || echo "  No data yet"
echo ""

echo "Integration Suite 1:"
npx ts-node scripts/query-aqe-memory.ts --key "tasks/INTEGRATION-SUITE-001/status" --partition coordination 2>/dev/null || echo "  No data yet"
echo ""

echo "Integration Suite 2:"
npx ts-node scripts/query-aqe-memory.ts --key "tasks/INTEGRATION-SUITE-002/status" --partition coordination 2>/dev/null || echo "  No data yet"
echo ""

echo "5. VALIDATION METRICS"
echo "---------------------"
npx ts-node scripts/query-aqe-memory.ts --key "metrics/validation_checkpoint_1" --partition metrics 2>/dev/null || echo "  No metrics yet"
echo ""

echo "=========================================="
echo "END OF VALIDATION DATA"
echo "=========================================="
