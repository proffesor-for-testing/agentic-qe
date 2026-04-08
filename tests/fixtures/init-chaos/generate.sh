#!/usr/bin/env bash
#
# tests/fixtures/init-chaos/generate.sh
#
# Generates 6 pathological project shapes for the weekly init-chaos
# workflow. Each shape exercises a file pattern that the everyday-real
# corpus (tests/fixtures/init-corpus/) deliberately does NOT cover —
# the corpus is for everyday-real failure modes, this is for adversarial-
# rare ones. See issue #410 for the rationale.
#
# Why synthetic generation here when tests/fixtures/init-corpus/README.md
# explicitly bans it? Because chaos tests need controlled adversarial
# inputs that don't exist in any real public repo. The lesson from
# #401 ("synthetic fixtures hide real-world content bugs") applies to
# regression markers, not to chaos tests — chaos tests are about
# proving the watchdog catches a hang on a known-bad input, not about
# proving init handles a real codebase. This is the one place where
# synthetic generation is the right tool.
#
# Usage:
#   ./generate.sh <output-dir>
#     creates <output-dir>/<shape-id>/ for each chaos shape, each
#     containing a minimal package.json + the pathological file(s).
#
# The shapes:
#   1. utf16le-bom         file in src/ encoded UTF-16LE with BOM
#   2. mixed-line-endings  file with CRLF in the middle of an LF file
#   3. symlink-loop        a -> b -> a in src/
#   4. binary-as-text      PNG bytes in a .ts file
#   5. minified-bundle     ~256 KB on a single line in src/
#   6. control-chars       NULs and ESC sequences in identifier positions
#
# Exit codes:
#   0  every shape generated
#   1  usage / argument error
#   2  filesystem write failed
#

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <output-dir>" >&2
  exit 1
fi

OUT="$1"
mkdir -p "$OUT" || { echo "ERROR: cannot mkdir $OUT" >&2; exit 2; }

# Each chaos project has a minimal package.json so aqe init has
# something to anchor on (it expects a node project root).
write_package_json() {
  local dir="$1"
  local name="$2"
  cat > "$dir/package.json" <<EOF
{
  "name": "chaos-${name}",
  "version": "0.0.0",
  "private": true,
  "description": "init-chaos fixture: ${name}"
}
EOF
}

# ---------------------------------------------------------------------------
# Shape 1 — UTF-16LE BOM
# ---------------------------------------------------------------------------
shape_utf16le_bom() {
  local dir="$OUT/utf16le-bom"
  mkdir -p "$dir/src"
  write_package_json "$dir" "utf16le-bom"
  # printf the BOM (FF FE) then convert TS source to UTF-16LE.
  printf '\xff\xfe' > "$dir/src/index.ts"
  printf 'export const greeting: string = "hello chaos";\n' \
    | iconv -f UTF-8 -t UTF-16LE >> "$dir/src/index.ts"
}

# ---------------------------------------------------------------------------
# Shape 2 — mixed line endings (CRLF in the middle of an LF file)
# ---------------------------------------------------------------------------
shape_mixed_line_endings() {
  local dir="$OUT/mixed-line-endings"
  mkdir -p "$dir/src"
  write_package_json "$dir" "mixed-line-endings"
  {
    printf 'export function a(): number {\n'
    printf '  return 1;\n'
    # CRLF in the middle:
    printf '}\r\n'
    printf 'export function b(): number {\n'
    printf '  return 2;\n'
    printf '}\n'
  } > "$dir/src/index.ts"
}

# ---------------------------------------------------------------------------
# Shape 3 — symlink loop a -> b -> a in src/
# ---------------------------------------------------------------------------
shape_symlink_loop() {
  local dir="$OUT/symlink-loop"
  mkdir -p "$dir/src"
  write_package_json "$dir" "symlink-loop"
  # Real source file so init has something legitimate to scan first.
  echo 'export const real = true;' > "$dir/src/real.ts"
  # The loop: a points to b, b points to a. Anything walking this
  # naively will recurse forever.
  ln -s b "$dir/src/a"
  ln -s a "$dir/src/b"
}

# ---------------------------------------------------------------------------
# Shape 4 — binary content (PNG header bytes) in a .ts file
# ---------------------------------------------------------------------------
shape_binary_as_text() {
  local dir="$OUT/binary-as-text"
  mkdir -p "$dir/src"
  write_package_json "$dir" "binary-as-text"
  # 8-byte PNG signature followed by ~64 bytes of pseudo-random binary.
  # Saved with a .ts extension to deliberately mislead the indexer's
  # extension-based language detection.
  printf '\x89PNG\r\n\x1a\n' > "$dir/src/decoy.ts"
  head -c 64 /dev/urandom >> "$dir/src/decoy.ts"
}

# ---------------------------------------------------------------------------
# Shape 5 — minified bundle in src/
# ---------------------------------------------------------------------------
shape_minified_bundle() {
  local dir="$OUT/minified-bundle"
  mkdir -p "$dir/src"
  write_package_json "$dir" "minified-bundle"
  # ~256 KB on a single line. Many parsers handle long lines fine,
  # but some tokenizers backtrack quadratically — that's the failure
  # mode this catches.
  python3 -c "
import sys
chunk = '!function(t,e){for(var n=0;n<t.length;n++)e(t[n],n);};'
out = 'var x=' + (chunk * 4500) + '0;\n'
sys.stdout.write(out)
" > "$dir/src/bundle.min.js"
}

# ---------------------------------------------------------------------------
# Shape 6 — control characters in identifier positions
# ---------------------------------------------------------------------------
shape_control_chars() {
  local dir="$OUT/control-chars"
  mkdir -p "$dir/src"
  write_package_json "$dir" "control-chars"
  # NULs and ESC sequences inside what looks like a TS identifier.
  # Many parsers either choke or silently truncate on these.
  python3 -c "
import sys
sys.stdout.buffer.write(b'export const ')
sys.stdout.buffer.write(b'foo\x00bar')          # embedded NUL
sys.stdout.buffer.write(b' = 1;\n')
sys.stdout.buffer.write(b'export const baz\x1b[31m = 2;\n')  # ESC color code
" > "$dir/src/index.ts"
}

shape_utf16le_bom
shape_mixed_line_endings
shape_symlink_loop
shape_binary_as_text
shape_minified_bundle
shape_control_chars

echo "Generated 6 chaos shapes in $OUT:"
for d in "$OUT"/*/; do
  echo "  $(basename "$d") — $(find "$d" -type f | wc -l) regular file(s), $(find "$d" -type l | wc -l) symlink(s)"
done
