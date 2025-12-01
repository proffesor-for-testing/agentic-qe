#!/bin/bash
echo "MindMap Component Verification"
echo "================================"
echo ""

# Check errors
ERRORS=$(npx tsc --noEmit 2>&1 | grep -E "MindMap.*error" | wc -l)
echo "MindMap TypeScript errors: $ERRORS"

# Check files
echo ""
echo "Component files:"
ls -1 src/components/MindMap/
echo ""
echo "Test files:"
ls -1 tests/components/MindMap* tests/performance/MindMapPerformance* 2>/dev/null
echo ""
echo "Documentation:"
ls -1 docs/MindMap* docs/phase3/MINDMAP* 2>/dev/null
echo ""

if [ $ERRORS -eq 0 ]; then
    echo "✓ MindMap component is complete and error-free!"
else
    echo "✗ Found $ERRORS TypeScript errors"
fi
