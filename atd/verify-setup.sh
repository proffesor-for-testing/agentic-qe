#!/bin/bash

# Verification script for Agile Testing Days E2E Test Suite
# Checks that all files are present and setup is correct

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Setup Verification${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

# Counter for checks
total_checks=0
passed_checks=0

# Function to check if file exists
check_file() {
    total_checks=$((total_checks + 1))
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        passed_checks=$((passed_checks + 1))
        return 0
    else
        echo -e "${RED}✗${NC} $1 - MISSING"
        return 1
    fi
}

# Function to check if directory exists
check_dir() {
    total_checks=$((total_checks + 1))
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1/"
        passed_checks=$((passed_checks + 1))
        return 0
    else
        echo -e "${RED}✗${NC} $1/ - MISSING"
        return 1
    fi
}

echo "Checking directory structure..."
check_dir "tests"
check_dir "page-objects"
check_dir "fixtures"
check_dir "utils"
echo ""

echo "Checking configuration files..."
check_file "playwright.config.ts"
check_file "package.json"
check_file "tsconfig.json"
check_file ".env.example"
check_file ".gitignore"
echo ""

echo "Checking test specifications..."
check_file "tests/navigation.spec.ts"
check_file "tests/registration.spec.ts"
check_file "tests/payment.spec.ts"
check_file "tests/newsletter.spec.ts"
check_file "tests/login.spec.ts"
check_file "tests/faq.spec.ts"
check_file "tests/call-for-papers.spec.ts"
check_file "tests/speakers.spec.ts"
check_file "tests/external-links.spec.ts"
echo ""

echo "Checking page objects..."
check_file "page-objects/BasePage.ts"
check_file "page-objects/HomePage.ts"
check_file "page-objects/RegistrationPage.ts"
check_file "page-objects/PaymentPage.ts"
check_file "page-objects/LoginPage.ts"
check_file "page-objects/index.ts"
echo ""

echo "Checking fixtures and utilities..."
check_file "fixtures/test-data.ts"
check_file "fixtures/user-factory.ts"
check_file "utils/test-helpers.ts"
echo ""

echo "Checking documentation..."
check_file "README.md"
check_file "TEST-SUITE-SUMMARY.md"
echo ""

# Check Node.js
echo "Checking Node.js installation..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js installed: $NODE_VERSION"
    passed_checks=$((passed_checks + 1))
else
    echo -e "${RED}✗${NC} Node.js not found"
fi
total_checks=$((total_checks + 1))
echo ""

# Check npm
echo "Checking npm installation..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓${NC} npm installed: $NPM_VERSION"
    passed_checks=$((passed_checks + 1))
else
    echo -e "${RED}✗${NC} npm not found"
fi
total_checks=$((total_checks + 1))
echo ""

# Check dependencies
echo "Checking dependencies..."
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} node_modules directory exists"
    passed_checks=$((passed_checks + 1))
else
    echo -e "${YELLOW}⚠${NC} node_modules not found - run 'npm install'"
fi
total_checks=$((total_checks + 1))
echo ""

# Summary
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Verification Summary${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "Total checks: $total_checks"
echo -e "Passed: ${GREEN}$passed_checks${NC}"
echo -e "Failed: ${RED}$((total_checks - passed_checks))${NC}"
echo ""

if [ $passed_checks -eq $total_checks ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Install dependencies: npm install"
    echo "  2. Install Playwright: npx playwright install chromium"
    echo "  3. Run tests: npm run test:smoke"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some checks failed${NC}"
    echo ""
    echo "Please ensure all files are present and try again."
    echo ""
    exit 1
fi
