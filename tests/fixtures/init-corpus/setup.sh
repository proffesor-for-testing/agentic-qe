#!/usr/bin/env bash
#
# tests/fixtures/init-corpus/setup.sh
#
# Downloads, sha256-verifies, and extracts every fixture listed in
# MANIFEST.json into ./extracted/. Designed to be re-runnable and safe to
# call from CI: existing extracted dirs with matching checksums are left
# alone.
#
# Output layout:
#   tests/fixtures/init-corpus/
#     .cache/<sha256>.tar.gz       <- raw tarballs (cacheable in GH Actions)
#     extracted/<extractedDir>/    <- top-level dir from inside the tarball
#
# Environment overrides (used by the mirror-test workflow, not by the
# release gate itself):
#   AQE_CORPUS_MANIFEST_PATH   override the MANIFEST.json path (for tests
#                              that want to inject broken primary URLs)
#   AQE_CORPUS_FORCE_MIRROR=1  skip the primary URL and go straight to
#                              the mirror — used by the weekly mirror
#                              reachability test
#
# Exit codes:
#   0  every fixture in MANIFEST.json is downloaded and extracted
#   1  manifest parse error or required tool missing
#   2  one or more downloads failed (both primary and mirror, where applicable)
#   3  one or more sha256 mismatches (treated as fatal — never overwrite)
#   4  one or more extractions failed
#

set -euo pipefail

CORPUS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${AQE_CORPUS_MANIFEST_PATH:-${CORPUS_DIR}/MANIFEST.json}"
CACHE_DIR="${CORPUS_DIR}/.cache"
EXTRACT_DIR="${CORPUS_DIR}/extracted"
FORCE_MIRROR="${AQE_CORPUS_FORCE_MIRROR:-0}"

mkdir -p "${CACHE_DIR}" "${EXTRACT_DIR}"

# Tool guards — fail fast and clearly if the runner is missing something
for tool in jq curl sha256sum tar; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "ERROR: required tool '${tool}' not found in PATH" >&2
    exit 1
  fi
done

if [[ ! -f "${MANIFEST}" ]]; then
  echo "ERROR: ${MANIFEST} not found" >&2
  exit 1
fi

fixture_count=$(jq '.fixtures | length' "${MANIFEST}")
echo "[corpus] manifest: ${MANIFEST} (${fixture_count} fixtures)"
if [[ "${FORCE_MIRROR}" == "1" ]]; then
  echo "[corpus] AQE_CORPUS_FORCE_MIRROR=1 — primary URLs will be skipped"
fi

download_failures=0
checksum_failures=0
extract_failures=0
processed=0
skipped_no_tarball=0

# download_and_verify <url> <expected_sha256> <cache_path> <label>
#   Downloads url to cache_path.tmp, verifies sha256, and atomically moves
#   into place. Returns 0 on success, 1 on download failure, 2 on sha256
#   mismatch. Never leaves a tampered cache file in place on sha mismatch
#   (but DOES leave a good cache file, which is why success is idempotent).
download_and_verify() {
  local url="$1"
  local expected="$2"
  local cache_path="$3"
  local label="$4"

  # Cache hit?
  if [[ -f "${cache_path}" ]]; then
    local cached_sum
    cached_sum=$(sha256sum "${cache_path}" | awk '{print $1}')
    if [[ "${cached_sum}" == "${expected}" ]]; then
      echo "[corpus]   ${label}: cache hit"
      return 0
    fi
    echo "[corpus]   ${label}: cache miss (stale cache, re-downloading)"
    rm -f "${cache_path}"
  fi

  if ! curl -fSL --retry 3 --retry-delay 2 -o "${cache_path}.tmp" "${url}"; then
    rm -f "${cache_path}.tmp"
    return 1
  fi

  local actual_sum
  actual_sum=$(sha256sum "${cache_path}.tmp" | awk '{print $1}')
  if [[ "${actual_sum}" != "${expected}" ]]; then
    echo "[corpus]   ${label}: sha256 mismatch (expected ${expected}, got ${actual_sum})" >&2
    rm -f "${cache_path}.tmp"
    return 2
  fi

  mv "${cache_path}.tmp" "${cache_path}"
  return 0
}

for i in $(seq 0 $((fixture_count - 1))); do
  id=$(jq -r ".fixtures[${i}].id" "${MANIFEST}")
  has_tarball=$(jq -r ".fixtures[${i}].tarball != null" "${MANIFEST}")

  if [[ "${has_tarball}" != "true" ]]; then
    echo "[corpus] ${id}: no tarball (in-tree fixture, skipping download)"
    skipped_no_tarball=$((skipped_no_tarball + 1))
    continue
  fi

  url=$(jq -r ".fixtures[${i}].tarball.url" "${MANIFEST}")
  mirror_url=$(jq -r ".fixtures[${i}].tarball.mirror // \"\"" "${MANIFEST}")
  sha256=$(jq -r ".fixtures[${i}].tarball.sha256" "${MANIFEST}")
  size=$(jq -r ".fixtures[${i}].tarball.sizeBytes" "${MANIFEST}")
  extracted_dir=$(jq -r ".fixtures[${i}].extractedDir" "${MANIFEST}")

  cache_path="${CACHE_DIR}/${sha256}.tar.gz"
  extract_path="${EXTRACT_DIR}/${extracted_dir}"

  echo "[corpus] ${id}: ${url}"
  echo "[corpus]   sha256=${sha256} (${size} bytes)"

  # 1. Download + verify (try primary, fall back to mirror on failure or sha mismatch).
  #    Mirror is only consulted after primary has been attempted (or when
  #    AQE_CORPUS_FORCE_MIRROR=1). A successful fallback logs a loud
  #    WARNING so CI logs surface codeload drift even when the job is green.
  rc=99
  if [[ "${FORCE_MIRROR}" != "1" ]]; then
    download_and_verify "${url}" "${sha256}" "${cache_path}" "primary"
    rc=$?
  fi

  if [[ "${rc}" -ne 0 ]]; then
    if [[ -z "${mirror_url}" || "${mirror_url}" == "null" ]]; then
      if [[ "${FORCE_MIRROR}" == "1" ]]; then
        echo "[corpus]   ERROR: FORCE_MIRROR set but ${id} has no mirror URL in MANIFEST" >&2
        download_failures=$((download_failures + 1))
        continue
      fi
      if [[ "${rc}" -eq 2 ]]; then
        echo "[corpus]   FATAL: primary sha256 mismatch and no mirror configured for ${id}" >&2
        checksum_failures=$((checksum_failures + 1))
      else
        echo "[corpus]   ERROR: primary download failed and no mirror configured for ${id}" >&2
        download_failures=$((download_failures + 1))
      fi
      continue
    fi

    if [[ "${FORCE_MIRROR}" != "1" ]]; then
      if [[ "${rc}" -eq 2 ]]; then
        echo "[corpus]   WARNING: primary sha256 mismatch for ${id} — codeload may have drifted. Falling back to mirror." >&2
      else
        echo "[corpus]   WARNING: primary download failed for ${id}. Falling back to mirror." >&2
      fi
    fi

    download_and_verify "${mirror_url}" "${sha256}" "${cache_path}" "mirror"
    mrc=$?
    if [[ "${mrc}" -eq 1 ]]; then
      echo "[corpus]   ERROR: mirror download also failed for ${id} (${mirror_url})" >&2
      download_failures=$((download_failures + 1))
      continue
    elif [[ "${mrc}" -eq 2 ]]; then
      echo "[corpus]   FATAL: mirror sha256 mismatch for ${id} — mirror asset corrupted or wrong file" >&2
      checksum_failures=$((checksum_failures + 1))
      continue
    fi
    echo "[corpus]   WARNING: using mirror for ${id} (primary unavailable)" >&2
  fi

  # 2. sha256 is already verified by download_and_verify. Belt-and-suspenders
  #    check here catches the case where the cache file was hit without
  #    re-verification (cache hit path inside download_and_verify already
  #    verifies, so this re-check is defense in depth against future edits).
  actual_sum=$(sha256sum "${cache_path}" | awk '{print $1}')
  if [[ "${actual_sum}" != "${sha256}" ]]; then
    echo "[corpus]   FATAL: post-download sha256 drift for ${id} (should be impossible)" >&2
    checksum_failures=$((checksum_failures + 1))
    continue
  fi

  # 3. Extract (idempotent — re-extract is fine, but skip if dir already populated)
  if [[ -d "${extract_path}" ]] && [[ -n "$(ls -A "${extract_path}" 2>/dev/null || true)" ]]; then
    echo "[corpus]   already extracted at extracted/${extracted_dir}"
  else
    rm -rf "${extract_path}"
    if ! tar -xzf "${cache_path}" -C "${EXTRACT_DIR}"; then
      echo "[corpus]   ERROR: extraction failed for ${id}" >&2
      extract_failures=$((extract_failures + 1))
      continue
    fi
    if [[ ! -d "${extract_path}" ]]; then
      echo "[corpus]   ERROR: expected extractedDir ${extracted_dir} not found after extract" >&2
      extract_failures=$((extract_failures + 1))
      continue
    fi
    echo "[corpus]   extracted -> extracted/${extracted_dir}"
  fi

  processed=$((processed + 1))
done

echo ""
echo "[corpus] summary:"
echo "[corpus]   downloaded/extracted: ${processed}"
echo "[corpus]   in-tree (no download): ${skipped_no_tarball}"
echo "[corpus]   download failures:    ${download_failures}"
echo "[corpus]   checksum failures:    ${checksum_failures}"
echo "[corpus]   extract failures:     ${extract_failures}"

if (( checksum_failures > 0 )); then
  exit 3
fi
if (( download_failures > 0 )); then
  exit 2
fi
if (( extract_failures > 0 )); then
  exit 4
fi
exit 0
