#!/bin/bash
# SFDIPOT Assessment Post-Write Validation Hook
# Runs after any Write to product-factors-assessments directory
# Usage: Called by Claude Code PostToolUse hook

FILE_PATH="$1"

# Only validate SFDIPOT assessment HTML files
if [[ "$FILE_PATH" == *"product-factors-assessments"* ]] && [[ "$FILE_PATH" == *.html ]]; then
    echo "🔍 Validating SFDIPOT assessment: $(basename "$FILE_PATH")"

    # Run the validator (exit code determines pass/fail)
    if npx tsx scripts/validate-sfdipot-assessment.ts "$FILE_PATH" 2>&1; then
        echo "✅ SFDIPOT validation PASSED"
        # Store success in memory
        node -e "
            const db = require('better-sqlite3')('.agentic-qe/memory.db');
            try {
                db.prepare('INSERT OR REPLACE INTO patterns (key, pattern, domain, confidence) VALUES (?, ?, ?, ?)').run(
                    'sfdipot-validation-' + Date.now(),
                    'Assessment passed all gates: $(basename "$FILE_PATH")',
                    'sfdipot-validation',
                    1.0
                );
                db.close();
            } catch(e) {}
        " 2>/dev/null || true
    else
        echo "❌ SFDIPOT validation FAILED - See errors above"
        echo "⚠️  The assessment output does not meet quality gates!"
        # Store failure in memory
        node -e "
            const db = require('better-sqlite3')('.agentic-qe/memory.db');
            try {
                db.prepare('INSERT OR REPLACE INTO patterns (key, pattern, domain, confidence) VALUES (?, ?, ?, ?)').run(
                    'sfdipot-validation-' + Date.now(),
                    'Assessment FAILED gates: $(basename "$FILE_PATH")',
                    'sfdipot-validation',
                    0.0
                );
                db.close();
            } catch(e) {}
        " 2>/dev/null || true
    fi
fi
