#!/usr/bin/env bash
#
# Adidas Order-to-Cash — Demo Walkthrough Runner
#
# Handles Xvfb setup for headed mode, starts services if needed,
# runs the Playwright walkthrough, and cleans up.
#
# Usage:
#   ./run-demo-walkthrough.sh                  # headless (default)
#   ./run-demo-walkthrough.sh --headed         # headed with auto-Xvfb
#   ./run-demo-walkthrough.sh --video          # with video recording
#   ./run-demo-walkthrough.sh --headed --video --slow-mo 500
#
# If you have a real display (VNC/noVNC), export DISPLAY first:
#   export DISPLAY=:1
#   ./run-demo-walkthrough.sh --headed
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
XVFB_PID=""
SERVICES_PID=""
XVFB_DISPLAY=":99"

# ── Helpers ──────────────────────────────────────────────────────────────

cleanup() {
  if [[ -n "$XVFB_PID" ]]; then
    echo "  Stopping Xvfb (PID $XVFB_PID)..."
    kill "$XVFB_PID" 2>/dev/null || true
    wait "$XVFB_PID" 2>/dev/null || true
  fi
  if [[ -n "$SERVICES_PID" ]]; then
    echo "  Stopping services (PID $SERVICES_PID)..."
    kill "$SERVICES_PID" 2>/dev/null || true
    wait "$SERVICES_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

needs_headed() {
  for arg in "$@"; do
    [[ "$arg" == "--headed" ]] && return 0
  done
  return 1
}

has_display() {
  [[ -n "${DISPLAY:-}" ]]
}

services_running() {
  curl -sf http://localhost:3001/health >/dev/null 2>&1
}

# ── Pre-flight: Playwright browsers ─────────────────────────────────────

if [[ ! -d "$HOME/.cache/ms-playwright/chromium-1208" && ! -d "$HOME/.cache/ms-playwright/chromium-1200" ]]; then
  echo "  Installing Playwright Chromium..."
  npx playwright install chromium
fi

# ── Start services if not running ────────────────────────────────────────

if ! services_running; then
  echo "  Starting services..."
  cd "$SCRIPT_DIR"
  npx tsx services/start-all.ts &
  SERVICES_PID=$!

  # Wait for services to come up
  echo -n "  Waiting for services"
  for i in $(seq 1 30); do
    if services_running; then
      echo " ready!"
      break
    fi
    echo -n "."
    sleep 1
  done

  if ! services_running; then
    echo " FAILED — services did not start within 30s"
    exit 1
  fi
else
  echo "  Services already running."
fi

# ── Xvfb setup (only for --headed without a real display) ───────────────

if needs_headed "$@" && ! has_display; then
  echo "  No DISPLAY detected — starting Xvfb on $XVFB_DISPLAY..."

  if ! command -v Xvfb >/dev/null 2>&1; then
    echo "  ERROR: Xvfb not installed. Install with: sudo apt-get install -y xvfb"
    exit 1
  fi

  Xvfb "$XVFB_DISPLAY" -screen 0 1280x900x24 -ac +extension GLX +render -noreset &
  XVFB_PID=$!
  sleep 1

  # Verify Xvfb started
  if ! kill -0 "$XVFB_PID" 2>/dev/null; then
    echo "  ERROR: Xvfb failed to start"
    exit 1
  fi

  export DISPLAY="$XVFB_DISPLAY"
  echo "  Xvfb running on DISPLAY=$DISPLAY (PID $XVFB_PID)"

elif needs_headed "$@" && has_display; then
  echo "  Using existing DISPLAY=$DISPLAY"
fi

# ── Run the walkthrough ─────────────────────────────────────────────────

echo ""
cd "$SCRIPT_DIR"
npx tsx demo-walkthrough.ts "$@"
EXIT_CODE=$?

# ── Report ───────────────────────────────────────────────────────────────

echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
  SCREENSHOT_COUNT=$(ls -1 "$SCRIPT_DIR/screenshots/"*.png 2>/dev/null | wc -l)
  echo "  $SCREENSHOT_COUNT screenshots saved to: $SCRIPT_DIR/screenshots/"
  ls -1 "$SCRIPT_DIR/screenshots/"*.png 2>/dev/null | while read f; do
    SIZE=$(du -h "$f" | cut -f1)
    echo "    $(basename "$f") ($SIZE)"
  done

  if ls "$SCRIPT_DIR/screenshots/video/"*.webm >/dev/null 2>&1; then
    echo ""
    echo "  Video recordings:"
    ls -1 "$SCRIPT_DIR/screenshots/video/"*.webm | while read f; do
      SIZE=$(du -h "$f" | cut -f1)
      echo "    $(basename "$f") ($SIZE)"
    done
  fi
fi

echo ""
exit $EXIT_CODE
