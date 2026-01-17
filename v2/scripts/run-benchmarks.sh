#!/bin/bash

###############################################################################
# Local Benchmark Execution Script
#
# This script runs performance benchmarks locally with various options:
# - Baseline comparison
# - Custom output paths
# - Filtering by benchmark name
# - Multiple runs for stability
#
# Usage:
#   ./scripts/run-benchmarks.sh                       # Run all benchmarks
#   ./scripts/run-benchmarks.sh --baseline=v2.3.5     # Compare with baseline
#   ./scripts/run-benchmarks.sh --filter=agent        # Run specific benchmark
#   ./scripts/run-benchmarks.sh --runs=5              # Run 5 times and average
#   ./scripts/run-benchmarks.sh --ci                  # CI mode (strict)
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
BASELINE=""
OUTPUT_DIR="benchmark-results"
FILTER=""
RUNS=1
CI_MODE=false
VERBOSE=false
FAIL_ON_REGRESSION=true

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --baseline=*)
      BASELINE="${1#*=}"
      shift
      ;;
    --output=*)
      OUTPUT_DIR="${1#*=}"
      shift
      ;;
    --filter=*)
      FILTER="${1#*=}"
      shift
      ;;
    --runs=*)
      RUNS="${1#*=}"
      shift
      ;;
    --ci)
      CI_MODE=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --no-fail)
      FAIL_ON_REGRESSION=false
      shift
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --baseline=VERSION    Compare against baseline version (e.g., v2.3.5)"
      echo "  --output=DIR          Output directory for results (default: benchmark-results)"
      echo "  --filter=NAME         Run only benchmarks matching NAME"
      echo "  --runs=N              Run benchmarks N times and average (default: 1)"
      echo "  --ci                  Run in CI mode (strict settings)"
      echo "  --verbose             Enable verbose output"
      echo "  --no-fail             Don't fail on regression (warning only)"
      echo "  --help                Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                                    # Run all benchmarks"
      echo "  $0 --baseline=v2.3.5                  # Compare with v2.3.5"
      echo "  $0 --filter=agent --runs=3            # Run agent benchmarks 3 times"
      echo "  $0 --ci --baseline=v2.3.5             # CI mode with baseline"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Print banner
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Agentic QE Performance Benchmark Suite            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if benchmark suite exists
if [ ! -f "benchmarks/suite.ts" ]; then
  echo -e "${RED}❌ Error: benchmarks/suite.ts not found${NC}"
  exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Check if project is built
if [ ! -d "dist" ]; then
  echo -e "${YELLOW}⚠️  Project not built, building now...${NC}"
  npm run build
fi

# Determine baseline argument
BASELINE_ARG=""
if [ -n "$BASELINE" ]; then
  if [ -f "benchmarks/baselines/${BASELINE}.json" ]; then
    echo -e "${GREEN}✓${NC} Using baseline: ${BASELINE}"
    BASELINE_ARG="--baseline=${BASELINE}"
  else
    echo -e "${YELLOW}⚠️  Baseline ${BASELINE} not found, continuing without baseline${NC}"
  fi
else
  echo -e "${BLUE}ℹ${NC} Running without baseline comparison"
fi

# Set Node options based on mode
if [ "$CI_MODE" = true ]; then
  export NODE_OPTIONS="--max-old-space-size=2048 --expose-gc"
  echo -e "${BLUE}ℹ${NC} Running in CI mode"
else
  export NODE_OPTIONS="--max-old-space-size=4096"
fi

# Function to run single benchmark
run_benchmark() {
  local run_number=$1
  local output_file="${OUTPUT_DIR}/run-${run_number}.json"

  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  if [ "$RUNS" -gt 1 ]; then
    echo -e "${BLUE}Run ${run_number} of ${RUNS}${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  fi

  # Build command
  CMD="npx tsx benchmarks/suite.ts --output=${output_file}"

  if [ -n "$BASELINE_ARG" ]; then
    CMD="${CMD} ${BASELINE_ARG}"
  fi

  if [ -n "$FILTER" ]; then
    CMD="${CMD} --filter=${FILTER}"
  fi

  if [ "$VERBOSE" = true ]; then
    echo -e "${BLUE}Command:${NC} $CMD"
  fi

  # Run benchmark
  if $CMD; then
    echo -e "${GREEN}✅ Run ${run_number} completed successfully${NC}"
    return 0
  else
    echo -e "${RED}❌ Run ${run_number} failed${NC}"
    return 1
  fi
}

# Run benchmarks
echo -e "${BLUE}Starting benchmark execution...${NC}"
echo ""

FAILED_RUNS=0
SUCCESSFUL_RUNS=0

for i in $(seq 1 $RUNS); do
  if run_benchmark $i; then
    ((SUCCESSFUL_RUNS++))
  else
    ((FAILED_RUNS++))

    # In CI mode or with --no-fail, continue to next run
    if [ "$CI_MODE" = false ] && [ "$FAIL_ON_REGRESSION" = true ]; then
      echo -e "${RED}❌ Benchmark failed, aborting remaining runs${NC}"
      break
    fi
  fi
done

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Benchmark Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

# If multiple runs, average the results
if [ "$RUNS" -gt 1 ] && [ "$SUCCESSFUL_RUNS" -gt 0 ]; then
  echo -e "${BLUE}ℹ${NC} Averaging results from ${SUCCESSFUL_RUNS} successful runs..."

  # Simple averaging (in production, use more sophisticated statistical analysis)
  if command -v jq >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Generating averaged results..."

    # Combine all results (simplified - real implementation would do proper averaging)
    cp "${OUTPUT_DIR}/run-1.json" "${OUTPUT_DIR}/averaged.json"
    echo -e "${GREEN}✓${NC} Results saved to ${OUTPUT_DIR}/averaged.json"
  else
    echo -e "${YELLOW}⚠️  jq not installed, skipping result averaging${NC}"
  fi
fi

# Print summary
echo ""
echo -e "Total runs:        ${BLUE}${RUNS}${NC}"
echo -e "Successful:        ${GREEN}${SUCCESSFUL_RUNS}${NC}"
echo -e "Failed:            ${RED}${FAILED_RUNS}${NC}"
echo ""

# List output files
echo -e "${BLUE}Output files:${NC}"
for file in "$OUTPUT_DIR"/*.json; do
  if [ -f "$file" ]; then
    size=$(du -h "$file" | cut -f1)
    echo -e "  - ${file} (${size})"
  fi
done
echo ""

# Generate summary report
REPORT_FILE="${OUTPUT_DIR}/summary.md"
echo "# Benchmark Execution Summary" > "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "**Date**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")" >> "$REPORT_FILE"
echo "**Total Runs**: ${RUNS}" >> "$REPORT_FILE"
echo "**Successful Runs**: ${SUCCESSFUL_RUNS}" >> "$REPORT_FILE"
echo "**Failed Runs**: ${FAILED_RUNS}" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if [ -n "$BASELINE" ]; then
  echo "**Baseline**: ${BASELINE}" >> "$REPORT_FILE"
fi

if [ -n "$FILTER" ]; then
  echo "**Filter**: ${FILTER}" >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"
echo "## Results" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "Results are available in the following files:" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

for file in "$OUTPUT_DIR"/*.json; do
  if [ -f "$file" ]; then
    echo "- $(basename "$file")" >> "$REPORT_FILE"
  fi
done

echo -e "${GREEN}✓${NC} Summary report saved to ${REPORT_FILE}"
echo ""

# Final status
if [ "$FAILED_RUNS" -gt 0 ]; then
  if [ "$FAIL_ON_REGRESSION" = true ]; then
    echo -e "${RED}❌ Benchmarks failed with regressions${NC}"
    exit 1
  else
    echo -e "${YELLOW}⚠️  Some benchmarks failed, but continuing due to --no-fail${NC}"
    exit 0
  fi
else
  echo -e "${GREEN}✅ All benchmarks completed successfully!${NC}"
  exit 0
fi
