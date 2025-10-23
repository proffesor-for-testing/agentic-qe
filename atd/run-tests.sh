#!/bin/bash

# Agile Testing Days E2E Test Execution Script
# This script provides convenient commands for running tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Agile Testing Days E2E Tests${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Dependencies not installed. Running npm install...${NC}"
    npm install
    echo -e "${GREEN}Dependencies installed successfully!${NC}"
    echo ""
fi

# Check if Playwright browsers are installed
if [ ! -d "node_modules/@playwright/test" ]; then
    echo -e "${YELLOW}Installing Playwright browsers...${NC}"
    npx playwright install chromium
    echo -e "${GREEN}Playwright browsers installed!${NC}"
    echo ""
fi

# Display menu
echo "Select test execution mode:"
echo ""
echo "1) Smoke Tests (Quick validation - ~2-3 minutes)"
echo "2) Critical Tests (P0 - Critical path - ~5-10 minutes)"
echo "3) P0 + P1 Tests (High priority - ~10-15 minutes)"
echo "4) Full Test Suite (All tests - ~15-20 minutes)"
echo "5) Specific Test File"
echo "6) Debug Mode (Interactive)"
echo "7) UI Mode (Interactive test runner)"
echo "8) Generate Test Report"
echo "9) Exit"
echo ""
read -p "Enter your choice (1-9): " choice

case $choice in
    1)
        echo -e "${GREEN}Running Smoke Tests...${NC}"
        npm run test:smoke
        ;;
    2)
        echo -e "${GREEN}Running Critical (P0) Tests...${NC}"
        npm run test:p0
        ;;
    3)
        echo -e "${GREEN}Running P0 + P1 Tests...${NC}"
        npx playwright test --grep "@p0|@p1"
        ;;
    4)
        echo -e "${GREEN}Running Full Test Suite...${NC}"
        npm test
        ;;
    5)
        echo ""
        echo "Available test files:"
        echo "  1) navigation.spec.ts"
        echo "  2) registration.spec.ts"
        echo "  3) payment.spec.ts"
        echo "  4) newsletter.spec.ts"
        echo "  5) login.spec.ts"
        echo "  6) faq.spec.ts"
        echo "  7) call-for-papers.spec.ts"
        echo "  8) speakers.spec.ts"
        echo "  9) external-links.spec.ts"
        echo ""
        read -p "Enter file number (1-9): " file_choice

        case $file_choice in
            1) npx playwright test tests/navigation.spec.ts ;;
            2) npx playwright test tests/registration.spec.ts ;;
            3) npx playwright test tests/payment.spec.ts ;;
            4) npx playwright test tests/newsletter.spec.ts ;;
            5) npx playwright test tests/login.spec.ts ;;
            6) npx playwright test tests/faq.spec.ts ;;
            7) npx playwright test tests/call-for-papers.spec.ts ;;
            8) npx playwright test tests/speakers.spec.ts ;;
            9) npx playwright test tests/external-links.spec.ts ;;
            *) echo -e "${RED}Invalid choice${NC}" ;;
        esac
        ;;
    6)
        echo -e "${GREEN}Starting Debug Mode...${NC}"
        npm run test:debug
        ;;
    7)
        echo -e "${GREEN}Starting UI Mode...${NC}"
        npm run test:ui
        ;;
    8)
        echo -e "${GREEN}Generating Test Report...${NC}"
        npm run report
        ;;
    9)
        echo -e "${GREEN}Exiting...${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid choice. Please run the script again.${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Test execution completed!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "View results:"
echo "  - HTML Report: npm run report"
echo "  - Console output above"
echo ""
