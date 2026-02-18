#!/bin/bash
#
# QCSD Production Telemetry Collection Script
# Collects DORA-approximation metrics from GitHub API for npm package releases.
#
# Usage: ./scripts/collect-production-telemetry.sh [OPTIONS]
#
# Options:
#   --release-id <version>   Release version (default: latest tag)
#   --lookback <days>        Days of history to analyze (default: 30)
#   --output <path>          Output directory (default: docs/telemetry/production)
#   --trigger-type <type>    Trigger context: post-deploy|scheduled|manual (default: manual)
#
# Environment:
#   GITHUB_REPOSITORY        Owner/repo (default: auto-detect from git remote)
#   GH_TOKEN / GITHUB_TOKEN  GitHub authentication (gh CLI must be authenticated)
#
# Designed to run in GitHub Actions or locally with gh CLI.
# Individual API failures produce null fields, not script crash.

# Note: no set -e — individual commands use || fallbacks for error tolerance

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ─── Defaults ─────────────────────────────────────────────────────────────────
RELEASE_ID="auto"
LOOKBACK_DAYS=30
OUTPUT_DIR="docs/telemetry/production"
TRIGGER_TYPE="manual"
REPO="${GITHUB_REPOSITORY:-""}"

# ─── Parse Arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --release-id) RELEASE_ID="$2"; shift 2 ;;
    --lookback)   LOOKBACK_DAYS="$2"; shift 2 ;;
    --output)     OUTPUT_DIR="$2"; shift 2 ;;
    --trigger-type) TRIGGER_TYPE="$2"; shift 2 ;;
    *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
done

# ─── Auto-detect repo ────────────────────────────────────────────────────────
if [ -z "$REPO" ]; then
  REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null || echo "")
  if [ -z "$REPO" ]; then
    echo -e "${RED}ERROR: Cannot detect repository. Set GITHUB_REPOSITORY or run from a git repo with gh auth.${NC}"
    exit 1
  fi
fi

# ─── Auto-detect release ID ──────────────────────────────────────────────────
if [ "$RELEASE_ID" = "auto" ]; then
  RELEASE_ID=$(gh release view --repo "$REPO" --json tagName -q '.tagName' 2>/dev/null || echo "unknown")
fi

# ─── Calculate date boundaries ────────────────────────────────────────────────
# macOS and Linux compatible date calculation
if date -v-1d > /dev/null 2>&1; then
  SINCE_DATE=$(date -u -v-${LOOKBACK_DAYS}d +%Y-%m-%dT%H:%M:%SZ)
else
  SINCE_DATE=$(date -u -d "${LOOKBACK_DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ)
fi
COLLECTION_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DATE_STAMP=$(date -u +%Y%m%d)

echo "========================================"
echo -e "${BLUE}QCSD Production Telemetry Collection${NC}"
echo "========================================"
echo "Repository:   $REPO"
echo "Release:      $RELEASE_ID"
echo "Lookback:     ${LOOKBACK_DAYS} days (since $SINCE_DATE)"
echo "Output:       $OUTPUT_DIR"
echo "Trigger:      $TRIGGER_TYPE"
echo "========================================"
echo ""

# ─── Helper: safe API call ────────────────────────────────────────────────────
safe_api() {
  local result
  if result=$("$@" 2>/dev/null); then
    echo "$result"
  else
    echo "null"
  fi
}

# ─── 1. Deployment Frequency ─────────────────────────────────────────────────
echo -e "${BLUE}[1/5]${NC} Collecting deployment frequency..."

RELEASE_DATA=$(safe_api gh api "repos/${REPO}/releases?per_page=100" --paginate --jq "[.[] | select(.published_at >= \"${SINCE_DATE}\") | {tag: .tag_name, published: .published_at, created: .created_at}]")

if [ "$RELEASE_DATA" != "null" ] && [ -n "$RELEASE_DATA" ]; then
  RELEASE_COUNT=$(echo "$RELEASE_DATA" | jq 'length')
  FREQ_PER_WEEK=$(echo "scale=2; $RELEASE_COUNT * 7 / $LOOKBACK_DAYS" | bc 2>/dev/null || echo "null")
  echo -e "  ${GREEN}Found $RELEASE_COUNT releases in ${LOOKBACK_DAYS}d ($FREQ_PER_WEEK/week)${NC}"
else
  RELEASE_COUNT=0
  FREQ_PER_WEEK="null"
  RELEASE_DATA="[]"
  echo -e "  ${YELLOW}No release data available${NC}"
fi

# ─── 2. Lead Time for Changes ────────────────────────────────────────────────
echo -e "${BLUE}[2/5]${NC} Computing lead time..."

if [ "$RELEASE_DATA" != "[]" ] && [ "$RELEASE_DATA" != "null" ]; then
  LEAD_TIMES=$(echo "$RELEASE_DATA" | jq '[.[] | {
    tag: .tag,
    created: .created,
    published: .published,
    lead_hours: ((((.published | fromdateiso8601) - (.created | fromdateiso8601)) / 3600) | round)
  }]')
  MEDIAN_LEAD=$(echo "$LEAD_TIMES" | jq '[.[].lead_hours] | sort | if length > 0 then .[length/2 | floor] else null end')
  echo -e "  ${GREEN}Median lead time: ${MEDIAN_LEAD}h across $RELEASE_COUNT releases${NC}"
else
  LEAD_TIMES="[]"
  MEDIAN_LEAD="null"
  echo -e "  ${YELLOW}No lead time data (no releases)${NC}"
fi

# ─── 3. Change Failure Rate ──────────────────────────────────────────────────
echo -e "${BLUE}[3/5]${NC} Computing change failure rate..."

CFR_DATA=$(safe_api gh api "repos/${REPO}/actions/workflows/npm-publish.yml/runs?per_page=100" --jq "{
  total: [.workflow_runs[] | select(.created_at >= \"${SINCE_DATE}\")] | length,
  failed: [.workflow_runs[] | select(.created_at >= \"${SINCE_DATE}\" and .conclusion == \"failure\")] | length
}")

if [ "$CFR_DATA" != "null" ] && [ -n "$CFR_DATA" ]; then
  CFR_TOTAL=$(echo "$CFR_DATA" | jq '.total')
  CFR_FAILED=$(echo "$CFR_DATA" | jq '.failed')
  if [ "$CFR_TOTAL" -gt 0 ] 2>/dev/null; then
    CFR_RATE=$(echo "scale=1; $CFR_FAILED * 100 / $CFR_TOTAL" | bc 2>/dev/null || echo "null")
  else
    CFR_RATE=0
  fi
  echo -e "  ${GREEN}${CFR_FAILED}/${CFR_TOTAL} failed (${CFR_RATE}%)${NC}"
else
  CFR_TOTAL=0
  CFR_FAILED=0
  CFR_RATE="null"
  echo -e "  ${YELLOW}No workflow run data available${NC}"
fi

# ─── 4. MTTR Approximation ───────────────────────────────────────────────────
echo -e "${BLUE}[4/5]${NC} Computing MTTR approximation (bug issue lifecycle)..."

MTTR_DATA=$(safe_api gh api "repos/${REPO}/issues?labels=bug&state=closed&since=${SINCE_DATE}&per_page=100" --paginate --jq '[.[] | select(.pull_request == null) | {
  number: .number,
  created: .created_at,
  closed: .closed_at,
  hours: ((((.closed_at | fromdateiso8601) - (.created_at | fromdateiso8601)) / 3600) | round)
}]')

if [ "$MTTR_DATA" != "null" ] && [ -n "$MTTR_DATA" ]; then
  BUGS_CLOSED=$(echo "$MTTR_DATA" | jq 'length')
  MTTR_MEDIAN=$(echo "$MTTR_DATA" | jq '[.[].hours] | sort | if length > 0 then .[length/2 | floor] else null end')
  echo -e "  ${GREEN}${BUGS_CLOSED} bugs closed, median ${MTTR_MEDIAN}h${NC}"
else
  BUGS_CLOSED=0
  MTTR_MEDIAN="null"
  MTTR_DATA="[]"
  echo -e "  ${YELLOW}No closed bug data available${NC}"
fi

# ─── 5. Open Issues Snapshot ─────────────────────────────────────────────────
echo -e "${BLUE}[5/5]${NC} Collecting open issues snapshot..."

OPEN_BUGS=$(safe_api gh issue list --repo "${REPO}" --label bug --state open --json number --jq 'length')
OPEN_BUGS=${OPEN_BUGS:-0}
echo -e "  ${GREEN}${OPEN_BUGS} open bugs${NC}"

# ─── Build JSON Output ───────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}Building telemetry JSON...${NC}"

# Get current release context
CURRENT_RELEASE=$(safe_api gh release view "${RELEASE_ID}" --repo "${REPO}" --json tagName,publishedAt,createdAt --jq '{tag: .tagName, publishedAt: .publishedAt, createdAt: .createdAt}')
if [ "$CURRENT_RELEASE" = "null" ]; then
  CURRENT_RELEASE='{"tag": "'"$RELEASE_ID"'", "publishedAt": null, "createdAt": null}'
fi

# Recent releases list (last 5)
RECENT_RELEASES=$(safe_api gh api "repos/${REPO}/releases?per_page=5" --jq '[.[] | {tag: .tag_name, publishedAt: .published_at}]')
if [ "$RECENT_RELEASES" = "null" ]; then
  RECENT_RELEASES="[]"
fi

# Assemble final JSON
OUTPUT_JSON=$(jq -n \
  --arg ts "$COLLECTION_TS" \
  --arg rid "$RELEASE_ID" \
  --argjson lookback "$LOOKBACK_DAYS" \
  --arg trigger "$TRIGGER_TYPE" \
  --arg repo "$REPO" \
  --argjson relCount "$RELEASE_COUNT" \
  --argjson freqWeek "${FREQ_PER_WEEK:-null}" \
  --argjson leadTimes "$LEAD_TIMES" \
  --argjson medianLead "${MEDIAN_LEAD:-null}" \
  --argjson cfrTotal "$CFR_TOTAL" \
  --argjson cfrFailed "$CFR_FAILED" \
  --argjson cfrRate "${CFR_RATE:-null}" \
  --argjson bugsClosed "$BUGS_CLOSED" \
  --argjson mttrMedian "${MTTR_MEDIAN:-null}" \
  --argjson mttrData "$MTTR_DATA" \
  --argjson openBugs "${OPEN_BUGS:-0}" \
  --argjson currentRelease "$CURRENT_RELEASE" \
  --argjson recentReleases "$RECENT_RELEASES" \
  '{
    collectionTimestamp: $ts,
    releaseId: $rid,
    lookbackDays: $lookback,
    source: "github-api",
    triggerType: $trigger,
    repository: $repo,
    dora: {
      deploymentFrequency: {
        value: $freqWeek,
        unit: "per_week",
        rawCount: $relCount,
        period: "\($lookback)d"
      },
      leadTime: {
        value: $medianLead,
        unit: "hours",
        measurements: $leadTimes
      },
      changeFailureRate: {
        value: $cfrRate,
        totalRuns: $cfrTotal,
        failedRuns: $cfrFailed,
        period: "\($lookback)d"
      },
      mttr: {
        value: $mttrMedian,
        unit: "hours",
        bugsClosed: $bugsClosed,
        medianHours: $mttrMedian,
        details: $mttrData,
        period: "\($lookback)d"
      }
    },
    releaseContext: {
      currentRelease: $currentRelease,
      recentReleases: $recentReleases
    },
    issues: {
      openBugs: $openBugs,
      closedBugsInPeriod: $bugsClosed
    },
    limitations: [
      "DORA metrics are approximated from GitHub API, not from APM/observability tooling",
      "Lead time measures tag-to-publish, not commit-to-production",
      "Change failure rate uses workflow failures as proxy for production incidents",
      "MTTR uses bug issue lifecycle as proxy for incident recovery time"
    ]
  }')

# ─── Write Output ─────────────────────────────────────────────────────────────
mkdir -p "$OUTPUT_DIR"

OUTFILE="${OUTPUT_DIR}/telemetry-${RELEASE_ID}-${DATE_STAMP}.json"
LATEST="${OUTPUT_DIR}/latest.json"

echo "$OUTPUT_JSON" > "$OUTFILE"
cp "$OUTFILE" "$LATEST"

echo ""
echo "========================================"
echo -e "${GREEN}Telemetry collection complete${NC}"
echo "========================================"
echo "Output:  $OUTFILE"
echo "Latest:  $LATEST"
echo ""

# ─── Summary ──────────────────────────────────────────────────────────────────
echo -e "${BLUE}DORA Summary:${NC}"
echo "  Deployment Frequency: ${FREQ_PER_WEEK:-?}/week ($RELEASE_COUNT releases in ${LOOKBACK_DAYS}d)"
echo "  Lead Time:            ${MEDIAN_LEAD:-?}h median"
echo "  Change Failure Rate:  ${CFR_RATE:-?}% ($CFR_FAILED/$CFR_TOTAL)"
echo "  MTTR:                 ${MTTR_MEDIAN:-?}h median ($BUGS_CLOSED bugs)"
echo "  Open Bugs:            $OPEN_BUGS"
echo ""
echo -e "${BLUE}Invoke production swarm:${NC}"
echo "  /qcsd-production-swarm TELEMETRY_DATA=$LATEST RELEASE_ID=$RELEASE_ID"
