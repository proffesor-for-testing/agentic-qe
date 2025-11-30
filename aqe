#!/usr/bin/env bash
# AQE local wrapper - ensures aqe runs from project directory

PROJECT_DIR="${PWD}"
export PWD="${PROJECT_DIR}"
export AQE_WORKING_DIR="${PROJECT_DIR}"

# Try local node_modules first
if [ -f "${PROJECT_DIR}/node_modules/.bin/aqe" ]; then
  exec "${PROJECT_DIR}/node_modules/.bin/aqe" "$@"
# Try parent node_modules (monorepo)
elif [ -f "${PROJECT_DIR}/../node_modules/.bin/aqe" ]; then
  exec "${PROJECT_DIR}/../node_modules/.bin/aqe" "$@"
# Try global installation
elif command -v aqe &> /dev/null; then
  exec aqe "$@"
# Fallback to npx
else
  exec npx aqe@latest "$@"
fi
