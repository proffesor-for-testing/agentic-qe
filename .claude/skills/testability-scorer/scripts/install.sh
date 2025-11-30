#!/bin/bash
# Testability Scorer - Installation Script

set -e

echo "🚀 Installing Testability Scorer..."

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Error: Node.js 18+ required (found v$NODE_VERSION)"
  exit 1
fi

echo "✓ Node.js version check passed"

# Install Playwright
echo "📦 Installing Playwright..."
npm install --save-dev @playwright/test

# Install Playwright browsers
echo "🌐 Installing Playwright browsers..."
npx playwright install chromium firefox webkit

# Install dependencies
echo "📦 Installing additional dependencies..."
npm install --save-dev chart.js

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p tests/testability-scorer
mkdir -p tests/reports
mkdir -p .testability-history

# Copy templates
echo "📋 Setting up templates..."
if [ -d ".claude/skills/testability-scorer/resources/templates" ]; then
  cp .claude/skills/testability-scorer/resources/templates/*.js tests/testability-scorer/ 2>/dev/null || true
fi

# Set permissions
chmod +x .claude/skills/testability-scorer/scripts/*.sh

echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Configure your application URL in tests/testability-scorer/config.js"
echo "  2. Run quick assessment: ./scripts/quick-check.sh"
echo "  3. Run full assessment: ./scripts/run-assessment.sh"
